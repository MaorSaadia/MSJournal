import { calendarData } from "@/lib/calendar/service";
import { privateJson, privateError } from "@/lib/private-api";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    return privateJson(
      await calendarData(
        Object.fromEntries(new URL(request.url).searchParams),
        request.headers,
      ),
    );
  } catch (error) {
    return privateError(error);
  }
}
