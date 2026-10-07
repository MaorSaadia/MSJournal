import { requireOrigin, privateJson, privateError } from "@/lib/private-api";
import { requireUser } from "@/lib/session";
import { readUpload } from "@/lib/imports/request";
import { previewImport } from "@/lib/imports/service";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    await requireUser(request.headers);
    const { options, files } = await readUpload(request);
    return privateJson(await previewImport(options, files, request.headers));
  } catch (error) {
    return privateError(error);
  }
}
