import "server-only";
import { createHash } from "node:crypto";
import { types } from "pg";
import { getPool } from "@/db/client";
import { requireUser } from "@/lib/session";
import { ReviewError } from "@/lib/reviews/model";
import { objectStorage, storageEnabled } from "@/lib/reviews/storage";
import {
  backupCatalog,
  validateBackup,
  type BackupData,
  type BackupRow,
} from "./catalog";
import { zipArchive, MAX_ARCHIVE_BYTES, type ZipEntry } from "./zip";

export const MAX_BACKUP_ROWS = 100000,
  MAX_JSON_BYTES = 16 * 1024 * 1024,
  MAX_IMAGE_OBJECTS = 200;
export type ImageFile = {
  category: string;
  attachmentId: string;
  role: "original" | "thumbnail";
  path: string;
  status: "included" | "missing" | "not-requested" | "lifecycle-excluded";
  reason?: string;
  bytes?: number;
  sha256?: string;
};
export class MissingImagesError extends ReviewError {
  constructor(public missingCount: number) {
    super(
      `${missingCount} image files could not be retrieved. Retry, or explicitly download a partial archive.`,
      409,
    );
  }
}
const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
const jsonEntry = (path: string, data: unknown): ZipEntry => ({
  path,
  bytes: Buffer.from(JSON.stringify(data, null, 2) + "\n"),
});

/** One repeatable-read snapshot, cursor batches, hard row/byte/time limits. */
export async function backupSnapshot(ownerId: string, signal?: AbortSignal) {
  const connection = await getPool().connect();
  const data: BackupData = {};
  let count = 0,
    size = 0;
  try {
    await connection.query("begin isolation level repeatable read read only");
    await connection.query("set local statement_timeout = '30000ms'");
    await connection.query(
      "set local idle_in_transaction_session_timeout = '30000ms'",
    );
    await connection.query("set local timezone = 'UTC'");
    const clock = await connection.query(
      "select transaction_timestamp() as created_at",
    );
    const createdAt = new Date(clock.rows[0].created_at);
    data.auth_users = (
      await connection.query(
        "select id, name, email, created_at, updated_at from auth_users where id=$1",
        [ownerId],
      )
    ).rows;
    for (const category of backupCatalog) {
      if (
        category.columns.some((name) =>
          /password|token|secret|access_key/i.test(name),
        )
      )
        throw new Error("Unsafe backup schema.");
      await connection.query(
        `declare export_rows no scroll cursor for select ${category.columns.map(quote).join(",")} from ${quote(category.name)} where ${quote(category.ownerColumn)}=$1`,
        [ownerId],
      );
      const rows: BackupRow[] = [];
      while (true) {
        if (signal?.aborted) throw new ReviewError("Download canceled.", 499);
        const batch = await connection.query({
          text: "fetch forward 250 from export_rows",
          types: {
            getTypeParser: (oid: number) =>
              oid === 1082
                ? (value: string) => value
                : types.getTypeParser(oid),
          },
        });
        if (!batch.rows.length) break;
        for (const row of batch.rows) {
          count++;
          size += Buffer.byteLength(JSON.stringify(row));
          if (count > MAX_BACKUP_ROWS || size > MAX_JSON_BYTES)
            throw new ReviewError(
              "Structured backup exceeds 100,000 rows or 16 MiB. No truncated archive was produced; contact your operator for a database-level export.",
              413,
            );
          rows.push(row);
        }
      }
      await connection.query("close export_rows");
      data[category.name] = rows;
    }
    validateBackup(data, ownerId);
    await connection.query("commit");
    return { data, createdAt };
  } catch (error) {
    await connection.query("rollback").catch(() => {});
    if (error instanceof ReviewError) throw error;
    throw new ReviewError(
      "Could not create a consistent private backup. Retry; no archive was produced.",
      503,
    );
  } finally {
    connection.release();
  }
}

