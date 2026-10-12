import { dailyIndicators } from "@/lib/daily/service";
import { privateJson, privateError } from "@/lib/private-api";
export async function GET(request: Request) {
  try {
    return privateJson(
      await dailyIndicators(
        new URL(request.url).searchParams.get("month"),
        request.headers,
      ),
    );
  } catch (e) {
    return privateError(e);
  }
}
