import { orderExamples } from "@/lib/strategies/images";
import { readBounded } from "@/lib/reviews/images";
import { requireOrigin, privateJson, privateError } from "@/lib/private-api";
import { requireUser } from "@/lib/session";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    await requireUser(request.headers);
    return privateJson(
      await orderExamples(
        JSON.parse((await readBounded(request, 8192)).toString("utf8")),
        request.headers,
      ),
    );
  } catch (e) {
    return privateError(e);
  }
}
