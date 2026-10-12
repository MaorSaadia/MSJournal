import { getDaily, saveDaily, notebook } from "@/lib/daily/service";
import { requireOrigin, privateJson, privateError } from "@/lib/private-api";
import { requireUser } from "@/lib/session";
import { readBounded } from "@/lib/reviews/images";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    return privateJson(
      params.has("date")
        ? await getDaily(params.get("date"), request.headers)
        : await notebook(Object.fromEntries(params), request.headers),
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
      await saveDaily(
        JSON.parse((await readBounded(request, 1024 * 1024)).toString("utf8")),
        request.headers,
      ),
    );
  } catch (e) {
    return privateError(e);
  }
}
