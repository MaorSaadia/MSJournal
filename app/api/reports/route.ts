import { reports } from "@/lib/reports/service";
import { privateJson, privateError } from "@/lib/private-api";
export async function GET(request: Request) {
  try {
    return privateJson(
      await reports(
        Object.fromEntries(new URL(request.url).searchParams),
        request.headers,
      ),
    );
  } catch (e) {
    return privateError(e);
  }
}
