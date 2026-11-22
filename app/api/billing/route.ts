import { after } from "next/server";
import { z } from "zod";
import { privateJson, privateError, requireOrigin } from "@/lib/private-api";
import { requireUser } from "@/lib/session";
import { billingStatus } from "@/lib/billing/status";
import { chooseFreeAccount } from "@/lib/billing/entitlements";
import {
  refreshOwner,
  startCheckout,
  startRecovery,
} from "@/lib/billing/provider";
import { drainBillingEvents } from "@/lib/billing/webhooks";
import { cancelRenewal } from "@/lib/billing/cancellation";
import { startAnnualChange, retryAnnualChanges } from "@/lib/billing/switching";
import { readReviewJson } from "@/lib/reviews/request";
import { liveAnnualTestOption } from "@/lib/billing/pricing";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const status = await billingStatus(request.headers);
    after(async () => {
      await drainBillingEvents().catch(() => 0);
      await retryAnnualChanges(status.userId).catch(() => {});
    });
    return privateJson(status);
  } catch (e) {
    return privateError(e);
  }
}
const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("select"), accountId: z.uuid() }).strict(),
  z
    .object({
      action: z.literal("checkout"),
      option: z.number().int().min(0).max(liveAnnualTestOption),
    })
    .strict(),
  z.object({ action: z.literal("refresh") }).strict(),
  z.object({ action: z.literal("link") }).strict(),
  z.object({ action: z.literal("cancel") }).strict(),
  z.object({ action: z.literal("switch_annual") }).strict(),
]);
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const user = await requireUser(request.headers),
      body = action.parse(await readReviewJson(request));
    if (body.action === "checkout")
      return privateJson(await startCheckout(user.id, body.option, undefined, user.email));
    if (body.action === "switch_annual")
      return privateJson(await startAnnualChange(user.id));
    if (body.action === "link")
      return privateJson(await startRecovery(user.id));
    if (body.action === "select")
      await chooseFreeAccount(user.id, body.accountId);
    if (body.action === "cancel")
      await cancelRenewal(user.id);
    if (body.action === "refresh") {
      await refreshOwner(user.id, true);
      await retryAnnualChanges(user.id);
      after(() => drainBillingEvents().catch(() => 0));
    }
    return privateJson(await billingStatus(request.headers, false));
  } catch (e) {
    return privateError(e);
  }
}
