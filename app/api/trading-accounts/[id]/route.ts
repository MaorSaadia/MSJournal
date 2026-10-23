import {
  getTradingAccount,
  saveTradingAccount,
  archiveTradingAccount,
} from "@/lib/accounts/service";
import { requireUser } from "@/lib/session";
import { privateError, privateJson, requireOrigin } from "@/lib/private-api";
import { z } from "zod";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    return privateJson({
      account: await getTradingAccount(
        (await context.params).id,
        request.headers,
      ),
    });
  } catch (error) {
    return privateError(error);
  }
}
export async function PATCH(request: Request, context: Context) {
  try {
    await requireUser(request.headers);
    requireOrigin(request);
    const { id } = await context.params;
    const input = await request.json();
    const result =
      typeof input === "object" && input !== null && "archived" in input
        ? await archiveTradingAccount(
            id,
            z.object({ archived: z.boolean() }).strict().parse(input).archived,
            request.headers,
          )
        : await saveTradingAccount(input, id, request.headers);
    return privateJson({ account: result });
  } catch (error) {
    return privateError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    requireOrigin(request);
    await requireUser(request.headers);
    const { readBounded } = await import("@/lib/reviews/images");
    const { deleteArchivedAccount } = await import("@/lib/accounts/deletion");
    return privateJson(await deleteArchivedAccount((await context.params).id,
      JSON.parse((await readBounded(request, 4096)).toString("utf8")), request.headers));
  } catch (error) { return privateError(error); }
}