export async function backupImages(
  data: BackupData,
  include: boolean,
  allowPartial: boolean,
  read: ((key: string) => Promise<Buffer>) | null,
) {
  const files: ImageFile[] = [],
    entries: ZipEntry[] = [],
    missing: ImageFile[] = [];
  const objects = new Map<
    string,
    { path: string; bytes?: number; sha256?: string; failed?: boolean }
  >();
  let bytes = 0;
  for (const [category, prefix] of [
    ["review_attachments", "reviews"],
    ["strategy_images", "strategies"],
  ]) {
    for (const row of data[category] ?? []) {
      for (const role of ["original", "thumbnail"] as const) {
        const key = String(
          role === "original" ? row.object_key : row.thumbnail_key,
        );
        const id = String(row.id);
        const safeKey = new RegExp(
          `^${prefix}/[0-9a-f-]{36}/${id}${role === "thumbnail" ? "-thumb" : ""}$`,
        ).test(key);
        if (!safeKey)
          throw new ReviewError(
            "Attachment ownership metadata could not be verified. No archive was produced.",
            409,
          );
        const extension =
          role === "thumbnail"
            ? "webp"
            : (
                {
                  "image/png": "png",
                  "image/jpeg": "jpg",
                  "image/webp": "webp",
                } as Record<string, string>
              )[String(row.mime)];
        if (!extension)
          throw new ReviewError(
            "Unsupported attachment format in backup metadata.",
            409,
          );
        const path = `images/objects/${createHash("sha256").update(key).digest("hex")}.${extension}`;
        const file: ImageFile = {
          category,
          attachmentId: id,
          role,
          path,
          status:
            row.state !== "ready"
              ? "lifecycle-excluded"
              : include
                ? "missing"
                : "not-requested",
        };
        files.push(file);
        if (file.status !== "missing") continue;
        let object = objects.get(key);
        if (!object) {
          if (objects.size >= MAX_IMAGE_OBJECTS)
            throw new ReviewError(
              "Image backup exceeds 200 object files. Download structured data only, or ask your operator for an object-storage backup.",
              413,
            );
          object = { path };
          objects.set(key, object);
          try {
            if (!read) throw new Error();
            const binary = await read(key);
            if (
              !binary.length ||
              (role === "original" && binary.length !== Number(row.bytes))
            )
              throw new Error();
            if (binary.length > 10 * 1024 * 1024)
              throw new ReviewError(
                "An image exceeds the 10 MiB export limit.",
                413,
              );
            bytes += binary.length;
            if (bytes > MAX_ARCHIVE_BYTES - MAX_JSON_BYTES - 1024 * 1024)
              throw new ReviewError(
                "Image backup would exceed the 64 MiB archive limit. Download structured data only.",
                413,
              );
            object.bytes = binary.length;
            object.sha256 = createHash("sha256").update(binary).digest("hex");
            entries.push({ path, bytes: binary });
          } catch (error) {
            if (error instanceof ReviewError && error.status === 413)
              throw error;
            object.failed = true;
          }
        }
        if (object.failed) {
          file.reason = read
            ? "Object retrieval failed or size did not match metadata; it may have been removed after the snapshot."
            : "Private image storage is not configured.";
          missing.push(file);
        } else {
          file.status = "included";
          file.bytes = object.bytes;
          file.sha256 = object.sha256;
        }
      }
    }
  }
  if (missing.length && !allowPartial)
    throw new MissingImagesError(missing.length);
  return { files, entries, missing };
}

