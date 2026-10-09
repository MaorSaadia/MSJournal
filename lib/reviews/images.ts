import sharp from "sharp";
import { ReviewError } from "./model";
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024,
  MAX_IMAGES = 10;
export async function readBounded(request: Request, limit: number) {
  if (Number(request.headers.get("content-length")) > limit)
    throw new ReviewError("Upload or request is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ReviewError("No content received.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new ReviewError("Upload or request is too large.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
export async function validatedImage(bytes: Buffer) {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES)
    throw new ReviewError("Choose an image up to 10 MB.", 413);
  const png = bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
    webp =
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP";
  if (!png && !jpeg && !webp)
    throw new ReviewError(
      "Only actual PNG, JPEG and WebP images are supported.",
    );
  try {
    const input = sharp(bytes, {
        limitInputPixels: 40000000,
        failOn: "warning",
      }),
      meta = await input.metadata();
    if (
      !meta.width ||
      !meta.height ||
      meta.width > 16000 ||
      meta.height > 16000 ||
      meta.width * meta.height > 40000000 ||
      (meta.pages ?? 1) > 1 ||
      !["png", "jpeg", "webp"].includes(meta.format ?? "")
    )
      throw new Error();
    // Decode and re-encode to reject malformed/polyglot inputs and strip metadata.
    const full = await input
      .rotate()
      .toFormat(meta.format as "png" | "jpeg" | "webp", { quality: 95 })
      .toBuffer({ resolveWithObject: true });
    if (full.data.length > MAX_IMAGE_BYTES)
      throw new ReviewError(
        "The decoded screenshot exceeds 10 MB. Export a smaller image.",
        413,
      );
    const thumbnail = await sharp(full.data)
      .resize({
        width: 1200,
        height: 900,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 90 })
      .toBuffer();
    return {
      full: full.data,
      thumbnail,
      width: full.info.width,
      height: full.info.height,
      mime: `image/${meta.format}`,
      bytes: full.data.length,
    };
  } catch (e) {
    if (e instanceof ReviewError) throw e;
    throw new ReviewError(
      "Invalid image, animation, or excessive dimensions. Use a static image up to 16,000 pixels per side and 40 million pixels total.",
    );
  }
}
