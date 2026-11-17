import { timingSafeEqual } from "node:crypto";
import { drainBillingEvents } from "@/lib/billing/webhooks";
import { sweepMemberships } from "@/lib/billing/provider";
import { whopConfig } from "@/lib/billing/config";
import { retryAnnualChanges } from "@/lib/billing/switching";
export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.BILLING_RECONCILE_SECRET,
    provided = request.headers.get("authorization") ?? "";
  const expected = secret ? `Bearer ${secret}` : "";
  if (
    !secret ||
    Buffer.byteLength(provided) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  )
    return new Response("Unauthorized", { status: 401 });
  // An authenticated but disabled/misconfigured job is not a successful sweep.
  if (!whopConfig())
    return new Response("Billing configuration needs attention", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  try {
    const events = await drainBillingEvents();
    const memberships = await sweepMemberships(events ? 1 : 3);
    await retryAnnualChanges();
    return Response.json(
      { events, memberships },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return new Response("Retry later", { status: 503 });
  }
}
