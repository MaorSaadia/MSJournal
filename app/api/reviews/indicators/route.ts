import { reviewIndicators } from "@/lib/reviews/indicators";
import { privateJson, privateError } from "@/lib/private-api";
export async function GET(request: Request) {
  try {
    return privateJson(
      await reviewIndicators(
        Object.fromEntries(new URL(request.url).searchParams),
        request.headers,
      ),
    );
  } catch (e) {
    return privateError(e);
  }
}
