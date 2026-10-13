import "server-only";
import { and, eq, sql, isNull, count, desc } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import {
  strategies,
  strategyRevisions,
  strategyAssignments,
  strategyImages,
  journalRecords,
  journalSources,
  userPreferences,
} from "@/db/schema";
import { requireUser } from "@/lib/session";
import { NotFoundError } from "@/lib/accounts/service";
import { WorkspaceUnavailableError } from "@/lib/server-error";
import { ReviewError, unchangedAssociation } from "@/lib/reviews/model";
import { lockReviewAccount } from "@/lib/reviews/service";
import { storageEnabled } from "@/lib/reviews/storage";
import {
  saveStrategySchema,
  strategyAction,
  assignmentMutation,
  type StrategyData,
  type AssignmentData,
  type StrategyPlan,
} from "./model";
export type StrategyTx = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];
export async function strategySafe<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (e) {
    if (
      e instanceof ReviewError ||
      e instanceof NotFoundError ||
      e instanceof z.ZodError
    )
      throw e;
    throw new WorkspaceUnavailableError();
  }
}
export async function ownedStrategy(
  tx: StrategyTx,
  ownerId: string,
  id: string,
  lock = false,
) {
  z.uuid().parse(id);
  const query = tx
    .select()
    .from(strategies)
    .where(and(eq(strategies.ownerId, ownerId), eq(strategies.id, id)));
  const [row] = await (lock ? query.for("update") : query);
  if (!row) throw new NotFoundError();
  return row;
}
async function timezone(tx: StrategyTx, userId: string) {
  const [p] = await tx
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId));
  return p?.displayTimezone ?? "Asia/Jerusalem";
}
export async function strategyData(
  tx: StrategyTx,
  userId: string,
  id: string,
  version?: number,
): Promise<StrategyData> {
  const row = await ownedStrategy(tx, userId, id);
  const [rev] = version
    ? await tx
        .select()
        .from(strategyRevisions)
        .where(
          and(
            eq(strategyRevisions.ownerId, userId),
            eq(strategyRevisions.strategyId, id),
            eq(strategyRevisions.revision, version),
          ),
        )
    : [];
  if (version && !rev) throw new NotFoundError();
  const images = await tx
    .select()
    .from(strategyImages)
    .where(
      and(
        eq(strategyImages.ownerId, userId),
        eq(strategyImages.strategyId, id),
        eq(strategyImages.state, "ready"),
      ),
    )
    .orderBy(strategyImages.position);
  const [totals] = await tx
    .select({
      linked: sql<number>`count(*) filter(where not ${strategyAssignments.needsReassignment})::int`,
      unresolved: sql<number>`count(*) filter(where ${strategyAssignments.needsReassignment})::int`,
    })
    .from(strategyAssignments)
    .where(
      and(
        eq(strategyAssignments.ownerId, userId),
        eq(strategyAssignments.strategyId, id),
      ),
    );
  return {
    userId,
    timezone: await timezone(tx, userId),
    id,
    revision: rev?.revision ?? row.revision,
    galleryRevision: row.galleryRevision,
    status: "draft",
    fields: rev?.fields ?? row.fields,
    archived: !!row.archivedAt,
    updatedAt: row.updatedAt.toISOString(),
    storageEnabled: storageEnabled(),
    images: images.map(
      ({ id, caption, stage, position, width, height, revision }) => ({
        id,
        caption,
        stage,
        position,
        width,
        height,
        revision,
      }),
    ),
    linked: totals.linked,
    unresolved: totals.unresolved,
  };
}
export async function getStrategy(
  id: string,
  headers?: Headers,
  version?: number,
) {
  const owner = await requireUser(headers);
  return strategySafe(() =>
    getDb().transaction((tx) => strategyData(tx, owner.id, id, version)),
  );
}
export async function listStrategies(input: unknown = {}, headers?: Headers) {
  const owner = await requireUser(headers);
  const q = z
    .object({
      search: z.string().max(100).default(""),
      archived: z.enum(["active", "archived", "all"]).default("active"),
    })
    .strict()
    .parse(input);
  return strategySafe(() =>
    getDb().transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(strategies)
        .where(
          and(
            eq(strategies.ownerId, owner.id),
            q.archived === "active"
              ? isNull(strategies.archivedAt)
              : q.archived === "archived"
                ? sql`${strategies.archivedAt} is not null`
                : undefined,
            q.search
              ? sql`strpos(lower(${strategies.fields}->>'name'),lower(${q.search}))>0`
              : undefined,
          ),
        )
        .orderBy(desc(strategies.updatedAt));
      const totals = await tx
        .select({
          id: strategyAssignments.strategyId,
          n: count(),
          unresolved: sql<number>`count(*) filter(where ${strategyAssignments.needsReassignment})::int`,
        })
        .from(strategyAssignments)
        .where(eq(strategyAssignments.ownerId, owner.id))
        .groupBy(strategyAssignments.strategyId);
      return {
        userId: owner.id,
        timezone: await timezone(tx, owner.id),
        strategies: rows.map((r) => ({
          id: r.id,
          name: r.fields.name,
          description: r.fields.description,
          color: r.fields.color,
          revision: r.revision,
          archived: !!r.archivedAt,
          updatedAt: r.updatedAt.toISOString(),
          linked:
            (totals.find((t) => t.id === r.id)?.n ?? 0) -
            (totals.find((t) => t.id === r.id)?.unresolved ?? 0),
          unresolved: totals.find((t) => t.id === r.id)?.unresolved ?? 0,
        })),
      };
    }),
  );
}
export async function saveStrategy(input: unknown, headers?: Headers) {
  const owner = await requireUser(headers),
    v = saveStrategySchema.parse(input);
  return strategySafe(() =>
    getDb().transaction(async (tx) => {
      if (v.id) {
        const previous = await ownedStrategy(tx, owner.id, v.id, true);
        if (previous.archivedAt)
          throw new ReviewError("Restore this strategy before editing it.");
        if (previous.revision !== v.revision)
          throw new ReviewError(
            "This playbook changed in another tab. Compare the saved version before replacing it.",
            409,
          );
        await tx
          .update(strategies)
          .set({
            fields: v.fields,
            revision: v.revision + 1,
            updatedAt: new Date(),
          })
          .where(eq(strategies.id, v.id));
        await tx.insert(strategyRevisions).values({
          strategyId: v.id,
          ownerId: owner.id,
          revision: v.revision + 1,
          fields: v.fields,
        });
        return strategyData(tx, owner.id, v.id);
      }
      if (v.revision !== 0)
        throw new ReviewError("Invalid new strategy revision.");
      const [row] = await tx
        .insert(strategies)
        .values({ ownerId: owner.id, fields: v.fields })
        .returning();
      await tx.insert(strategyRevisions).values({
        strategyId: row.id,
        ownerId: owner.id,
        revision: 1,
        fields: v.fields,
      });
      return strategyData(tx, owner.id, row.id);
    }),
  );
}
export async function actStrategy(input: unknown, headers?: Headers) {
  const owner = await requireUser(headers),
    v = strategyAction.parse(input);
  return strategySafe(() =>
    getDb().transaction(async (tx) => {
      const row = await ownedStrategy(tx, owner.id, v.id, true);
      if (row.revision !== v.revision)
        throw new ReviewError(
          "Playbook changed. Refresh before continuing.",
          409,
        );
      if (v.action === "duplicate") {
        const fields = {
          ...row.fields,
          name: `${row.fields.name.slice(0, 90)} (copy)`,
        };
        const [copy] = await tx
          .insert(strategies)
          .values({ ownerId: owner.id, fields })
          .returning();
        await tx.insert(strategyRevisions).values({
          strategyId: copy.id,
          ownerId: owner.id,
          revision: 1,
          fields,
        });
        return strategyData(tx, owner.id, copy.id);
      }
      await tx
        .update(strategies)
        .set({
          archivedAt: v.action === "archive" ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(strategies.id, row.id));
      return strategyData(tx, owner.id, row.id);
    }),
  );
}
export async function validatePlans(
  tx: StrategyTx,
  userId: string,
  plans: StrategyPlan[],
  previous: StrategyPlan[] = [],
) {
  for (const plan of plans) {
    const row = await ownedStrategy(tx, userId, plan.strategyId);
    const [rev] = await tx
      .select()
      .from(strategyRevisions)
      .where(
        and(
          eq(strategyRevisions.ownerId, userId),
          eq(strategyRevisions.strategyId, row.id),
          eq(strategyRevisions.revision, plan.revision),
        ),
      );
    if (!rev) throw new NotFoundError();
    if (
      row.archivedAt &&
      !previous.some(
        (p) => p.strategyId === plan.strategyId && p.revision === plan.revision,
      )
    )
      throw new ReviewError(
        "Archived strategies remain in past plans; choose an active strategy for a new plan.",
      );
  }
}
export async function reconcileStrategies(
  tx: StrategyTx,
  ownerId: string,
  accountId: string,
  current: { id: string; sourceIds: string[] }[],
) {
  const rows = await tx
    .select()
    .from(strategyAssignments)
    .where(
      and(
        eq(strategyAssignments.ownerId, ownerId),
        eq(strategyAssignments.tradingAccountId, accountId),
        eq(strategyAssignments.needsReassignment, false),
      ),
    );
  for (const row of rows) {
    const target = unchangedAssociation(row.sourceIds, current);
    if (target !== row.recordId)
      await tx
        .update(strategyAssignments)
        .set({
          recordId: target,
          needsReassignment: target === null,
          revision: row.revision + 1,
          updatedAt: new Date(),
        })
        .where(eq(strategyAssignments.id, row.id));
  }
}
async function ownedRecord(tx: StrategyTx, userId: string, id: string) {
  z.uuid().parse(id);
  const [record] = await tx
    .select()
    .from(journalRecords)
    .where(
      and(
        eq(journalRecords.ownerId, userId),
        eq(journalRecords.id, id),
        eq(journalRecords.current, true),
      ),
    );
  if (!record) throw new NotFoundError();
  return record;
}
async function assignmentData(
  tx: StrategyTx,
  userId: string,
  recordId: string,
): Promise<AssignmentData> {
  await ownedRecord(tx, userId, recordId);
  const [row] = await tx
    .select()
    .from(strategyAssignments)
    .where(
      and(
        eq(strategyAssignments.ownerId, userId),
        eq(strategyAssignments.recordId, recordId),
        eq(strategyAssignments.needsReassignment, false),
      ),
    );
  let assignment: AssignmentData["assignment"] = null;
  if (row) {
    const strategy = await ownedStrategy(tx, userId, row.strategyId);
    const [rev] = await tx
      .select()
      .from(strategyRevisions)
      .where(
        and(
          eq(strategyRevisions.strategyId, row.strategyId),
          eq(strategyRevisions.ownerId, userId),
          eq(strategyRevisions.revision, row.playbookRevision),
        ),
      );
    assignment = {
      id: row.id,
      revision: row.revision,
      strategyId: row.strategyId,
      playbookRevision: row.playbookRevision,
      fields: rev.fields,
      answers: row.answers,
      archived: !!strategy.archivedAt,
      latestRevision: strategy.revision,
    };
  }
  const options = await tx
    .select()
    .from(strategies)
    .where(eq(strategies.ownerId, userId));
  return {
    userId,
    timezone: await timezone(tx, userId),
    recordId,
    assignment,
    strategies: options.map((r) => ({
      id: r.id,
      name: r.fields.name,
      revision: r.revision,
      archived: !!r.archivedAt,
    })),
  };
}
export async function getAssignment(recordId: string, headers?: Headers) {
  const owner = await requireUser(headers);
  return strategySafe(() =>
    getDb().transaction((tx) => assignmentData(tx, owner.id, recordId)),
  );
}
export async function saveAssignment(input: unknown, headers?: Headers) {
  const owner = await requireUser(headers),
    v = assignmentMutation.parse(input);
  return strategySafe(() =>
    getDb().transaction(async (tx) => {
      let record = await ownedRecord(tx, owner.id, v.recordId);
      await lockReviewAccount(tx, owner.id, record.tradingAccountId);
      record = await ownedRecord(tx, owner.id, v.recordId);
      let [old] = await tx
        .select()
        .from(strategyAssignments)
        .where(
          and(
            eq(strategyAssignments.ownerId, owner.id),
            eq(strategyAssignments.recordId, record.id),
          ),
        )
        .for("update");
      if (v.recoverId) {
        if (old)
          throw new ReviewError(
            "That record already has a strategy. Both assignments were kept.",
            409,
          );
        [old] = await tx
          .select()
          .from(strategyAssignments)
          .where(
            and(
              eq(strategyAssignments.ownerId, owner.id),
              eq(strategyAssignments.id, v.recoverId),
              eq(strategyAssignments.needsReassignment, true),
            ),
          )
          .for("update");
        if (!old || old.tradingAccountId !== record.tradingAccountId)
          throw new NotFoundError();
        if (!v.confirmReset || v.strategyId !== old.strategyId)
          throw new ReviewError(
            "Confirm recovery to one record in the original account.",
          );
      }
      if ((old?.revision ?? 0) !== v.revision)
        throw new ReviewError(
          "Assignment changed. Reload before saving; your answers are kept.",
          409,
        );
      const changed =
        !!old && (old.strategyId !== v.strategyId || v.adoptLatest);
      if (changed && !v.confirmReset)
        throw new ReviewError(
          "Confirm replacing the snapshot and resetting its checklist answers.",
        );
      if (v.strategyId === null) {
        if (old)
          await tx
            .delete(strategyAssignments)
            .where(
              and(
                eq(strategyAssignments.ownerId, owner.id),
                eq(strategyAssignments.id, old.id),
              ),
            );
        return assignmentData(tx, owner.id, record.id);
      }
      const strategy = await ownedStrategy(tx, owner.id, v.strategyId);
      if (
        strategy.archivedAt &&
        (!old || old.strategyId !== strategy.id || v.adoptLatest)
      )
        throw new ReviewError(
          "Restore this strategy before assigning or adopting it.",
        );
      const playbookRevision =
        old && !changed ? old.playbookRevision : strategy.revision;
      const [rev] = await tx
        .select()
        .from(strategyRevisions)
        .where(
          and(
            eq(strategyRevisions.ownerId, owner.id),
            eq(strategyRevisions.strategyId, strategy.id),
            eq(strategyRevisions.revision, playbookRevision),
          ),
        );
      if (
        Object.keys(v.answers).some(
          (id) => !rev.fields.checklist.some((i) => i.id === id),
        )
      )
        throw new ReviewError(
          "Answer only checklist items in the saved snapshot.",
        );
      const answers = Object.fromEntries(
        rev.fields.checklist.map((i) => [
          i.id,
          changed
            ? "Not assessed"
            : (v.answers[i.id] ?? old?.answers[i.id] ?? "Not assessed"),
        ]),
      );
      const sources = await tx
        .select()
        .from(journalSources)
        .where(
          and(
            eq(journalSources.ownerId, owner.id),
            eq(journalSources.recordId, record.id),
          ),
        );
      if (!sources.length)
        throw new ReviewError("Record is awaiting processing.", 409);
      const unresolved = await tx
        .select()
        .from(strategyAssignments)
        .where(
          and(
            eq(strategyAssignments.ownerId, owner.id),
            eq(strategyAssignments.tradingAccountId, record.tradingAccountId),
            eq(strategyAssignments.needsReassignment, true),
          ),
        );
      if (
        !v.recoverId &&
        unresolved.some((a) =>
          a.sourceIds.some((id) => sources.some((s) => s.sourceId === id)),
        )
      )
        throw new ReviewError(
          "Original classification needs recovery before assigning this regrouped record.",
          409,
        );
      const values = {
        recordId: record.id,
        strategyId: strategy.id,
        playbookRevision,
        answers,
        sourceIds: sources.map((s) => s.sourceId),
        revision: v.revision + 1,
        needsReassignment: false,
        updatedAt: new Date(),
      };
      if (old)
        await tx
          .update(strategyAssignments)
          .set(values)
          .where(eq(strategyAssignments.id, old.id));
      else
        await tx.insert(strategyAssignments).values({
          ...values,
          ownerId: owner.id,
          tradingAccountId: record.tradingAccountId,
          originalRecordId: record.id,
          originalSymbol: record.symbol,
        });
      return assignmentData(tx, owner.id, record.id);
    }),
  );
}
export async function recoveryAssignments(headers?: Headers) {
  const owner = await requireUser(headers);
  return strategySafe(() =>
    getDb().transaction(async (tx) => {
      const rows = await tx
        .select({
          assignment: strategyAssignments,
          fields: strategyRevisions.fields,
        })
        .from(strategyAssignments)
        .innerJoin(
          strategyRevisions,
          and(
            eq(strategyRevisions.ownerId, owner.id),
            eq(strategyRevisions.strategyId, strategyAssignments.strategyId),
            eq(
              strategyRevisions.revision,
              strategyAssignments.playbookRevision,
            ),
          ),
        )
        .where(
          and(
            eq(strategyAssignments.ownerId, owner.id),
            eq(strategyAssignments.needsReassignment, true),
          ),
        );
      return {
        userId: owner.id,
        timezone: await timezone(tx, owner.id),
        rows: rows.map(({ assignment: a, fields }) => ({
          id: a.id,
          accountId: a.tradingAccountId,
          revision: a.revision,
          strategyId: a.strategyId,
          fields,
          answers: a.answers,
          playbookRevision: a.playbookRevision,
          name: fields.name,
          symbol: a.originalSymbol,
          sourceIds: a.sourceIds,
        })),
      };
    }),
  );
}
export async function discardRecovery(input: unknown, headers?: Headers) {
  const owner = await requireUser(headers),
    v = z
      .object({
        id: z.uuid(),
        revision: z.number().int().positive(),
        confirmed: z.literal(true),
      })
      .strict()
      .parse(input);
  return strategySafe(() =>
    getDb().transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(strategyAssignments)
        .where(
          and(
            eq(strategyAssignments.ownerId, owner.id),
            eq(strategyAssignments.id, v.id),
          ),
        );
      if (!row) throw new NotFoundError();
      await lockReviewAccount(tx, owner.id, row.tradingAccountId);
      const [fresh] = await tx
        .select()
        .from(strategyAssignments)
        .where(
          and(
            eq(strategyAssignments.ownerId, owner.id),
            eq(strategyAssignments.id, v.id),
            eq(strategyAssignments.needsReassignment, true),
          ),
        )
        .for("update");
      if (!fresh || fresh.revision !== v.revision)
        throw new ReviewError(
          "Recovery state changed. Refresh before discarding.",
          409,
        );
      await tx
        .delete(strategyAssignments)
        .where(
          and(
            eq(strategyAssignments.ownerId, owner.id),
            eq(strategyAssignments.id, v.id),
          ),
        );
      return { discarded: true };
    }),
  );
}
