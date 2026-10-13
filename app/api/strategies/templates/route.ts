import {
  listTemplates,
  saveTemplate,
  deleteTemplate,
} from "@/lib/strategies/template-service";
import { privateJson, privateError, requireOrigin } from "@/lib/private-api";
import { requireUser } from "@/lib/session";
import { readBounded } from "@/lib/reviews/images";
export async function GET(request: Request) {
  try {
    return privateJson(await listTemplates(request.headers));
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
        JSON.parse((await readBounded(request, 256 * 1024)).toString("utf8")),
        request.headers,
      ),
    );
  } catch (e) {
    return privateError(e);
  }
}
export async function DELETE(request: Request) {
  try {
    requireOrigin(request);
    await requireUser(request.headers);
    return privateJson(
      await deleteTemplate(
        JSON.parse((await readBounded(request, 8192)).toString("utf8")),
        request.headers,
      ),
    );
  } catch (e) {
    return privateError(e);
  }
}
