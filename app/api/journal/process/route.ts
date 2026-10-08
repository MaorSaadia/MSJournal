import { privateError, privateJson, requireOrigin } from "@/lib/private-api";
import { processAccount } from "@/lib/journal/service";
import { z } from "zod";
import { requireUser } from "@/lib/session";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    await requireUser(request.headers);
    const { accountId } = z
      .object({ accountId: z.uuid() })
      .parse(await request.json());
    return privateJson(await processAccount(accountId, request.headers));
  } catch (error) {
    return privateError(error);
  }
}
