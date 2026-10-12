import { dailyResults } from "@/lib/daily/service";
import { privateJson, privateError } from "@/lib/private-api";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const date = params.get("date");
    params.delete("date");
    return privateJson(
      await dailyResults(date, Object.fromEntries(params), request.headers),
    );
  } catch (e) {
    return privateError(e);
  }
}
