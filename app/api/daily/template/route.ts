import { getTemplate, saveTemplate } from "@/lib/daily/service";
import { requireOrigin, privateJson, privateError } from "@/lib/private-api";
import { requireUser } from "@/lib/session";
import { readBounded } from "@/lib/reviews/images";
export async function GET(request: Request) {
  try {
    return privateJson(await getTemplate(request.headers));
  } catch (e) {
    return privateError(e);
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    await requireUser(request.headers);
    return privateJson(
      await saveTemplate(
        JSON.parse((await readBounded(request, 16384)).toString("utf8")),
        request.headers,
      ),
    );
  } catch (e) {
    return privateError(e);
  }
}
