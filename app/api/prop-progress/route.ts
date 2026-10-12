import { propData, saveProp } from "@/lib/props/service";
import { privateJson, privateError, requireOrigin } from "@/lib/private-api";
import { readBounded } from "@/lib/reviews/images";
import { requireUser } from "@/lib/session";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    return privateJson(
      await propData(
        new URL(request.url).searchParams.get("accountId") ?? undefined,
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
      await saveProp(
        JSON.parse((await readBounded(request, 65536)).toString("utf8")),
        request.headers,
      ),
    );
  } catch (e) {
    return privateError(e);
  }
}
