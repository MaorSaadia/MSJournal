import { savePayout } from "@/lib/props/payout-service";
import { privateJson, privateError, requireOrigin } from "@/lib/private-api";
import { readBounded } from "@/lib/reviews/images";
import { requireUser } from "@/lib/session";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    await requireUser(request.headers);
    return privateJson(
      await savePayout(
        JSON.parse((await readBounded(request, 16384)).toString("utf8")),
        request.headers,
      ),
    );
  } catch (e) {
    return privateError(e);
  }
}
