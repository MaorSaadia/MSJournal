import { listReviewTags, saveReviewTag } from "@/lib/reviews/service";
import { requireOrigin, privateJson, privateError } from "@/lib/private-api";
import { readBounded } from "@/lib/reviews/images";
import { requireUser } from "@/lib/session";
export async function GET(request: Request) {
  try {
    return privateJson({ tags: await listReviewTags(request.headers) });
  } catch (e) {
    return privateError(e);
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    await requireUser(request.headers);
    return privateJson(
      await saveReviewTag(
        JSON.parse((await readBounded(request, 4096)).toString("utf8")),
        request.headers,
      ),
    );
  } catch (e) {
    return privateError(e);
  }
}
export const PATCH = POST;
