import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import {
  tradingAccounts,
  propPhases,
  propPayouts,
  propPayoutEvents,
  balanceAdjustments,
} from "@/db/schema";
import { requireUser } from "@/lib/session";
import { NotFoundError } from "@/lib/accounts/service";
import { ReviewError } from "@/lib/reviews/model";
import { WorkspaceUnavailableError } from "@/lib/server-error";
import { D } from "@/lib/journal/processing";
import { payoutFieldsSchema } from "./tracking-rules";

const mutation = z
  .object({
    accountId: z.uuid(),
    phaseId: z.uuid(),
    id: z.uuid(),
    revision: z.number().int().min(0),
    fields: payoutFieldsSchema,
  })
  .strict();
const canonical = (v: object) =>
  JSON.stringify(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)));
export async function savePayout(input: unknown, headers?: Headers) {
  const owner = await requireUser(headers),
    q = mutation.parse(input);
  try {
    return await getDb().transaction(async (tx) => {
      const [account] = await tx
        .select()
        .from(tradingAccounts)
        .where(
          and(
            eq(tradingAccounts.id, q.accountId),
            eq(tradingAccounts.ownerId, owner.id),
          ),
        )
        .for("update");
      if (!account || account.archivedAt) throw new NotFoundError();
      const [phase] = await tx
        .select()
        .from(propPhases)
        .where(
          and(
            eq(propPhases.id, q.phaseId),
            eq(propPhases.ownerId, owner.id),
            eq(propPhases.tradingAccountId, account.id),
          ),
        )
        .for("update");
      if (!phase || phase.kind !== "Funded") throw new NotFoundError();
      if (
        q.fields.requestedAt < phase.startAt.toISOString() ||
        (phase.endAt && q.fields.requestedAt >= phase.endAt.toISOString())
      )
        throw new ReviewError(
          "The request must belong to the selected funded phase.",
          400,
        );
      if (
        [
          q.fields.requestedAt,
          q.fields.approvedAt,
          q.fields.deductedAt,
          q.fields.paidAt,
        ].some((at) => at && at > new Date().toISOString())
      )
        throw new ReviewError(
          "Record past events only. Forecasts stay in Overview.",
          400,
        );
      const [previous] = await tx
        .select()
        .from(propPayouts)
        .where(eq(propPayouts.id, q.id))
        .for("update");
      if (
        previous &&
        (previous.ownerId !== owner.id || previous.phaseId !== phase.id)
      )
        throw new NotFoundError();
      if (previous && canonical(previous.fields) === canonical(q.fields))
        return {
          saved: true,
          id: previous.id,
          revision: previous.revision,
          phaseId: phase.id,
          accountId: account.id,
        };
      if ((previous?.revision ?? 0) !== q.revision)
        throw new ReviewError(
          "This payout changed elsewhere. Refresh before correcting it.",
          409,
        );
      const revision = q.revision + 1;
      // Only the explicit deduction event touches the ledger. Approval/payment do not.
      const deductionId =
        q.fields.deductedAt &&
        q.fields.deductionAmount !== null &&
        new D(q.fields.deductionAmount).gt(0)
          ? (previous?.deductionId ?? randomUUID())
          : null;
      if (deductionId) {
        await tx
          .insert(balanceAdjustments)
          .values({
            id: deductionId,
            ownerId: owner.id,
            tradingAccountId: account.id,
            effectiveAt: new Date(q.fields.deductedAt!),
            amount: new D(q.fields.deductionAmount!).neg().toFixed(2),
            kind: "withdrawal",
            explanation: `Prop payout ${q.id}; edit in Payouts.`,
          })
          .onConflictDoUpdate({
            target: balanceAdjustments.id,
            set: {
              effectiveAt: new Date(q.fields.deductedAt!),
              amount: new D(q.fields.deductionAmount!).neg().toFixed(2),
            },
          });
      }
      if (previous)
        await tx
          .update(propPayouts)
          .set({
            fields: q.fields,
            revision,
            deductionId,
            updatedAt: new Date(),
          })
          .where(
            and(eq(propPayouts.id, q.id), eq(propPayouts.ownerId, owner.id)),
          );
      else
        await tx
          .insert(propPayouts)
          .values({
            id: q.id,
            ownerId: owner.id,
            phaseId: phase.id,
            fields: q.fields,
            revision,
            deductionId,
          });
      if (previous?.deductionId && !deductionId)
        await tx
          .delete(balanceAdjustments)
          .where(
            and(
              eq(balanceAdjustments.id, previous.deductionId),
              eq(balanceAdjustments.ownerId, owner.id),
            ),
          );
      await tx
        .insert(propPayoutEvents)
        .values({
          ownerId: owner.id,
          payoutId: q.id,
          revision,
          before: previous?.fields ?? null,
          after: q.fields,
        });
      return {
        saved: true,
        id: q.id,
        revision,
        phaseId: phase.id,
        accountId: account.id,
      };
    });
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
