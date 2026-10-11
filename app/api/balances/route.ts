import { saveBalance } from "@/lib/balances/service";
import { privateError, privateJson, requireOrigin } from "@/lib/private-api";
import { requireUser } from "@/lib/session";
import { readBounded } from "@/lib/reviews/images";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    await requireUser(request.headers);
    return privateJson(
      await saveBalance(
        JSON.parse((await readBounded(request, 8192)).toString("utf8")),
        request.headers,
      ),
    );
  } catch (error) {
    return privateError(error);
  }
}
