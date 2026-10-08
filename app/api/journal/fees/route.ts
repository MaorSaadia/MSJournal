import { privateError, privateJson, requireOrigin } from "@/lib/private-api";
import { saveFeeSettings, setManualFees } from "@/lib/journal/service";
import { requireUser } from "@/lib/session";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    await requireUser(request.headers);
    return privateJson(
      await saveFeeSettings(await request.json(), request.headers),
    );
  } catch (error) {
    return privateError(error);
  }
}
export async function PATCH(request: Request) {
  try {
    requireOrigin(request);
    await requireUser(request.headers);
    return privateJson(
      await setManualFees(await request.json(), request.headers),
    );
  } catch (error) {
    return privateError(error);
  }
}
