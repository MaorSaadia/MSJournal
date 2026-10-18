import "server-only";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import {
  tradingAccounts,
  propPhases,
  propRuleVersions,
  propEvents,
} from "@/db/schema";
import { requireUser } from "@/lib/session";
import {
  saveTradingAccount,
  NotFoundError,
  getTradingAccount,
} from "@/lib/accounts/service";
import { tradingAccountSchema } from "@/lib/accounts/validation";
import { ReviewError } from "@/lib/reviews/model";
import { WorkspaceUnavailableError } from "@/lib/server-error";
import { trackingRulesSchema, snapshotDetailsSchema } from "./tracking-rules";
import { saveProp } from "./service";
import { localTime, localInstant } from "./validation";
import { toLegacyRules } from "./presets";
import { getJournal } from "@/lib/journal/service";
import { portionExit } from "@/lib/journal/processing";

export async function previewSetup(
  accountId: string,
  startLocal: string,
  headers: Headers,
) {
  const account = await getTradingAccount(z.uuid().parse(accountId), headers);
  const at = localInstant(
    localTime.parse(startLocal),
    account.reportingTimezone,
  );
  const journal = await getJournal(headers);
  const parts = journal.portions.filter(
    (p) => p.tradingAccountId === account.id,
  );
  const before = parts.filter((p) => portionExit(p) < at).length;
  const crossing = parts.filter(
    (p) =>
      portionExit(p) >= at &&
      (p.boughtAt < p.soldAt ? p.boughtAt : p.soldAt) < at,
  ).length;
  return {
    included: parts.length - before - crossing,
    before,
    crossing,
    pending: journal.unprocessedAccounts.includes(account.id),
    cutoff: at,
  };
}

const setupSchema = z
  .object({
    requestId: z.uuid(),
    accountId: z.uuid().nullable(),
    phaseId: z.uuid().nullable(),
    account: tradingAccountSchema,
    rules: trackingRulesSchema,
    origin: z.enum(["start", "snapshot"]),
    startLocal: localTime,
    snapshotLocal: localTime.nullable(),
    baseline: z.string().regex(/^$|^-?\d{1,16}(?:\.\d{1,2})?$/),
    historyConfirmed: z.boolean(),
    opening: snapshotDetailsSchema,
    confirmActivity: z.boolean(),
  })
  .strict();

