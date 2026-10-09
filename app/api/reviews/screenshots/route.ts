import { uploadScreenshot, getReview } from "@/lib/reviews/service";
import { requireOrigin, privateJson, privateError } from "@/lib/private-api";
import { readBounded, MAX_IMAGE_BYTES } from "@/lib/reviews/images";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const recordId = new URL(request.url).searchParams.get("recordId") ?? "";
    await getReview(recordId, request.headers);
    return privateJson(
      await uploadScreenshot(
        recordId,
        await readBounded(request, MAX_IMAGE_BYTES),
        request.headers,
      ),
      201,
    );
  } catch (e) {
    return privateError(e);
  }
}
