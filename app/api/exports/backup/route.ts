import { z } from "zod";
import { createBackup, MissingImagesError } from "@/lib/exports/backup";
import { privateError, privateJson, requireOrigin } from "@/lib/private-api";
import { requireUser } from "@/lib/session";
import { readBounded } from "@/lib/reviews/images";
import { withExportSlot } from "@/lib/exports/limits";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const owner = await requireUser(request.headers);
    const options = z
      .object({
        includeImages: z.boolean(),
        allowPartial: z.boolean().default(false),
      })
      .strict()
      .parse(JSON.parse((await readBounded(request, 1024)).toString("utf8")));
    const archive = await withExportSlot(owner.id, () =>
      createBackup(
        options.includeImages,
        options.allowPartial,
        request.headers,
        request.signal,
      ),
    );
    return new Response(new Uint8Array(archive.bytes), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${archive.filename}"`,
        "Content-Length": String(archive.bytes.length),
        "Cache-Control": "private, no-store",
        Vary: "Cookie",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof MissingImagesError)
      return privateJson(
        {
          code: "MISSING_IMAGES",
          message: error.message,
          missingCount: error.missingCount,
        },
        409,
      );
    return privateError(error);
  }
}
