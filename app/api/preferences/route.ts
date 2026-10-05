import { getPreferences, savePreferences } from "@/lib/preferences";
import { requireOwner } from "@/lib/session";
import { privateError, privateJson, requireOrigin } from "@/lib/private-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return privateJson({ preferences: await getPreferences(request.headers) });
  } catch (error) {
    return privateError(error);
  }
}
export async function PATCH(request: Request) {
  try {
    await requireOwner(request.headers);
    requireOrigin(request);
    return privateJson({
      preferences: await savePreferences(await request.json(), request.headers),
    });
  } catch (error) {
    return privateError(error);
  }
}
