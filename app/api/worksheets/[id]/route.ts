import { z } from "zod";
import { readWorksheet, updateWorksheet, deleteWorksheet, duplicateWorksheet, historyFor } from "@/lib/book/service";
import { privateError, privateJson, requireOrigin } from "@/lib/private-api";
import { readBounded } from "@/lib/reviews/images";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const id = z.uuid().parse((await context.params).id);
    return privateJson(new URL(request.url).searchParams.has("history") ? await historyFor(id, request.headers) : await readWorksheet(id, request.headers));
  } catch (e) { return privateError(e); }
}
export async function PATCH(request: Request, context: Context) {
  try { requireOrigin(request); return privateJson(await updateWorksheet(z.uuid().parse((await context.params).id), JSON.parse((await readBounded(request, 512 * 1024)).toString("utf8")), request.headers)); } catch (e) { return privateError(e); }
}
export async function POST(request: Request, context: Context) {
  try { requireOrigin(request); return privateJson(await duplicateWorksheet(z.uuid().parse((await context.params).id), request.headers), 201); } catch (e) { return privateError(e); }
}
export async function DELETE(request: Request, context: Context) {
  try {
    requireOrigin(request);
    const body = z.object({ revision: z.number().int().positive() }).strict().parse(JSON.parse((await readBounded(request,1024)).toString("utf8")));
    await deleteWorksheet(z.uuid().parse((await context.params).id), body.revision, request.headers);
    return privateJson({ deleted: true });
  } catch (e) { return privateError(e); }
}