export async function createBackup(
  includeImages: boolean,
  allowPartial: boolean,
  headers: Headers,
  signal?: AbortSignal,
) {
  const owner = await requireUser(headers);
  const { data, createdAt } = await backupSnapshot(owner.id, signal);
  const deadline = AbortSignal.any([
    AbortSignal.timeout(120000),
    ...(signal ? [signal] : []),
  ]);
  const store =
    includeImages && storageEnabled() ? await objectStorage() : null;
  const images = await backupImages(
    data,
    includeImages,
    allowPartial,
    store ? (key) => store.get(key, 10 * 1024 * 1024, deadline) : null,
  );
  const entries = Object.entries(data).map(([name, rows]) =>
    jsonEntry(`data/${name}.json`, rows),
  );
  const jsonSize = entries.reduce((sum, file) => sum + file.bytes.length, 0);
  if (jsonSize > MAX_JSON_BYTES)
    throw new ReviewError(
      "Formatted structured data exceeds 16 MiB. No truncated archive was produced.",
      413,
    );
  const manifest = {
    format: "msjournal-portable-archive",
    version: 1,
    createdAt: createdAt.toISOString(),
    databaseSnapshot:
      "repeatable read; metadata from one read-only transaction",
    completeStructuredData: true,
    categories: entries.map((entry) => ({
      path: entry.path,
      count: data[entry.path.slice(5, -5)].length,
      bytes: entry.bytes.length,
      sha256: createHash("sha256").update(entry.bytes).digest("hex"),
    })),
    conventions: {
      columns: "Database snake_case names; IDs and revisions preserved.",
      decimals:
        "PostgreSQL numeric amounts encoded as decimal strings; unknown is null.",
      timestamps:
        "UTC ISO 8601 instants; calendar dates remain YYYY-MM-DD; daily observations preserve their recorded timezone/local time and event metadata.",
      currency:
        "Stored currency per account/entry; trading history currently USD.",
    },
    relationships: backupCatalog.map((c) => ({
      table: c.name,
      foreignKeys: c.foreignKeys,
    })),
    images: {
      requested: includeImages,
      includedObjectCount: images.entries.length,
      complete: includeImages ? images.missing.length === 0 : false,
      partialAccepted: allowPartial && images.missing.length > 0,
      files: images.files,
      missingFiles: images.missing,
      lifecycleExcludedCount: images.files.filter(
        (f) => f.status === "lifecycle-excluded",
      ).length,
    },
    exclusions: [
      "Passwords, authentication accounts, sessions, authentication tokens, rate limits, API/storage credentials, other users' data.",
      "Original uploaded CSV binaries are not stored by the app; their stored source rows and import metadata are included.",
      "Pending/deleting image binaries are excluded; their lifecycle metadata remains included.",
    ],
    limitations: [
      "Keep this archive for your records. In-app restoration is not available yet.",
      "This archive does not replace infrastructure-level database backups.",
      "Image reads occur after the metadata snapshot. Concurrent deletion or storage failure is reported as a missing file.",
      "This is a private unencrypted download; store the archive securely.",
    ],
    limits: {
      rows: MAX_BACKUP_ROWS,
      structuredBytes: MAX_JSON_BYTES,
      archiveBytes: MAX_ARCHIVE_BYTES,
      imageObjects: MAX_IMAGE_OBJECTS,
    },
  };
  entries.push(...images.entries, jsonEntry("manifest.json", manifest), {
    path: "MANIFEST.txt",
    bytes: Buffer.from(
      `MSJournal portable archive v1\nCreated: ${manifest.createdAt}\n\n${manifest.categories.map((c) => `${c.path}: ${c.count} records`).join("\n")}\n\nImages requested: ${includeImages}; included object files: ${images.entries.length}; missing: ${images.missing.length}.\nSee manifest.json for file paths, hashes and missing-image reasons.\n\n${manifest.limitations.join("\n")}\n`,
    ),
  });
  try {
    return {
      bytes: zipArchive(entries, createdAt),
      filename: `msjournal-data-v1-${createdAt.toISOString().replaceAll(":", "-")}${images.missing.length ? "-partial" : ""}.zip`,
    };
  } catch {
    throw new ReviewError(
      "Archive exceeds the 64 MiB limit. Try structured data only; no truncated file was produced.",
      413,
    );
  }
}
