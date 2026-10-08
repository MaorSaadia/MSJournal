import { requireOrigin, privateJson, privateError } from "@/lib/private-api";
import { requireUser } from "@/lib/session";
import { readUpload } from "@/lib/imports/request";
import { confirmImport } from "@/lib/imports/service";
import { processAccount } from "@/lib/journal/service";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    await requireUser(request.headers);
    const { options, files, token } = await readUpload(request);
    const result = await confirmImport(options, files, token, request.headers);
    // Source persistence and derived processing have deliberately separate outcomes.
    try {
      const processing = await processAccount(
        options.accountId,
        request.headers,
      );
      return privateJson({
        ...result,
        processing: { status: "Ready", ...processing },
      });
    } catch {
      return privateJson({
        ...result,
        processing: {
          status: "Failed",
          message:
            "Import saved. Journal processing failed; your source data is safe. Retry processing in Trade View.",
        },
      });
    }
  } catch (error) {
    return privateError(error);
  }
}
