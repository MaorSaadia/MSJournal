import { getFees, previewFees, saveFees } from "@/lib/fees/service";
import { requireOrigin, privateJson, privateError } from "@/lib/private-api";
import { requireUser } from "@/lib/session";
import { readBounded } from "@/lib/reviews/images";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return privateJson(
      await getFees(
        Object.fromEntries(new URL(request.url).searchParams),
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
    const body = JSON.parse(
      (await readBounded(request, 8192)).toString("utf8"),
    );
    return privateJson(await previewFees(body, request.headers));
  } catch (e) {
    return privateError(e);
  }
}
export async function PUT(request: Request) {
  try {
    requireOrigin(request);
    await requireUser(request.headers);
    const body = JSON.parse(
      (await readBounded(request, 8192)).toString("utf8"),
    );
    return privateJson(await saveFees(body, request.headers));
  } catch (e) {
    return privateError(e);
  }
}
