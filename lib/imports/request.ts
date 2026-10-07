import "server-only";
import { z } from "zod";
import { ImportError } from "./errors";
import { sourceTimezone } from "./time";
import { parseReport } from "./parser";
import type { ImportOptions, ParsedFile, ReportType } from "./types";
const MAX_BODY = 11 * 1024 * 1024;
const optionsSchema = z
  .object({
    accountId: z.uuid(),
    timezone: sourceTimezone,
    confirmOrders: z.boolean(),
    confirmPerformance: z.boolean(),
  })
  .strict();
export async function readUpload(
  request: Request,
): Promise<{ options: ImportOptions; files: ParsedFile[]; token: string }> {
  const contentType = request.headers.get("content-type");
  if (!contentType?.startsWith("multipart/form-data;"))
    throw new ImportError("Upload CSV files using the import form.");
  if (Number(request.headers.get("content-length")) > MAX_BODY)
    throw new ImportError("Upload is too large. Maximum 5 MiB per file.", 413);
  // Bound streamed/chunked bodies too, before formData allocates file buffers.
  const reader = request.body?.getReader();
  if (!reader) throw new ImportError("No upload received.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_BODY) {
        await reader.cancel();
        throw new ImportError(
          "Upload is too large. Maximum 5 MiB per file.",
          413,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  let data: FormData;
  try {
    data = await new Response(Buffer.concat(chunks), {
      headers: { "content-type": contentType },
    }).formData();
  } catch {
    throw new ImportError(
      "Malformed upload. Choose the files again and retry.",
    );
  }
  for (const key of data.keys())
    if (
      ![
        "accountId",
        "timezone",
        "confirmOrders",
        "confirmPerformance",
        "orders",
        "performance",
        "token",
      ].includes(key) ||
      data.getAll(key).length > 1
    )
      throw new ImportError("Unexpected or repeated upload field.");
  const options = optionsSchema.parse({
    accountId: data.get("accountId"),
    timezone: data.get("timezone"),
    confirmOrders: data.get("confirmOrders") === "true",
    confirmPerformance: data.get("confirmPerformance") === "true",
  });
  const files: ParsedFile[] = [];
  for (const type of ["orders", "performance"] as ReportType[]) {
    const file = data.get(type);
    if (file !== null) {
      if (!(file instanceof File))
        throw new ImportError("Expected a CSV file.");
      files.push(
        parseReport(
          new Uint8Array(await file.arrayBuffer()),
          file.name,
          type,
          options.timezone,
        ),
      );
    }
  }
  if (!files.length)
    throw new ImportError("Choose an Orders or Performance CSV, or both.");
  return { options, files, token: String(data.get("token") ?? "") };
}
