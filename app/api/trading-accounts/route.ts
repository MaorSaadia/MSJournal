import {
  listTradingAccounts,
  saveTradingAccount,
} from "@/lib/accounts/service";
import { requireOwner } from "@/lib/session";
import { privateError, privateJson, requireOrigin } from "@/lib/private-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return privateJson({
      accounts: await listTradingAccounts(request.headers),
    });
  } catch (error) {
    return privateError(error);
  }
}
export async function POST(request: Request) {
  try {
    await requireOwner(request.headers);
    requireOrigin(request);
    return privateJson(
      {
        account: await saveTradingAccount(
          await request.json(),
          undefined,
          request.headers,
        ),
      },
      201,
    );
  } catch (error) {
    return privateError(error);
  }
}
