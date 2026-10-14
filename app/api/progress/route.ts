import { getProgress, saveGoal, saveCheckin } from "@/lib/progress/service";
import { requireOrigin, privateJson, privateError } from "@/lib/private-api";
import { requireUser } from "@/lib/session";
import { readBounded } from "@/lib/reviews/images";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return privateJson(
      await getProgress(
        Object.fromEntries(new URL(request.url).searchParams),
        request.headers,
      ),
    );
  } catch (error) {
    return privateError(error);
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    await requireUser(request.headers);
    const body = JSON.parse(
      (await readBounded(request, 8192)).toString("utf8"),
    );
    return privateJson(await saveGoal(body, request.headers));
  } catch (error) {
    return privateError(error);
  }
}
export async function PUT(request: Request) {
  try {
    requireOrigin(request);
    await requireUser(request.headers);
    const body = JSON.parse(
      (await readBounded(request, 8192)).toString("utf8"),
    );
    return privateJson(await saveCheckin(body, request.headers));
  } catch (error) {
    return privateError(error);
  }
}
