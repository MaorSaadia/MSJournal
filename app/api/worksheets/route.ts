import { createWorksheet, listWorksheets } from "@/lib/book/service";
import { privateError, privateJson, requireOrigin } from "@/lib/private-api";
import { readBounded } from "@/lib/reviews/images";
export async function GET(request: Request) {
  try { return privateJson(await listWorksheets(request.headers)); } catch (e) { return privateError(e); }
}
export async function POST(request: Request) {
  try { requireOrigin(request); return privateJson(await createWorksheet(JSON.parse((await readBounded(request, 512 * 1024)).toString("utf8")), request.headers), 201); } catch (e) { return privateError(e); }
}
