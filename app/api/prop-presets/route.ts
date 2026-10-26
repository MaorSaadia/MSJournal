import { propPresets } from "@/lib/props/presets";
import { privateJson, privateError } from "@/lib/private-api";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireUser(request.headers);
    return privateJson({ presets: propPresets });
  } catch (error) {
    return privateError(error);
  }
}
