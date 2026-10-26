import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  propPhases,
  propRuleVersions,
  propEvents,
  propSnapshots,
  propPayouts,
  balanceAdjustments,
  tradingAccounts,
} from "@/db/schema";
import type { Portion } from "@/lib/journal/processing";
import { localDay } from "@/lib/journal/calculations";
import { earlierImportedStart, automaticStartIsEnabled } from "./import-start";

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

// Called only inside the account's locked setup/publication transaction.
export async function alignImportedPhaseStart(
  tx: Tx,
  ownerId: string,
  accountId: string,
  parts: Portion[],
  timezone: string,
) {
  const phases = await tx
    .select()
    .from(propPhases)
    .where(
      and(
        eq(propPhases.ownerId, ownerId),
        eq(propPhases.tradingAccountId, accountId),
      ),
    )
    .for("update");
  // Reset and transition cutoffs always remain explicit.
  if (phases.length !== 1) return;
  const phase = phases[0];
  if (phase.previousId || phase.endAt || phase.status !== "Active") return;
  const events = await tx
    .select({ kind: propEvents.kind })
    .from(propEvents)
    .where(
      and(eq(propEvents.ownerId, ownerId), eq(propEvents.phaseId, phase.id)),
    );
  if (
    phase.historyConfirmed ||
    !automaticStartIsEnabled(events.map((e) => e.kind))
  )
    return;
  const start = earlierImportedStart(
    parts,
    accountId,
    phase.startAt.toISOString(),
  );
  if (!start) return;
  const [snapshots, payouts, adjustments, rules] = await Promise.all([
    tx
      .select({ id: propSnapshots.id })
      .from(propSnapshots)
      .where(
        and(
          eq(propSnapshots.ownerId, ownerId),
          eq(propSnapshots.phaseId, phase.id),
        ),
      )
      .limit(1),
    tx
      .select({ id: propPayouts.id })
      .from(propPayouts)
      .where(
        and(
          eq(propPayouts.ownerId, ownerId),
          eq(propPayouts.phaseId, phase.id),
        ),
      )
      .limit(1),
    tx
      .select({ id: balanceAdjustments.id })
      .from(balanceAdjustments)
      .where(
        and(
          eq(balanceAdjustments.ownerId, ownerId),
          eq(balanceAdjustments.tradingAccountId, accountId),
        ),
      )
      .limit(1),
    tx
      .select()
      .from(propRuleVersions)
      .where(
        and(
          eq(propRuleVersions.ownerId, ownerId),
          eq(propRuleVersions.phaseId, phase.id),
        ),
      )
      .orderBy(asc(propRuleVersions.effectiveAt))
      .limit(1),
  ]);
  // Financial anchors must be reconciled explicitly, not shifted by an import.
  if (snapshots.length || payouts.length || adjustments.length || !rules.length)
    return;
  await tx.insert(propRuleVersions).values({
    ownerId,
    phaseId: phase.id,
    effectiveAt: new Date(start),
    rules: rules[0].rules,
  });
  await tx
    .update(propPhases)
    .set({
      startAt: new Date(start),
      historyConfirmed: false,
      ...(phase.statusAt.getTime() === phase.startAt.getTime()
        ? { statusAt: new Date(start) }
        : {}),
    })
    .where(and(eq(propPhases.ownerId, ownerId), eq(propPhases.id, phase.id)));
  await tx
    .update(tradingAccounts)
    .set({ startDate: localDay(start, timezone) })
    .where(
      and(
        eq(tradingAccounts.ownerId, ownerId),
        eq(tradingAccounts.id, accountId),
      ),
    );
  await tx.insert(propEvents).values({
    ownerId,
    phaseId: phase.id,
    at: new Date(),
    kind: "Start aligned to imported activity",
    note: `Tracking start ${phase.startAt.toISOString()} -> ${start}. Earliest imported entry; opening balance unchanged. Imported history does not confirm earlier compliance. Original rule versions and sources preserved.`,
  });
}
