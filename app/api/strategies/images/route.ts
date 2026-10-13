import { uploadExample } from "@/lib/strategies/images";
import { getStrategy } from "@/lib/strategies/service";
import { readBounded, MAX_IMAGE_BYTES } from "@/lib/reviews/images";
import { requireOrigin, privateJson, privateError } from "@/lib/private-api";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const id = new URL(request.url).searchParams.get("strategyId") ?? "";
    await getStrategy(id, request.headers);
    return privateJson(
      await uploadExample(
        id,
        await readBounded(request, MAX_IMAGE_BYTES),
        request.headers,
      ),
      201,
    );
  } catch (e) {
    return privateError(e);
  }
}
