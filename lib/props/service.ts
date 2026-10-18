import "server-only";
import { and, asc, eq, inArray, desc } from "drizzle-orm";
import { z, ZodError } from "zod";
import { getDb } from "@/db/client";
import {
  tradingAccounts,
  propPhases,
  propRuleVersions,
  propSnapshots,
  propEvents,
  propPayouts,
  propPayoutEvents,
  balanceAdjustments,
  importBatches,
} from "@/db/schema";
import { requireUser } from "@/lib/session";
import { getPreferences } from "@/lib/preferences";
import { listTradingAccounts, NotFoundError } from "@/lib/accounts/service";
import { getJournal } from "@/lib/journal/service";
import { ReviewError } from "@/lib/reviews/model";
import { WorkspaceUnavailableError } from "@/lib/server-error";
import {
  phaseProgress,
  overlaps,
  type Phase,
  type RuleVersion,
  type Snapshot,
} from "./model";
import { D, PROCESSING_VERSION } from "@/lib/journal/processing";
import { propMutation, localInstant } from "./validation";
import { normalizePreset } from "./presets";
import { activitySummary } from "./setup-model";
import { firmSession, trackingProgress } from "./tracking-calculations";
import type { SnapshotDetails, TrackingRules } from "./tracking-rules";

function serializePhase(p: typeof propPhases.$inferSelect): Phase {
  return {
    id: p.id,
    tradingAccountId: p.tradingAccountId,
    previousId: p.previousId,
    kind: p.kind,
    label: p.label,
    startAt: p.startAt.toISOString(),
    endAt: p.endAt?.toISOString() ?? null,
    baseline: p.baseline,
    historyConfirmed: p.historyConfirmed,
    status: p.status,
    statusAt: p.statusAt.toISOString(),
    note: p.note,
  };
}
export async function propData(accountId?: string, headers?: Headers) {
  const user = await requireUser(headers);
  if (accountId) z.uuid().parse(accountId);
  try {
    const accounts = await listTradingAccounts(headers),
      preferences = await getPreferences(headers);
    return await getDb().transaction(
      async (db) => {
        const [
          journal,
          phaseRows,
          ruleRows,
          snapshotRows,
          events,
          cash,
          imports,
          payouts,
          payoutAudit,
        ] = await Promise.all([
          getJournal(headers, db),
          db
            .select()
            .from(propPhases)
            .where(eq(propPhases.ownerId, user.id))
            .orderBy(asc(propPhases.startAt)),
          db
            .select()
            .from(propRuleVersions)
            .where(eq(propRuleVersions.ownerId, user.id))
            .orderBy(asc(propRuleVersions.effectiveAt)),
          db
            .select()
            .from(propSnapshots)
            .where(eq(propSnapshots.ownerId, user.id))
            .orderBy(desc(propSnapshots.asOf)),
          db
            .select()
            .from(propEvents)
            .where(eq(propEvents.ownerId, user.id))
            .orderBy(desc(propEvents.at)),
          db
            .select()
            .from(balanceAdjustments)
            .where(eq(balanceAdjustments.ownerId, user.id)),
          db
            .select({
              accountId: importBatches.tradingAccountId,
              at: importBatches.createdAt,
            })
            .from(importBatches)
            .where(eq(importBatches.ownerId, user.id))
            .orderBy(desc(importBatches.createdAt)),
          db.select().from(propPayouts).where(eq(propPayouts.ownerId, user.id)),
          db
            .select()
            .from(propPayoutEvents)
            .where(eq(propPayoutEvents.ownerId, user.id))
            .orderBy(desc(propPayoutEvents.createdAt)),
        ]);
        if (accountId && !accounts.some((a) => a.id === accountId))
          throw new NotFoundError();
        const versions: RuleVersion[] = ruleRows.map((r) => ({
          id: r.id,
          phaseId: r.phaseId,
          effectiveAt: r.effectiveAt.toISOString(),
          rules: r.rules,
        }));
        const snapshots: Snapshot[] = snapshotRows.map((s) => ({
          id: s.id,
          phaseId: s.phaseId,
          asOf: s.asOf.toISOString(),
          balance: s.balance,
          threshold: s.threshold,
          qualifyingDays: s.qualifyingDays,
          details: s.details,
          note: s.note,
        }));
        const now = new Date().toISOString();
        return {
          userId: user.id,
          timezone: preferences.displayTimezone,
          asOf: now,
          accounts: accounts
            .filter((a) => !accountId || a.id === accountId)
            .map((a) => ({
              account: a,
              activity: activitySummary(
                journal.portions.filter((p) => p.tradingAccountId === a.id),
                journal.fees,
                a.reportingTimezone,
              ),
              needsProcessing: journal.unprocessedAccounts.includes(a.id),
              latestActivity:
                journal.portions
                  .filter((p) => p.tradingAccountId === a.id)
                  .map((p) => (p.boughtAt > p.soldAt ? p.boughtAt : p.soldAt))
                  .sort()
                  .at(-1) ?? null,
              latestImport:
                imports.find((i) => i.accountId === a.id)?.at.toISOString() ??
                null,
              phases: phaseRows
                .filter((p) => p.tradingAccountId === a.id)
                .map((p) =>
                  phaseProgress(
                    serializePhase(p),
                    versions.filter((v) => v.phaseId === p.id),
                    journal.portions,
                    journal.fees,
                    cash.map((c) => ({
                      ...c,
                      effectiveAt: c.effectiveAt.toISOString(),
                    })),
                    snapshots,
                    now,
                    journal.unprocessedAccounts.includes(a.id) ||
                      journal.states.some(
                        (s) =>
                          s.accountId === a.id &&
                          (s.status !== "Ready" ||
                            s.version !== PROCESSING_VERSION),
                      ),
                    payouts.map((p) => ({
                      ...p.fields,
                      id: p.id,
                      phaseId: p.phaseId,
                      revision: p.revision,
                      deductionId: p.deductionId,
                    })),
                  ),
                ),
            })),
          events: events.map((e) => ({
            id: e.id,
            phaseId: e.phaseId,
            at: e.at.toISOString(),
            kind: e.kind,
            note: e.note,
          })),
          copySources: ruleRows.map((r) => ({
            id: r.id,
            label: `${accounts.find((a) => a.id === phaseRows.find((p) => p.id === r.phaseId)?.tradingAccountId)?.displayName ?? "Account"} · ${r.effectiveAt.toISOString().slice(0, 10)}`,
          })),
          payouts: payouts.map((p) => ({
            ...p.fields,
            id: p.id,
            phaseId: p.phaseId,
            revision: p.revision,
            deductionId: p.deductionId,
          })),
          payoutAudit: payoutAudit.map((e) => ({
            id: e.id,
            payoutId: e.payoutId,
            revision: e.revision,
            before: e.before,
            after: e.after,
            at: e.createdAt.toISOString(),
          })),
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof ZodError) throw e;
    throw new WorkspaceUnavailableError();
  }
}
export type PropData = Awaited<ReturnType<typeof propData>>;
export async function saveProp(
  input: unknown,
  headers?: Headers,
  transaction?: import("@/lib/accounts/service").AccountTx,
) {
  const user = await requireUser(headers),
    q = propMutation.parse(input),
    now = new Date();
  const bad = (message: string): never => {
    throw new ReviewError(message, 400);
  };
  if (q.action === "phase" && q.initialRules?.tracking)
    q.initialRules.tracking = normalizePreset(q.initialRules.tracking);
  if (q.action === "rules" && q.rules.tracking)
    q.rules.tracking = normalizePreset(q.rules.tracking);
  const openingDetails =
    q.action === "phase" || q.action === "rules"
      ? q.openingSnapshot
      : q.action === "snapshot"
        ? q.details
        : null;
  if (
    openingDetails?.coverageThrough &&
    openingDetails.coverageThrough > now.toISOString()
  )
    bad("Activity coverage cannot be confirmed into the future.");
  if (
    openingDetails &&
    new Set(openingDetails.daily.map((d) => d.date)).size !==
      openingDetails.daily.length
  )
    bad("Opening daily dates must be unique.");
  try {
    const work = async (tx: import("@/lib/accounts/service").AccountTx) => {
      let previous: typeof propPhases.$inferSelect | undefined;
      if (q.action === "phase" && q.previousId) {
        [previous] = await tx
          .select()
          .from(propPhases)
          .where(
            and(
              eq(propPhases.id, q.previousId),
              eq(propPhases.ownerId, user.id),
            ),
          );
        if (!previous) throw new NotFoundError();
      }
      // All writes take account locks in stable order, including cross-account transitions.
      const ids = [
        ...new Set([
          q.accountId,
          ...(previous ? [previous.tradingAccountId] : []),
        ]),
      ].sort();
      const locked = await tx
        .select()
        .from(tradingAccounts)
        .where(
          and(
            eq(tradingAccounts.ownerId, user.id),
            inArray(tradingAccounts.id, ids),
          ),
        )
        .orderBy(asc(tradingAccounts.id))
        .for("update");
      const account = locked.find((a) => a.id === q.accountId);
      if (!account || account.archivedAt || locked.length !== ids.length)
        throw new NotFoundError();
      if (q.action === "phase" && !account.firm && !q.initialRules?.tracking)
        bad(
          "Choose a prop firm and phase in account settings before starting prop tracking.",
        );
      const instant = (local: string) => {
        try {
          return localInstant(local, account.reportingTimezone);
        } catch (e) {
          return bad(e instanceof Error ? e.message : "Invalid local time.");
        }
      };
      const validateOpening = (
        details: SnapshotDetails | undefined,
        cutoff: string,
        policy: TrackingRules | undefined,
      ) => {
        if (!details) return;
        if (details.cycleStartedAt && details.cycleStartedAt > cutoff)
          bad(
            "The opening payout cycle cannot start after the snapshot cutoff.",
          );
        if (policy && details.daily.length) {
          let date: string;
          try {
            date = firmSession(cutoff, policy).date;
          } catch {
            return bad(
              "Confirm a valid firm session before recording opening days.",
            );
          }
          if (details.daily.some((d) => d.date > date))
            bad(
              "Opening daily values cannot include sessions after the snapshot cutoff.",
            );
        }
      };
      const ownedPhases = await tx
        .select()
        .from(propPhases)
        .where(
          and(
            eq(propPhases.ownerId, user.id),
            inArray(propPhases.tradingAccountId, ids),
          ),
        )
        .for("update");
      if (q.action === "phase") {
        if (
          q.initialRules?.tracking &&
          (q.initialRules.tracking.stage === "Evaluation") !==
            (q.kind === "Evaluation")
        )
          bad("Select the matching phase kind for these rules.");
        const startAt = instant(q.startLocal);
        validateOpening(q.openingSnapshot, startAt, q.initialRules?.tracking);
        if (startAt > now.toISOString())
          bad("Start a phase at a past or current timestamp.");
        previous = q.previousId
          ? ownedPhases.find((p) => p.id === q.previousId)
          : undefined;
        if (q.previousId && !previous) throw new NotFoundError();
        if (
          previous &&
          (startAt <= previous.startAt.toISOString() ||
            startAt < previous.statusAt.toISOString() ||
            (previous.endAt && startAt < previous.endAt.toISOString()))
        )
          bad("The new period must follow the previous phase without overlap.");
        if (
          ownedPhases.some(
            (p) =>
              p.tradingAccountId === q.accountId &&
              p.id !== previous?.id &&
              overlaps(
                { startAt, endAt: null },
                {
                  startAt: p.startAt.toISOString(),
                  endAt: p.endAt?.toISOString() ?? null,
                },
              ),
          )
        )
          bad(
            "This account already has an overlapping phase. Use the reset/transition action for that phase.",
          );
        if (previous && !previous.endAt) {
          const boundaryRules = await tx
            .select()
            .from(propRuleVersions)
            .where(
              and(
                eq(propRuleVersions.ownerId, user.id),
                eq(propRuleVersions.phaseId, previous.id),
              ),
            );
          const boundarySnapshots = await tx
            .select()
            .from(propSnapshots)
            .where(
              and(
                eq(propSnapshots.ownerId, user.id),
                eq(propSnapshots.phaseId, previous.id),
              ),
            );
          if (
            boundaryRules.some((r) => r.effectiveAt.toISOString() >= startAt) ||
            boundarySnapshots.some((s) => s.asOf.toISOString() >= startAt)
          )
            bad(
              "The reset boundary must follow already-saved rule/snapshot observations.",
            );
          if (previous.tradingAccountId !== account.id)
            await tx
              .update(tradingAccounts)
              .set({
                status: previous.status === "Passed" ? "Passed" : "Closed",
                updatedAt: now,
              })
              .where(
                and(
                  eq(tradingAccounts.id, previous.tradingAccountId),
                  eq(tradingAccounts.ownerId, user.id),
                ),
              );

          await tx
            .update(propPhases)
            .set({
              endAt: new Date(startAt),
              status: previous.status === "Passed" ? "Passed" : "Closed",
              statusAt: new Date(startAt),
            })
            .where(
              and(
                eq(propPhases.id, previous.id),
                eq(propPhases.ownerId, user.id),
              ),
            );
          await tx.insert(propEvents).values({
            ownerId: user.id,
            phaseId: previous.id,
            at: new Date(startAt),
            kind:
              q.kind === previous.kind ? "Reset boundary" : "Phase transition",
            note: q.note,
          });
        }
        const [created] = await tx
          .insert(propPhases)
          .values({
            ownerId: user.id,
            tradingAccountId: account.id,
            previousId: previous?.id ?? null,
            kind: q.kind,
            label: q.label,
            startAt: new Date(startAt),
            baseline: q.baseline,
            historyConfirmed: q.historyConfirmed,
            statusAt: new Date(startAt),
            note: q.note,
          })
          .returning();
        await tx.insert(propEvents).values({
          ownerId: user.id,
          phaseId: created.id,
          at: new Date(startAt),
          kind: previous ? "New phase/reset" : "Tracking started",
          note: q.note,
        });
        if (q.initialRules)
          await tx.insert(propRuleVersions).values({
            ownerId: user.id,
            phaseId: created.id,
            effectiveAt: new Date(startAt),
            rules: q.initialRules,
          });
        if (q.openingSnapshot && q.baseline !== null)
          await tx.insert(propSnapshots).values({
            ownerId: user.id,
            phaseId: created.id,
            asOf: new Date(startAt),
            balance: q.baseline,
            threshold:
              q.initialRules?.tracking?.drawdown.initialThreshold ?? null,
            details: q.openingSnapshot,
            qualifyingDays: q.openingSnapshot.qualifyingDays,
            note: "Initial dashboard anchor; earlier compliance remains unverified.",
          });
        await tx
          .update(tradingAccounts)
          .set({
            stage: q.kind,
            status: "Active",
            startDate: account.startDate ?? q.startLocal.slice(0, 10),
            updatedAt: now,
          })
          .where(
            and(
              eq(tradingAccounts.id, account.id),
              eq(tradingAccounts.ownerId, user.id),
            ),
          );
        return { saved: true, phaseId: created.id, accountId: account.id };
      }
      const phase = ownedPhases.find(
        (p) => p.id === q.phaseId && p.tradingAccountId === account.id,
      );
      if (!phase) throw new NotFoundError();
      const within = (at: string) => {
        if (
          at < phase.startAt.toISOString() ||
          (phase.endAt && at >= phase.endAt.toISOString())
        )
          bad(
            "Timestamp must be inside the selected phase's exclusive-end period.",
          );
      };
      if (q.action === "baseline") {
        await tx
          .update(propPhases)
          .set({ baseline: q.baseline, historyConfirmed: q.historyConfirmed })
          .where(
            and(eq(propPhases.id, phase.id), eq(propPhases.ownerId, user.id)),
          );
        await tx.insert(propEvents).values({
          ownerId: user.id,
          phaseId: phase.id,
          at: now,
          kind: "Explicit baseline/history confirmation",
          note: `Original cutoff ${phase.startAt.toISOString()}; baseline ${phase.baseline ?? "unavailable"} → ${q.baseline ?? "unavailable"}; history confirmed ${phase.historyConfirmed} → ${q.historyConfirmed}. ${q.note}`,
        });
      } else if (q.action === "rules" || q.action === "copy") {
        const at = instant(q.effectiveLocal);
        within(at);
        let rules;
        if (q.action === "copy") {
          const [source] = await tx
            .select()
            .from(propRuleVersions)
            .where(
              and(
                eq(propRuleVersions.id, q.sourceRuleId),
                eq(propRuleVersions.ownerId, user.id),
              ),
            );
          if (!source) throw new NotFoundError();
          return {
            saved: false,
            phaseId: phase.id,
            accountId: account.id,
            effectiveLocal: q.effectiveLocal,
            rules: {
              ...source.rules,
              daySettingsConfirmed: false,
              startingHighWater: null,
            },
          };
        } else rules = q.rules;
        if (rules.tracking) {
          const [priorRule] = await tx
            .select()
            .from(propRuleVersions)
            .where(
              and(
                eq(propRuleVersions.phaseId, phase.id),
                eq(propRuleVersions.ownerId, user.id),
              ),
            )
            .orderBy(desc(propRuleVersions.effectiveAt))
            .limit(1);
          if (
            priorRule?.rules.tracking &&
            priorRule.rules.tracking.stage !== rules.tracking.stage
          )
            bad(
              "A stage transition starts a new phase; it cannot revise the current phase in place.",
            );
        }
        if (
          rules.tracking &&
          (rules.tracking.stage === "Evaluation") !==
            (phase.kind === "Evaluation")
        )
          bad(
            "A stage transition requires a new phase with its own balance; it cannot correct the current phase.",
          );
        const [existing] = await tx
          .select({ id: propRuleVersions.id })
          .from(propRuleVersions)
          .where(
            and(
              eq(propRuleVersions.phaseId, phase.id),
              eq(propRuleVersions.ownerId, user.id),
              eq(propRuleVersions.effectiveAt, new Date(at)),
            ),
          );
        if (existing)
          bad(
            "A rule version already starts at this timestamp. Choose a later effective time; saved versions are preserved.",
          );
        await tx.insert(propRuleVersions).values({
          ownerId: user.id,
          phaseId: phase.id,
          effectiveAt: new Date(at),
          rules,
        });
        if (q.action === "rules" && q.openingSnapshot) {
          validateOpening(q.openingSnapshot, at, q.rules.tracking);
          // The existing phase's ledger baseline is never overwritten by a later snapshot.
          const balance = q.snapshotBalance;
          if (balance === null || balance === undefined)
            bad(
              "Provide the confirmed dashboard balance for the opening snapshot.",
            );
          await tx.insert(propSnapshots).values({
            ownerId: user.id,
            phaseId: phase.id,
            asOf: new Date(at),
            balance: balance!,
            threshold: q.rules.tracking?.drawdown.initialThreshold ?? null,
            details: q.openingSnapshot,
            qualifyingDays: q.openingSnapshot.qualifyingDays,
            note: "Dashboard tracking anchor; phase baseline/history preserved.",
          });
        }
        await tx.insert(propEvents).values({
          ownerId: user.id,
          phaseId: phase.id,
          at: new Date(at),
          kind: "Rule version added",
          note: "Requirements apply from their effective timestamp; profit and qualifying days remain phase-to-date.",
        });
      } else if (q.action === "snapshot") {
        const at = instant(q.asOfLocal);
        within(at);
        if (at > now.toISOString())
          bad("A snapshot cannot be dated in the future.");
        if (
          q.details?.coverageThrough &&
          q.details.coverageThrough > now.toISOString()
        )
          bad("Activity coverage cannot be confirmed into the future.");
        const prior = await tx
          .select()
          .from(propSnapshots)
          .where(
            and(
              eq(propSnapshots.phaseId, phase.id),
              eq(propSnapshots.ownerId, user.id),
            ),
          )
          .orderBy(desc(propSnapshots.asOf));
        const versionRows = await tx
          .select()
          .from(propRuleVersions)
          .where(
            and(
              eq(propRuleVersions.phaseId, phase.id),
              eq(propRuleVersions.ownerId, user.id),
            ),
          )
          .orderBy(asc(propRuleVersions.effectiveAt));
        const policy = versionRows
          .filter((v) => v.effectiveAt.toISOString() <= at)
          .at(-1)?.rules.tracking;
        validateOpening(q.details, at, policy);
        if (q.threshold !== null && policy) {
          const journal = await getJournal(headers, tx);
          const movements = await tx
            .select()
            .from(balanceAdjustments)
            .where(
              and(
                eq(balanceAdjustments.ownerId, user.id),
                eq(balanceAdjustments.tradingAccountId, account.id),
              ),
            );
          const payoutRows = await tx
            .select()
            .from(propPayouts)
            .where(eq(propPayouts.ownerId, user.id));
          const supported = trackingProgress(
            serializePhase(phase),
            versionRows.map((v) => ({
              id: v.id,
              phaseId: v.phaseId,
              effectiveAt: v.effectiveAt.toISOString(),
              rules: v.rules,
            })),
            journal.portions,
            journal.fees,
            movements.map((c) => ({
              ...c,
              effectiveAt: c.effectiveAt.toISOString(),
            })),
            prior.map((s) => ({ ...s, asOf: s.asOf.toISOString() })),
            payoutRows.map((p) => ({
              ...p.fields,
              id: p.id,
              phaseId: p.phaseId,
              revision: p.revision,
              deductionId: p.deductionId,
            })),
            at,
            journal.unprocessedAccounts.includes(account.id),
          );
          if (
            supported?.threshold !== null &&
            supported?.threshold !== undefined &&
            new D(q.threshold).lt(supported.threshold) &&
            !(q.details?.thresholdCorrection && q.note.trim())
          )
            bad(
              "A lower threshold than the supported history requires an explicit correction and note.",
            );
        }
        const previousSnapshot = prior.find((s) => s.asOf.toISOString() <= at);
        if (
          q.threshold !== null &&
          previousSnapshot?.threshold !== null &&
          previousSnapshot?.threshold !== undefined &&
          new D(q.threshold).lt(previousSnapshot.threshold) &&
          !(q.details?.thresholdCorrection && q.note.trim())
        )
          bad(
            "A lower confirmed threshold needs an explicit correction and an explanatory note; prior observations remain in history.",
          );
        if (
          q.details &&
          new Set(q.details.daily.map((d) => d.date)).size !==
            q.details.daily.length
        )
          bad("Opening daily dates must be unique.");
        await tx.insert(propSnapshots).values({
          ownerId: user.id,
          phaseId: phase.id,
          asOf: new Date(at),
          balance: q.balance!,
          threshold: q.threshold,
          qualifyingDays: q.qualifyingDays,
          details: q.details ?? null,
          note: q.note,
        });
      } else {
        const at = instant(q.atLocal);
        if (at > now.toISOString() || at < phase.statusAt.toISOString())
          bad(
            "Status dates must be chronological and cannot be in the future.",
          );
        if (phase.endAt)
          bad(
            "An ended phase cannot be reopened. Start a new phase/reset to preserve history.",
          );
        if (at <= phase.startAt.toISOString())
          bad("A status event must be after the phase's start.");
        const ending = ["Passed", "Failed", "Closed"].includes(q.status);
        if (ending) {
          const [futureRule] = await tx
            .select()
            .from(propRuleVersions)
            .where(
              and(
                eq(propRuleVersions.ownerId, user.id),
                eq(propRuleVersions.phaseId, phase.id),
              ),
            )
            .orderBy(desc(propRuleVersions.effectiveAt));
          const [futureSnapshot] = await tx
            .select()
            .from(propSnapshots)
            .where(
              and(
                eq(propSnapshots.ownerId, user.id),
                eq(propSnapshots.phaseId, phase.id),
              ),
            )
            .orderBy(desc(propSnapshots.asOf));
          if (
            (futureRule && futureRule.effectiveAt.toISOString() >= at) ||
            (futureSnapshot && futureSnapshot.asOf.toISOString() >= at)
          )
            bad(
              "Move the closing timestamp after saved rule/snapshot observations; history will not be deleted.",
            );
        }
        await tx
          .update(propPhases)
          .set({
            status: q.status,
            statusAt: new Date(at),
            ...(ending ? { endAt: new Date(at) } : {}),
          })
          .where(
            and(eq(propPhases.id, phase.id), eq(propPhases.ownerId, user.id)),
          );
        await tx.insert(propEvents).values({
          ownerId: user.id,
          phaseId: phase.id,
          at: new Date(at),
          kind: `User status: ${q.status}`,
          note: q.note,
        });
        await tx
          .update(tradingAccounts)
          .set({ status: q.status, updatedAt: now })
          .where(
            and(
              eq(tradingAccounts.id, account.id),
              eq(tradingAccounts.ownerId, user.id),
            ),
          );
      }
      return { saved: true, phaseId: phase.id, accountId: account.id };
    };
    return await (transaction ? work(transaction) : getDb().transaction(work));
  } catch (e) {
    if (
      e instanceof NotFoundError ||
      e instanceof ZodError ||
      e instanceof ReviewError
    )
      throw e;
    throw new WorkspaceUnavailableError();
  }
}
