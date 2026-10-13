import "server-only";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { ReviewError } from "./model";
export function storageConfig() {
  const bucket = process.env.SCREENSHOT_S3_BUCKET,
    region = process.env.SCREENSHOT_S3_REGION,
    accessKeyId = process.env.SCREENSHOT_S3_ACCESS_KEY_ID,
    secretAccessKey = process.env.SCREENSHOT_S3_SECRET_ACCESS_KEY,
    endpoint = process.env.SCREENSHOT_S3_ENDPOINT;
  if (!bucket || !region || !accessKeyId || !secretAccessKey) return null;
  if (endpoint) {
    try {
      const url = new URL(endpoint);
      if (
        url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
        )
      )
        return null;
    } catch {
      return null;
    }
  }
  return {
    bucket,
    region,
    credentials: { accessKeyId, secretAccessKey },
    endpoint,
    forcePathStyle: process.env.SCREENSHOT_S3_FORCE_PATH_STYLE === "true",
  };
}
export function storageEnabled() {
  return storageConfig() !== null;
}
export async function objectStorage() {
  const config = storageConfig();
  if (!config)
    throw new ReviewError(
      "Screenshot storage needs setup. Reviews still work. Configure the private S3 bucket variables in README.",
      503,
    );
  const client = new S3Client({
    ...config,
    maxAttempts: 2,
    requestHandler: { requestTimeout: 30000, connectionTimeout: 5000 },
  });
  return {
    put: async (key: string, body: Buffer, mime: string) => {
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: key,
            Body: body,
            ContentType: mime,
            CacheControl: "private, no-store",
          }),
        );
      } catch {
        throw new ReviewError(
          "Screenshot storage is unavailable. Your review is safe; retry the upload.",
          503,
        );
      }
    },
    get: async (
      key: string,
      limit = 10 * 1024 * 1024,
      signal?: AbortSignal,
    ) => {
      try {
        const result = await client.send(
          new GetObjectCommand({ Bucket: config.bucket, Key: key }),
          { abortSignal: signal },
        );
        if (!result.Body) throw new Error();
        const reader = result.Body.transformToWebStream().getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > limit || signal?.aborted) {
              await reader.cancel();
              throw new Error();
            }
            chunks.push(value);
          }
        } finally {
          reader.releaseLock();
        }
        return Buffer.concat(chunks);
      } catch {
        throw new ReviewError(
          "Screenshot could not be loaded. Retry shortly.",
          503,
        );
      }
    },
    remove: async (key: string) => {
      try {
        await client.send(
          new DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
        );
      } catch {
        throw new ReviewError(
          "Storage removal is pending. Retry cleanup when storage is available.",
          503,
        );
      }
    },
  };
}
