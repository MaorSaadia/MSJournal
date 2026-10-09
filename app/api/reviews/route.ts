import { getReview, saveReview, recoveryReviews } from "@/lib/reviews/service";
import { requireOrigin, privateJson, privateError } from "@/lib/private-api";
import { readBounded } from "@/lib/reviews/images";
import { requireUser } from "@/lib/session";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    return privateJson(
      params.get("recovery") === "1"
        ? { reviews: await recoveryReviews(request.headers) }
        : await getReview(params.get("recordId") ?? "", request.headers),
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
      await saveReview(
        JSON.parse((await readBounded(request, 128 * 1024)).toString("utf8")),
        request.headers,
      ),
    );
  } catch (e) {
    return privateError(e);
  }
}
