import { cleanupMyScreenshots } from "@/lib/reviews/service";
import { requireOrigin, privateJson, privateError } from "@/lib/private-api";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    return privateJson(await cleanupMyScreenshots(request.headers));
  } catch (e) {
    return privateError(e);
  }
}
