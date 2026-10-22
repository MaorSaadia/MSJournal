import { addPropFirm, deletePropFirm, listPropFirms } from "@/lib/props/firms";
import { privateJson, privateError, requireOrigin } from "@/lib/private-api";
import { requireUser } from "@/lib/session";
import { readBounded } from "@/lib/reviews/images";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    return privateJson({ firms: await listPropFirms(request.headers) });
  } catch (e) {
    return privateError(e);
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    await requireUser(request.headers);
    return privateJson({
      firms: await addPropFirm(
        JSON.parse((await readBounded(request, 2048)).toString("utf8")),
        request.headers,
      ),
    });
  } catch (e) {
    return privateError(e);
  }
}

export async function DELETE(request: Request) {
  try {
    requireOrigin(request);
    await requireUser(request.headers);
    return privateJson({
      firms: await deletePropFirm(
        JSON.parse((await readBounded(request, 2048)).toString("utf8")),
        request.headers,
      ),
    });
  } catch (e) {
    return privateError(e);
  }
}
