import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { tradingAccounts, balanceAdjustments, propPayouts } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { NotFoundError } from "@/lib/accounts/service";
import { WorkspaceUnavailableError } from "@/lib/server-error";
import { ReviewError } from "@/lib/reviews/model";
import { daySchema } from "@/lib/calendar/model";
import { D } from "@/lib/journal/processing";
import { parseSourceTime } from "@/lib/imports/time";
const amount = z.string().regex(/^-?\d{1,16}(?:\.\d{1,2})?$/);
const mutation = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("baseline"),
      accountId: z.uuid(),
      amount,
      date: daySchema.refine((d) => d >= "2000-01-01" && d <= "2099-12-31"),
    })
    .strict(),
  z
    .object({
      action: z.literal("adjustment"),
      accountId: z.uuid(),
      id: z.uuid(),
      amount,
      kind: z.enum(["deposit", "withdrawal", "other"]),
      localTime: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
      explanation: z.string().trim().max(500).default(""),
    })
    .strict()
    .refine(
      (v) =>
        !new D(v.amount).isZero() &&
        (v.kind === "other" ? v.explanation.length > 0 : new D(v.amount).gt(0)),
      "Enter a positive deposit/withdrawal amount or a signed nonzero adjustment with an explanation.",
    ),
  z
    .object({ action: z.literal("remove"), accountId: z.uuid(), id: z.uuid() })
    .strict(),
]);
export async function saveBalance(input: unknown, headers?: Headers) {
  const user = await requireUser(headers),
    q = mutation.parse(input);
  try {
    return await getDb().transaction(async (tx) => {
      const [account] = await tx
        .select()
        .from(tradingAccounts)
        .where(
          and(
            eq(tradingAccounts.id, q.accountId),
            eq(tradingAccounts.ownerId, user.id),
          ),
        )
        .for("update");
      if (!account || account.archivedAt || account.currency !== "USD")
        throw new NotFoundError();
      if (q.action === "baseline") {
        await tx
          .update(tradingAccounts)
          .set({
            openingBalance: new D(q.amount).toFixed(2),
            openingBalanceDate: q.date,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(tradingAccounts.id, q.accountId),
              eq(tradingAccounts.ownerId, user.id),
            ),
          );
        return { saved: true };
      }
      const [payout] = await tx
        .select({ id: propPayouts.id })
        .from(propPayouts)
        .where(
          and(
            eq(propPayouts.ownerId, user.id),
            eq(propPayouts.deductionId, q.id),
          ),
        );
      if (payout)
        throw new ReviewError(
          "Edit this deduction in the account's Payouts log so its audit history stays consistent.",
          409,
        );
      if (q.action === "remove") {
        const removed = await tx
          .delete(balanceAdjustments)
          .where(
            and(
              eq(balanceAdjustments.id, q.id),
              eq(balanceAdjustments.ownerId, user.id),
              eq(balanceAdjustments.tradingAccountId, q.accountId),
            ),
          )
          .returning({ id: balanceAdjustments.id });
        if (!removed.length) throw new NotFoundError();
        return { saved: true };
      }
      const [date, time] = q.localTime.split("T"),
        [year, month, day] = date.split("-");
      let instant: string;
      try {
        instant = parseSourceTime(
          `${month}/${day}/${year} ${time}:00`,
          account.reportingTimezone,
        );
      } catch {
        throw new ReviewError(
          "Choose a valid, unambiguous local time in the account timezone.",
          400,
        );
      }
      const signed = new D(q.amount)
        .times(q.kind === "withdrawal" ? -1 : 1)
        .toFixed(2);
      await tx
        .insert(balanceAdjustments)
        .values({
          id: q.id,
          ownerId: user.id,
          tradingAccountId: q.accountId,
          effectiveAt: new Date(instant),
          amount: signed,
          kind: q.kind,
          explanation: q.explanation,
        })
        .onConflictDoNothing();
      const [saved] = await tx
        .select()
        .from(balanceAdjustments)
        .where(
          and(
            eq(balanceAdjustments.id, q.id),
            eq(balanceAdjustments.ownerId, user.id),
            eq(balanceAdjustments.tradingAccountId, q.accountId),
          ),
        );
      if (!saved) throw new NotFoundError();
      if (
        saved.effectiveAt.toISOString() !== instant ||
        !new D(saved.amount).eq(signed) ||
        saved.kind !== q.kind ||
        saved.explanation !== q.explanation
      )
        throw new ReviewError(
          "This adjustment request already saved different values. Refresh before retrying.",
          409,
        );
      return { saved: true };
    });
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof ReviewError) throw e;
    throw new WorkspaceUnavailableError();
  }
}
