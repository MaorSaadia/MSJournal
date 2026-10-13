import {
  getStrategy,
  listStrategies,
  saveStrategy,
  actStrategy,
} from "@/lib/strategies/service";
import { requireOrigin, privateJson, privateError } from "@/lib/private-api";
import { requireUser } from "@/lib/session";
import { readBounded } from "@/lib/reviews/images";
import { z } from "zod";
export async function GET(request: Request) {
  try {
    const p = new URL(request.url).searchParams;
    return privateJson(
      p.has("id")
        ? await getStrategy(
            p.get("id")!,
            request.headers,
            p.has("revision")
              ? z.coerce.number().int().positive().parse(p.get("revision"))
              : undefined,
          )
        : await listStrategies(Object.fromEntries(p), request.headers),
    );
  } catch (e) {
    return privateError(e);
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    await requireUser(request.headers);
    const v = JSON.parse(
      (await readBounded(request, 256 * 1024)).toString("utf8"),
    );
    return privateJson(
      v.action
        ? await actStrategy(v, request.headers)
        : await saveStrategy(v, request.headers),
    );
  } catch (e) {
    return privateError(e);
  }
}