// Both existing mutation services share this transaction. Any validation/write
// failure rolls back identity, phase, baseline, rules and opening observation.
export async function saveGuidedSetup(input: unknown, headers: Headers) {
  const user = await requireUser(headers),
    q = setupSchema.parse(input);
  if (q.rules.consistency.status === undefined)
    q.rules.consistency.status =
      q.rules.consistency.percent === null ? "unknown" : "enabled";
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(q))
    .digest("hex");
  const marker = `setup:${q.requestId}:${fingerprint}`;
  if (!q.confirmActivity)
    throw new ReviewError(
      "Review and confirm the activity/phase preview before saving.",
      400,
    );
  if (q.origin === "snapshot" && !q.baseline)
    throw new ReviewError(
      "A current dashboard snapshot requires its confirmed balance.",
      400,
    );
  if (
    q.account.platform !== q.rules.platform ||
    q.account.nominalSize !== q.rules.size
  )
    throw new ReviewError(
      "Account size/platform must match the selected rule configuration.",
      400,
    );
  try {
    const result = await getDb().transaction(async (tx) => {
      const target = q.accountId ?? q.requestId;
      const [existing] = await tx
        .select()
        .from(tradingAccounts)
        .where(eq(tradingAccounts.id, target))
        .for("update");
      if (existing && existing.ownerId !== user.id) throw new NotFoundError();
      if (existing) {
        const [replay] = await tx
          .select()
          .from(propEvents)
          .where(
            and(
              eq(propEvents.ownerId, user.id),
              eq(propEvents.kind, "Guided setup saved"),
              eq(propEvents.note, marker),
            ),
          )
          .limit(1);
        if (replay) return { accountId: target, phaseId: replay.phaseId };
        if (!q.accountId)
          throw new ReviewError(
            "This setup request was already saved with different values. Refresh before changing it.",
            409,
          );
      } else if (q.accountId) throw new NotFoundError();
      const account = await saveTradingAccount(
        q.account,
        q.accountId ?? undefined,
        headers,
        { transaction: tx, createId: q.accountId ? undefined : target },
      );
      const start = localInstant(q.startLocal, account.reportingTimezone);
      const rawRules = toLegacyRules(q.rules);
      let phaseId: string;
      if (q.phaseId) {
        const [phase] = await tx
          .select()
          .from(propPhases)
          .where(
            and(
              eq(propPhases.id, q.phaseId),
              eq(propPhases.ownerId, user.id),
              eq(propPhases.tradingAccountId, account.id),
            ),
          )
          .for("update");
        if (!phase || phase.endAt) throw new NotFoundError();
        // This flow repairs/configures a phase. Resets/transitions retain their
        // explicit existing workflow and never silently move historic sources.
        if (phase.startAt.toISOString() !== start)
          throw new ReviewError(
            "Existing phase dates are preserved. Use the explicit reset/transition action to change boundaries.",
            400,
          );
        const [latest] = await tx
          .select()
          .from(propRuleVersions)
          .where(
            and(
              eq(propRuleVersions.phaseId, phase.id),
              eq(propRuleVersions.ownerId, user.id),
            ),
          )
          .limit(1);
        const effective =
          q.origin === "snapshot" && q.snapshotLocal
            ? localInstant(q.snapshotLocal, account.reportingTimezone)
            : latest
              ? new Date().toISOString()
              : start;
        const { wallInput } = await import("./model");
        await saveProp(
          {
            action: "baseline",
            accountId: account.id,
            phaseId: phase.id,
            baseline:
              q.origin === "snapshot" ? (phase.baseline ?? "") : q.baseline,
            historyConfirmed:
              q.origin === "snapshot"
                ? phase.historyConfirmed
                : q.historyConfirmed,
            note: "Confirmed in guided setup; prior cutoff and history preserved in audit.",
          },
          headers,
          tx,
        );
        await saveProp(
          {
            action: "rules",
            accountId: account.id,
            phaseId: phase.id,
            effectiveLocal: wallInput(
              effective,
              account.reportingTimezone,
              true,
            ),
            rules: rawRules,
            ...(q.origin === "snapshot"
              ? { openingSnapshot: q.opening, snapshotBalance: q.baseline }
              : {}),
          },
          headers,
          tx,
        );
        phaseId = phase.id;
      } else {
        const result = await saveProp(
          {
            action: "phase",
            accountId: account.id,
            previousId: null,
            kind: q.rules.stage === "Evaluation" ? "Evaluation" : "Funded",
            label: `${q.rules.product} / ${q.rules.stage}`,
            startLocal: q.startLocal,
            baseline:
              q.origin === "snapshot"
                ? (q.rules.ledgerStart ?? "")
                : q.baseline,
            historyConfirmed: q.origin === "start" && q.historyConfirmed,
            note: "Guided setup; activity preview confirmed. Source account mappings preserved.",
            initialRules: rawRules,
          },
          headers,
          tx,
        );
        phaseId = result.phaseId;
        if (q.origin === "snapshot") {
          if (!q.snapshotLocal)
            throw new ReviewError(
              "Enter the dashboard snapshot timestamp.",
              400,
            );
          await saveProp(
            {
              action: "snapshot",
              accountId: account.id,
              phaseId,
              asOfLocal: q.snapshotLocal,
              balance: q.baseline,
              threshold: q.rules.drawdown.initialThreshold ?? "",
              qualifyingDays: q.opening.qualifyingDays?.toString() ?? "",
              note: "Confirmed guided dashboard anchor; earlier compliance remains unverified.",
              details: q.opening,
            },
            headers,
            tx,
          );
        }
      }
      await tx.insert(propEvents).values({
        ownerId: user.id,
        phaseId,
        at: new Date(),
        kind: "Guided setup saved",
        note: marker,
      });
      return { accountId: account.id, phaseId };
    });
    return {
      ...result,
      account: await getTradingAccount(result.accountId, headers),
    };
  } catch (e) {
    if (
      e instanceof NotFoundError ||
      e instanceof ReviewError ||
      e instanceof z.ZodError
    )
      throw e;
    throw new WorkspaceUnavailableError();
  }
}
