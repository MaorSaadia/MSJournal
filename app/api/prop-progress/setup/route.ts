import { saveGuidedSetup, previewSetup } from "@/lib/props/setup-service";
import { privateJson, privateError, requireOrigin } from "@/lib/private-api";
import { requireUser } from "@/lib/session";
import { readBounded } from "@/lib/reviews/images";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const p = new URL(request.url).searchParams;
    return privateJson(
      await previewSetup(
        p.get("accountId") ?? "",
        p.get("startLocal") ?? "",
        request.headers,
      ),
    );
  } catch (e) {
    return privateError(e);
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    await requireUser(request.headers);
    return privateJson(
      await saveGuidedSetup(
        JSON.parse((await readBounded(request, 65536)).toString("utf8")),
        request.headers,
      ),
    );
  } catch (e) {
    return privateError(e);
  }
}
