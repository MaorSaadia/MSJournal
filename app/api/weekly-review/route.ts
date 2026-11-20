import { weeklyReview } from "@/lib/weekly-review/service";
import { privateJson, privateError } from "@/lib/private-api";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try { return privateJson(await weeklyReview(Object.fromEntries(new URL(request.url).searchParams),request.headers)); }
  catch(error) { return privateError(error); }
}
