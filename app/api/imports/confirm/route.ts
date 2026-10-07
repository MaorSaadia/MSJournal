import { requireOrigin, privateJson, privateError } from "@/lib/private-api";
import { requireUser } from "@/lib/session";
import { readUpload } from "@/lib/imports/request";
import { confirmImport } from "@/lib/imports/service";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    await requireUser(request.headers);
    const { options, files, token } = await readUpload(request);
    return privateJson(
      await confirmImport(options, files, token, request.headers),
    );
  } catch (error) {
    return privateError(error);
  }
}
