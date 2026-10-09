import { tradeView } from "@/lib/journal/view-service";
import { privateJson, privateError } from "@/lib/private-api";
export async function GET(request: Request) {
  try {
    return privateJson(
      await tradeView(
        Object.fromEntries(new URL(request.url).searchParams),
        request.headers,
      ),
    );
  } catch (e) {
    return privateError(e);
  }
}
