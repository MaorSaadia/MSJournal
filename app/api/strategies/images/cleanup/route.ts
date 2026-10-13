import { cleanupExamples } from "@/lib/strategies/images";
import { requireOrigin, privateJson, privateError } from "@/lib/private-api";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    return privateJson(await cleanupExamples(request.headers));
  } catch (e) {
    return privateError(e);
  }
}
