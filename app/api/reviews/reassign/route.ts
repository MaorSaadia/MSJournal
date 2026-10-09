import { readReviewJson } from "@/lib/reviews/request";
import { reassignReview } from "@/lib/reviews/service";
import { requireOrigin, privateJson, privateError } from "@/lib/private-api";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    return privateJson(
      await reassignReview(await readReviewJson(request), request.headers),
    );
  } catch (e) {
    return privateError(e);
  }
}
