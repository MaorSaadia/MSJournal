import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";
import { mistakes } from "@/lib/reviews/model";

// Explicit allowlist; auth credential/session/token/rate-limit tables never enter it.
export const backupTables = [
  schema.userPreferences,
  schema.tradingAccounts,
  schema.importBatches,
  schema.importFiles,
  schema.tradovateOrders,
  schema.tradovatePerformance,
  schema.importProvenance,
  schema.journalRecords,
  schema.journalSources,
  schema.journalProcessing,
  schema.accountFeeSettings,
  schema.journalPortionFees,
  schema.balanceAdjustments,
  schema.propPhases,
  schema.propRuleVersions,
  schema.propSnapshots,
  schema.propEvents,
  schema.reviewTags,
  schema.journalReviews,
  schema.reviewSources,
  schema.reviewAttachments,
  schema.dailyEntries,
  schema.dailyTemplates,
  schema.strategies,
  schema.strategyTemplates,
  schema.strategyRevisions,
  schema.strategyAssignments,
  schema.strategyImages,
  schema.processGoals,
  schema.goalCheckins,
  schema.feeReconciliations,
  schema.feeReconciliationSources,
];
export const backupCatalog = backupTables.map((table) => {
  const config = getTableConfig(table);
  return {
    table,
    name: config.name,
    ownerColumn: config.name === "user_preferences" ? "user_id" : "owner_id",
    columns: config.columns.map((c) => c.name),
    foreignKeys: config.foreignKeys.map((key) => {
      const ref = key.reference();
      return {
        columns: ref.columns.map((c) => c.name),
        target: getTableConfig(ref.foreignTable).name,
        targetColumns: ref.foreignColumns.map((c) => c.name),
      };
    }),
  };
});
export type BackupRow = Record<string, unknown>;
export type BackupData = Record<string, BackupRow[]>;

/** Verify ownership and nested references against the same included snapshot. */
export function validateBackup(data: BackupData, ownerId: string) {
  const indexes = new Map<string, Set<string>>();
  const exists = (table: string, columns: string[], values: unknown[]) => {
    const key = table + ":" + columns.join(",");
    let index = indexes.get(key);
    if (!index) {
      index = new Set(
        (data[table] ?? []).map((row) =>
          JSON.stringify(columns.map((c) => row[c])),
        ),
      );
      indexes.set(key, index);
    }
    return index.has(JSON.stringify(values));
  };
  const fail = () => {
    throw new Error("Archive relationship validation failed.");
  };
  for (const category of backupCatalog) {
    for (const row of data[category.name] ?? []) {
      if (row[category.ownerColumn] !== ownerId) fail();
      for (const ref of category.foreignKeys) {
        const values = ref.columns.map((c) => row[c]);
        if (values.some((v) => v == null)) continue;
        if (!exists(ref.target, ref.targetColumns, values)) fail();
      }
    }
  }
  for (const row of data.journal_reviews ?? []) {
    const tags = (row.fields as { mistakes?: string[] }).mistakes ?? [];
    for (const id of tags)
      if (
        !mistakes.some(([key]) => key === id) &&
        !exists("review_tags", ["id", "owner_id"], [id, ownerId])
      )
        fail();
    for (const id of row.original_source_ids as string[])
      if (
        !exists(
          "tradovate_performance_records",
          ["id", "owner_id", "trading_account_id"],
          [id, ownerId, row.trading_account_id],
        )
      )
        fail();
  }
  for (const row of data.strategy_assignments ?? []) {
    for (const id of row.original_source_ids as string[])
      if (
        !exists(
          "tradovate_performance_records",
          ["id", "owner_id", "trading_account_id"],
          [id, ownerId, row.trading_account_id],
        )
      )
        fail();
    const revision = (data.strategy_revisions ?? []).find(
      (r) =>
        r.strategy_id === row.strategy_id &&
        r.revision === row.playbook_revision,
    );
    const checklist =
      (revision?.fields as { checklist: { id: string }[] } | undefined)
        ?.checklist ?? [];
    if (
      Object.keys(row.answers as object).some(
        (id) => !checklist.some((item) => item.id === id),
      )
    )
      fail();
  }
  for (const row of data.daily_entries ?? []) {
    const fields = row.fields as {
      plannedStrategies?: { strategyId: string; revision: number }[];
      observations: { recordId: string | null }[];
    };
    for (const plan of fields.plannedStrategies ?? [])
      if (
        !exists(
          "strategy_revisions",
          ["strategy_id", "revision", "owner_id"],
          [plan.strategyId, plan.revision, ownerId],
        )
      )
        fail();
    for (const observation of fields.observations)
      if (
        observation.recordId &&
        !exists(
          "journal_records",
          ["id", "owner_id"],
          [observation.recordId, ownerId],
        )
      )
        fail();
    for (const meta of Object.values(
      row.observation_meta as Record<
        string,
        { originalAccountId: string | null; sourceIds: string[] }
      >,
    )) {
      if (
        meta.originalAccountId &&
        !exists(
          "trading_accounts",
          ["id", "owner_id"],
          [meta.originalAccountId, ownerId],
        )
      )
        fail();
      for (const id of meta.sourceIds)
        if (
          !exists(
            "tradovate_performance_records",
            ["id", "owner_id"],
            [id, ownerId],
          )
        )
          fail();
    }
  }
}
