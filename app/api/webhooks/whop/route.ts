import { after } from "next/server";
import { privateError } from "@/lib/private-api";
import { acceptWebhook, processBillingEvent } from "@/lib/billing/webhooks";
import { readBounded } from "@/lib/reviews/images";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const raw = (await readBounded(request, 256 * 1024)).toString("utf8");
    const event = await acceptWebhook(raw, request.headers);
    if (event.supported)
      after(() =>
        processBillingEvent(event.environment, event.id).catch(() => {}),
      );
    return Response.json({ received: true });
  } catch (e) {
    return privateError(e);
  }
}
