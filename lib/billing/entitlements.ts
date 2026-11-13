import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { billingProfiles, tradingAccounts } from "@/db/schema";
import { ReviewError } from "@/lib/reviews/model";
import { WorkspaceUnavailableError } from "@/lib/server-error";
import { billingEnvironment, configuredPlanReferences } from "./config";
import { deriveEntitlement } from "./policy";
export type BillingTx = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];
export class PlanLimitError extends ReviewError {
  readonly code = "PLAN_LIMIT";
  constructor(
    message = "Track multiple accounts and prop firms with MSJournal Pro. Choose your Free account in Billing, or upgrade to continue.",
  ) {
    super(message, 403);
  }
}
export function billingDatabaseError(error: unknown) {
  let current = error;
  for (let i = 0; current && i < 6; i++) {
    const e = current as { hint?: string; cause?: unknown };
    if (e.hint === "MSJOURNAL_PLAN_LIMIT") throw new PlanLimitError();
    if (e.hint === "MSJOURNAL_ACCOUNT_NOT_FOUND")
      throw new ReviewError("Account not found or unavailable.", 404);
    if (e.hint === "MSJOURNAL_ACCOUNT_HISTORY")
      throw new ReviewError(
        "An account with trading history cannot change firms. Keep its identity and add a separate account for the new firm.",
        409,
      );
    current = e.cause;
  }
}
export async function billingLock(tx: BillingTx, ownerId: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${"billing:" + ownerId},0))`,
  );
  await tx.execute(
    sql`select set_config('msjournal.billing_environment',${billingEnvironment()},true)`,
  );
  await tx.execute(
    sql`select set_config('msjournal.billing_business',${process.env.WHOP_BUSINESS_ID ?? ""},true), set_config('msjournal.billing_product',${process.env.WHOP_PRO_PRODUCT_ID ?? ""},true), set_config('msjournal.billing_plans',${configuredPlanReferences().planIds.join(",")},true)`,
  );
  await tx.insert(billingProfiles).values({ ownerId }).onConflictDoNothing();
}
export async function assertNewAccount(tx: BillingTx, ownerId: string) {
  await billingLock(tx, ownerId);
  try {
    await tx.execute(sql`select msjournal_assert_new_account(${ownerId})`);
  } catch (e) {
    billingDatabaseError(e);
    throw e;
  }
}
export async function assertAccountActivity(
  tx: BillingTx,
  ownerId: string,
  accountId: string,
) {
  await billingLock(tx, ownerId);
  try {
    await tx.execute(
      sql`select msjournal_assert_account_activity(${ownerId},${accountId}::uuid)`,
    );
  } catch (e) {
    billingDatabaseError(e);
    throw e;
  }
}
export async function entitlementInTransaction(tx: BillingTx, ownerId: string) {
  await billingLock(tx, ownerId);
  const accounts = await tx
    .select()
    .from(tradingAccounts)
    .where(eq(tradingAccounts.ownerId, ownerId));
  const result = await tx.execute<{ pro: boolean }>(
    sql`select msjournal_is_pro(${ownerId}) pro`,
  );
  const pro = result.rows[0].pro;
  let [profile] = await tx
    .select()
    .from(billingProfiles)
    .where(eq(billingProfiles.ownerId, ownerId));
  if (!pro && !profile.freeAccountId && accounts.length === 1) {
    [profile] = await tx
      .update(billingProfiles)
      .set({
        freeAccountId: accounts[0].id,
        selectedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(billingProfiles.ownerId, ownerId))
      .returning();
  }
  return deriveEntitlement(
    accounts.map((a) => ({
      id: a.id,
      name: a.displayName,
      archived: !!a.archivedAt,
    })),
    profile.freeAccountId,
    pro,
  );
}
export async function getEntitlement(ownerId: string) {
  try {
    return await getDb().transaction((tx) =>
      entitlementInTransaction(tx, ownerId),
    );
  } catch {
    // Server-rendered workspace errors must not retain SQL or owner parameters.
    throw new WorkspaceUnavailableError();
  }
}
export async function chooseFreeAccount(ownerId: string, id: string) {
  return getDb().transaction(async (tx) => {
    const current = await entitlementInTransaction(tx, ownerId);
    if (!current.accounts.some((a) => a.id === id))
      throw new ReviewError("Choose one of your retained accounts.", 404);
    if (current.freeAccountId && current.freeAccountId !== id)
      throw new ReviewError(
        "Your Free account is already selected. It can be replaced only after that account is permanently deleted through account management.",
        409,
      );
    if (current.plan === "Pro")
      throw new ReviewError(
        "Your Pro subscription already includes all accounts.",
        409,
      );
    await tx
      .update(billingProfiles)
      .set({ freeAccountId: id, selectedAt: new Date(), updatedAt: new Date() })
      .where(eq(billingProfiles.ownerId, ownerId));
    return entitlementInTransaction(tx, ownerId);
  });
}
