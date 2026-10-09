import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql, lt, or, count } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import {
  journalRecords,
  journalSources,
  journalReviews,
  reviewSources,
  reviewTags,
  reviewAttachments,
  tradingAccounts,
  userPreferences,
} from "@/db/schema";
import { requireUser } from "@/lib/session";
import { NotFoundError } from "@/lib/accounts/service";
import { WorkspaceUnavailableError } from "@/lib/server-error";
import {
  emptyFields,
  hasNotes,
  meaningful,
  mistakes,
  saveReviewSchema,
  unchangedAssociation,
  ReviewError,
  stages,
  type ReviewData,
} from "./model";
import { objectStorage, storageEnabled } from "./storage";
import { validatedImage, MAX_IMAGES } from "./images";
type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
async function safe<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (
      e instanceof NotFoundError ||
      e instanceof ReviewError ||
      e instanceof z.ZodError
    )
      throw e;
    throw new WorkspaceUnavailableError();
  }
}
export async function lockReviewAccount(
  tx: Tx,
  userId: string,
  accountId: string,
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${userId + ":" + accountId},0))`,
  );
  const [account] = await tx
    .select()
    .from(tradingAccounts)
    .where(
      and(
        eq(tradingAccounts.id, accountId),
        eq(tradingAccounts.ownerId, userId),
      ),
    );
  if (!account) throw new NotFoundError();
}
async function ownedRecord(tx: Tx, ownerId: string, id: string) {
  const [row] = await tx
    .select()
    .from(journalRecords)
    .where(
      and(
        eq(journalRecords.id, id),
        eq(journalRecords.ownerId, ownerId),
        eq(journalRecords.current, true),
      ),
    );
  if (!row) throw new NotFoundError();
  return row;
}
async function lockedRecord(tx: Tx, ownerId: string, id: string) {
  const row = await ownedRecord(tx, ownerId, id);
  await lockReviewAccount(tx, ownerId, row.tradingAccountId);
  return ownedRecord(tx, ownerId, id);
}
async function ownedReview(tx: Tx, ownerId: string, id: string) {
  const [row] = await tx
    .select()
    .from(journalReviews)
    .innerJoin(
      journalRecords,
      and(
        eq(journalRecords.id, journalReviews.originalRecordId),
        eq(journalRecords.ownerId, ownerId),
      ),
    )
    .where(and(eq(journalReviews.id, id), eq(journalReviews.ownerId, ownerId)));
  if (!row) throw new NotFoundError();
  return row.journal_reviews;
}
async function createReview(
  tx: Tx,
  ownerId: string,
  record: typeof journalRecords.$inferSelect,
) {
  const links = await tx
    .select()
    .from(journalSources)
    .where(
      and(
        eq(journalSources.ownerId, ownerId),
        eq(journalSources.recordId, record.id),
      ),
    );
  if (!links.length)
    throw new ReviewError(
      "The record is awaiting processing. Retry shortly.",
      409,
    );
  const [row] = await tx
    .insert(journalReviews)
    .values({
      ownerId,
      tradingAccountId: record.tradingAccountId,
      recordId: record.id,
      originalRecordId: record.id,
      originalSymbol: record.symbol,
      originalSourceIds: links.map((l) => l.sourceId),
      fields: emptyFields(),
    })
    .returning();
  await tx.insert(reviewSources).values(
    links.map((l) => ({
      reviewId: row.id,
      sourceId: l.sourceId,
      ownerId,
      tradingAccountId: record.tradingAccountId,
    })),
  );
  return row;
}
async function reviewData(
  tx: Tx,
  ownerId: string,
  row: typeof journalReviews.$inferSelect | undefined,
  recordId: string | null,
): Promise<ReviewData> {
  const [pref] = await tx
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, ownerId));
  const tags = await tx
    .select()
    .from(reviewTags)
    .where(eq(reviewTags.ownerId, ownerId));
  const images = row
    ? (
        await tx
          .select()
          .from(reviewAttachments)
          .where(
            and(
              eq(reviewAttachments.reviewId, row.id),
              eq(reviewAttachments.ownerId, ownerId),
              eq(reviewAttachments.state, "ready"),
            ),
          )
          .orderBy(reviewAttachments.position, reviewAttachments.id)
      ).map(({ id, caption, stage, position, width, height, revision }) => ({
        id,
        caption,
        stage,
        position,
        width,
        height,
        revision,
      }))
    : [];
  return {
    userId: ownerId,
    timezone: pref?.displayTimezone ?? "Asia/Jerusalem",
    id: row?.id ?? null,
    recordId: row?.recordId ?? recordId,
    revision: row?.revision ?? 0,
    status: row?.status ?? "draft",
    fields: row?.fields ?? emptyFields(),
    needsReassignment: row?.needsReassignment ?? false,
    tags: tags.map(({ id, name, archived }) => ({ id, name, archived })),
    images,
    storageEnabled: storageEnabled(),
  };
}
export async function getReview(recordId: string, headers?: Headers) {
  const owner = await requireUser(headers);
  z.uuid().parse(recordId);
  return safe(() =>
    getDb().transaction(
      async (tx) => {
        await ownedRecord(tx, owner.id, recordId);
        const [row] = await tx
          .select()
          .from(journalReviews)
          .where(
            and(
              eq(journalReviews.ownerId, owner.id),
              eq(journalReviews.recordId, recordId),
            ),
          );
        return reviewData(tx, owner.id, row, recordId);
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    ),
  );
}
export async function saveReview(input: unknown, headers?: Headers) {
  const owner = await requireUser(headers),
    v = saveReviewSchema.parse(input);
  return safe(() =>
    getDb().transaction(async (tx) => {
      const record = await lockedRecord(tx, owner.id, v.recordId);
      let [row] = await tx
        .select()
        .from(journalReviews)
        .where(
          and(
            eq(journalReviews.ownerId, owner.id),
            eq(journalReviews.recordId, v.recordId),
          ),
        );
      if ((row?.revision ?? 0) !== v.revision)
        throw new ReviewError(
          "This review changed in another tab or after reprocessing. Your edits are kept. Compare the saved version before continuing.",
          409,
        );
      const custom = v.fields.mistakes.filter(
        (id) => !mistakes.some(([key]) => key === id),
      );
      if (custom.length) {
        const tags = await tx
          .select()
          .from(reviewTags)
          .where(
            and(
              eq(reviewTags.ownerId, owner.id),
              inArray(
                reviewTags.id,
                custom.filter((id) => z.uuid().safeParse(id).success),
              ),
            ),
          );
        if (
          custom.some(
            (id) =>
              !tags.some(
                (t) =>
                  t.id === id &&
                  (!t.archived || row?.fields.mistakes.includes(id)),
              ),
          )
        )
          throw new ReviewError(
            "Choose your own active mistake tags. Previously assigned archived tags can stay attached.",
          );
      }
      if (!row && !meaningful(v.fields) && v.status === "draft")
        return reviewData(tx, owner.id, undefined, v.recordId);
      if (!row) row = await createReview(tx, owner.id, record);
      const [updated] = await tx
        .update(journalReviews)
        .set({
          fields: v.fields,
          status: v.status,
          hasContent: meaningful(v.fields),
          hasNotes: hasNotes(v.fields),
          revision: row.revision + (v.revision === 0 ? 0 : 1),
          updatedAt: new Date(),
        })
        .where(eq(journalReviews.id, row.id))
        .returning();
      return reviewData(tx, owner.id, updated, v.recordId);
    }),
  );
}
export async function listReviewTags(headers?: Headers) {
  const owner = await requireUser(headers);
  return safe(async () => {
    const tags = await getDb()
      .select()
      .from(reviewTags)
      .where(eq(reviewTags.ownerId, owner.id))
      .orderBy(reviewTags.name);
    return tags.map(({ id, name, archived }) => ({ id, name, archived }));
  });
}
const tagInput = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1).max(60),
    archived: z.boolean().default(false),
  })
  .strict();
export async function saveReviewTag(input: unknown, headers?: Headers) {
  const owner = await requireUser(headers),
    v = tagInput.parse(input);
  return safe(() =>
    getDb().transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${"review-tags:" + owner.id},0))`,
      );
      const collection = await tx
        .select()
        .from(reviewTags)
        .where(eq(reviewTags.ownerId, owner.id));
      if (v.id && !collection.some((t) => t.id === v.id))
        throw new NotFoundError();
      if (
        collection.some(
          (t) => t.id !== v.id && t.name.toLowerCase() === v.name.toLowerCase(),
        ) ||
        mistakes.some(([, name]) => name.toLowerCase() === v.name.toLowerCase())
      )
        throw new ReviewError(
          "A mistake tag with that name already exists.",
          409,
        );
      if (!v.id && collection.length >= 100)
        throw new ReviewError(
          "Keep your collection within 100 custom mistake tags.",
        );
      const [tag] = v.id
        ? await tx
            .update(reviewTags)
            .set({ name: v.name, archived: v.archived })
            .where(
              and(eq(reviewTags.id, v.id), eq(reviewTags.ownerId, owner.id)),
            )
            .returning()
        : await tx
            .insert(reviewTags)
            .values({ ownerId: owner.id, name: v.name, archived: v.archived })
            .returning();
      return { id: tag.id, name: tag.name, archived: tag.archived };
    }),
  );
}
export async function reconcileReviews(
  tx: Tx,
  ownerId: string,
  accountId: string,
  current: { id: string; sourceIds: string[] }[],
) {
  const reviews = await tx
    .select()
    .from(journalReviews)
    .where(
      and(
        eq(journalReviews.ownerId, ownerId),
        eq(journalReviews.tradingAccountId, accountId),
        eq(journalReviews.needsReassignment, false),
      ),
    );
  const sources = await tx
    .select()
    .from(reviewSources)
    .where(
      and(
        eq(reviewSources.ownerId, ownerId),
        eq(reviewSources.tradingAccountId, accountId),
      ),
    );
  for (const review of reviews) {
    const target = unchangedAssociation(
      sources.filter((s) => s.reviewId === review.id).map((s) => s.sourceId),
      current,
    );
    if (target !== review.recordId)
      await tx
        .update(journalReviews)
        .set({
          recordId: target,
          needsReassignment: target === null,
          revision: review.revision + 1,
          updatedAt: new Date(),
        })
        .where(eq(journalReviews.id, review.id));
  }
}
export async function recoveryReviews(headers?: Headers) {
  const owner = await requireUser(headers);
  return safe(() =>
    getDb().transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(journalReviews)
        .where(
          and(
            eq(journalReviews.ownerId, owner.id),
            eq(journalReviews.needsReassignment, true),
          ),
        );
      return Promise.all(
        rows.map(async (row) => ({
          ...(await reviewData(tx, owner.id, row, null)),
          symbol: row.originalSymbol,
          accountId: row.tradingAccountId,
          originalSourceIds: row.originalSourceIds,
        })),
      );
    }),
  );
}
export async function reassignReview(input: unknown, headers?: Headers) {
  const owner = await requireUser(headers),
    v = z
      .object({
        reviewId: z.uuid(),
        recordId: z.uuid(),
        revision: z.number().int().positive(),
      })
      .strict()
      .parse(input);
  return safe(() =>
    getDb().transaction(async (tx) => {
      const record = await lockedRecord(tx, owner.id, v.recordId),
        review = await ownedReview(tx, owner.id, v.reviewId);
      if (review.tradingAccountId !== record.tradingAccountId)
        throw new ReviewError(
          "Choose a record from the review's original account.",
        );
      if (!review.needsReassignment || review.revision !== v.revision)
        throw new ReviewError(
          "The review association changed. Refresh before assigning it.",
          409,
        );
      const [existing] = await tx
        .select()
        .from(journalReviews)
        .where(
          and(
            eq(journalReviews.ownerId, owner.id),
            eq(journalReviews.recordId, v.recordId),
          ),
        );
      if (existing)
        throw new ReviewError(
          "That record already has a review. Both reviews were kept; choose another record.",
          409,
        );
      await tx
        .delete(reviewSources)
        .where(
          and(
            eq(reviewSources.ownerId, owner.id),
            eq(reviewSources.reviewId, review.id),
          ),
        );
      const links = await tx
        .select()
        .from(journalSources)
        .where(
          and(
            eq(journalSources.recordId, record.id),
            eq(journalSources.ownerId, owner.id),
          ),
        );
      await tx.insert(reviewSources).values(
        links.map((l) => ({
          reviewId: review.id,
          sourceId: l.sourceId,
          ownerId: owner.id,
          tradingAccountId: record.tradingAccountId,
        })),
      );
      const [updated] = await tx
        .update(journalReviews)
        .set({
          recordId: record.id,
          needsReassignment: false,
          revision: review.revision + 1,
          updatedAt: new Date(),
        })
        .where(eq(journalReviews.id, review.id))
        .returning();
      return reviewData(tx, owner.id, updated, record.id);
    }),
  );
}
export async function uploadScreenshot(
  recordId: string,
  buffer: Buffer,
  headers?: Headers,
) {
  const owner = await requireUser(headers);
  z.uuid().parse(recordId);
  await safe(() =>
    getDb().transaction((tx) => ownedRecord(tx, owner.id, recordId)),
  );
  const storage = await objectStorage(),
    image = await validatedImage(buffer),
    id = randomUUID();
  const attachment = await safe(() =>
    getDb().transaction(async (tx) => {
      const record = await lockedRecord(tx, owner.id, recordId);
      let [review] = await tx
        .select()
        .from(journalReviews)
        .where(
          and(
            eq(journalReviews.ownerId, owner.id),
            eq(journalReviews.recordId, recordId),
          ),
        );
      if (!review) review = await createReview(tx, owner.id, record);
      const images = await tx
        .select()
        .from(reviewAttachments)
        .where(
          and(
            eq(reviewAttachments.reviewId, review.id),
            eq(reviewAttachments.ownerId, owner.id),
          ),
        );
      if (images.filter((a) => a.state !== "deleting").length >= MAX_IMAGES)
        throw new ReviewError("Maximum 10 screenshots per record.");
      const key = `reviews/${randomUUID()}/${id}`;
      const [row] = await tx
        .insert(reviewAttachments)
        .values({
          id,
          reviewId: review.id,
          ownerId: owner.id,
          tradingAccountId: record.tradingAccountId,
          objectKey: key,
          thumbnailKey: key + "-thumb",
          mime: image.mime,
          bytes: image.bytes,
          width: image.width,
          height: image.height,
          position: Math.max(-1, ...images.map((i) => i.position)) + 1,
        })
        .returning();
      return row;
    }),
  );
  try {
    await storage.put(attachment.objectKey, image.full, image.mime);
    await storage.put(attachment.thumbnailKey, image.thumbnail, "image/webp");
    return await safe(() =>
      getDb().transaction(async (tx) => {
        await lockReviewAccount(tx, owner.id, attachment.tradingAccountId);
        const record = await ownedRecord(tx, owner.id, recordId),
          review = await ownedReview(tx, owner.id, attachment.reviewId);
        const [pending] = await tx
          .select()
          .from(reviewAttachments)
          .where(
            and(
              eq(reviewAttachments.id, id),
              eq(reviewAttachments.ownerId, owner.id),
              eq(reviewAttachments.state, "pending"),
            ),
          );
        const [counts] = await tx
          .select({ n: count() })
          .from(reviewAttachments)
          .where(
            and(
              eq(reviewAttachments.reviewId, review.id),
              eq(reviewAttachments.ownerId, owner.id),
              eq(reviewAttachments.state, "ready"),
            ),
          );
        if (
          !pending ||
          review.recordId !== record.id ||
          counts.n >= MAX_IMAGES ||
          image.bytes > 10485760 ||
          image.width * image.height > 40000000
        )
          throw new ReviewError(
            "The record or upload limit changed. Upload again to the current record.",
            409,
          );
        await tx
          .update(reviewAttachments)
          .set({ state: "ready" })
          .where(eq(reviewAttachments.id, id));
        await tx
          .update(journalReviews)
          .set({ revision: review.revision + 1, updatedAt: new Date() })
          .where(eq(journalReviews.id, review.id));
        return reviewData(
          tx,
          owner.id,
          { ...review, revision: review.revision + 1 },
          recordId,
        );
      }),
    );
  } catch (e) {
    await getDb()
      .update(reviewAttachments)
      .set({ state: "deleting" })
      .where(
        and(
          eq(reviewAttachments.id, id),
          eq(reviewAttachments.ownerId, owner.id),
        ),
      )
      .catch(() => {});
    await cleanupScreenshots(owner.id).catch(() => {});
    if (e instanceof ReviewError || e instanceof WorkspaceUnavailableError)
      throw e;
    throw new ReviewError(
      "Upload failed. The attachment is not published. Retry when storage is available.",
      503,
    );
  }
}
export async function screenshotContent(
  id: string,
  thumbnail: boolean,
  headers?: Headers,
) {
  const owner = await requireUser(headers);
  z.uuid().parse(id);
  const attachment = await safe(() =>
    getDb().transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(reviewAttachments)
        .where(
          and(
            eq(reviewAttachments.id, id),
            eq(reviewAttachments.ownerId, owner.id),
            eq(reviewAttachments.state, "ready"),
          ),
        );
      if (!row) throw new NotFoundError();
      await ownedReview(tx, owner.id, row.reviewId);
      return row;
    }),
  );
  const store = await objectStorage();
  return {
    bytes: await store.get(
      thumbnail ? attachment.thumbnailKey : attachment.objectKey,
    ),
    mime: thumbnail ? "image/webp" : attachment.mime,
  };
}
export async function editScreenshot(input: unknown, headers?: Headers) {
  const owner = await requireUser(headers),
    v = z
      .object({
        id: z.uuid(),
        revision: z.number().int().positive(),
        caption: z.string().max(500),
        stage: z.enum(stages).nullable(),
      })
      .strict()
      .parse(input);
  return safe(() =>
    getDb().transaction(async (tx) => {
      const [image] = await tx
        .select()
        .from(reviewAttachments)
        .where(
          and(
            eq(reviewAttachments.id, v.id),
            eq(reviewAttachments.ownerId, owner.id),
            eq(reviewAttachments.state, "ready"),
          ),
        );
      if (!image) throw new NotFoundError();
      await lockReviewAccount(tx, owner.id, image.tradingAccountId);
      await ownedReview(tx, owner.id, image.reviewId);
      const [updated] = await tx
        .update(reviewAttachments)
        .set({ caption: v.caption, stage: v.stage, revision: v.revision + 1 })
        .where(
          and(
            eq(reviewAttachments.id, v.id),
            eq(reviewAttachments.revision, v.revision),
            eq(reviewAttachments.state, "ready"),
          ),
        )
        .returning();
      if (!updated)
        throw new ReviewError(
          "Screenshot metadata changed. Reload before saving.",
          409,
        );
      return {
        id: updated.id,
        caption: updated.caption,
        stage: updated.stage,
        position: updated.position,
        width: updated.width,
        height: updated.height,
        revision: updated.revision,
      };
    }),
  );
}
export async function reorderScreenshots(input: unknown, headers?: Headers) {
  const owner = await requireUser(headers),
    v = z
      .object({
        reviewId: z.uuid(),
        ids: z.array(z.uuid()).max(MAX_IMAGES),
        revision: z.number().int().positive(),
      })
      .strict()
      .parse(input);
  return safe(() =>
    getDb().transaction(async (tx) => {
      let review = await ownedReview(tx, owner.id, v.reviewId);
      await lockReviewAccount(tx, owner.id, review.tradingAccountId);
      review = await ownedReview(tx, owner.id, v.reviewId);
      const images = await tx
        .select()
        .from(reviewAttachments)
        .where(
          and(
            eq(reviewAttachments.ownerId, owner.id),
            eq(reviewAttachments.reviewId, review.id),
            eq(reviewAttachments.state, "ready"),
          ),
        );
      if (
        review.revision !== v.revision ||
        v.ids.length !== images.length ||
        new Set(v.ids).size !== images.length ||
        v.ids.some((id) => !images.some((i) => i.id === id))
      )
        throw new ReviewError(
          "Screenshot order changed. Refresh before reordering.",
          409,
        );
      for (let i = 0; i < v.ids.length; i++)
        await tx
          .update(reviewAttachments)
          .set({ position: i })
          .where(eq(reviewAttachments.id, v.ids[i]));
      await tx
        .update(journalReviews)
        .set({ revision: review.revision + 1 })
        .where(eq(journalReviews.id, review.id));
      return reviewData(
        tx,
        owner.id,
        { ...review, revision: review.revision + 1 },
        review.recordId,
      );
    }),
  );
}
export async function removeScreenshot(id: string, headers?: Headers) {
  const owner = await requireUser(headers);
  z.uuid().parse(id);
  await safe(() =>
    getDb().transaction(async (tx) => {
      const [image] = await tx
        .select()
        .from(reviewAttachments)
        .where(
          and(
            eq(reviewAttachments.id, id),
            eq(reviewAttachments.ownerId, owner.id),
          ),
        );
      if (!image) throw new NotFoundError();
      await lockReviewAccount(tx, owner.id, image.tradingAccountId);
      const review = await ownedReview(tx, owner.id, image.reviewId);
      await tx
        .update(reviewAttachments)
        .set({ state: "deleting" })
        .where(eq(reviewAttachments.id, id));
      await tx
        .update(journalReviews)
        .set({ revision: review.revision + 1, updatedAt: new Date() })
        .where(eq(journalReviews.id, review.id));
    }),
  );
  await cleanupScreenshots(owner.id);
  return { removed: true };
}
// Pending metadata is a durable cleanup ledger; deletion is idempotent and retryable.
export async function cleanupScreenshots(ownerId: string) {
  const store = await objectStorage();
  const rows = await getDb()
    .select()
    .from(reviewAttachments)
    .where(
      and(
        eq(reviewAttachments.ownerId, ownerId),
        or(
          eq(reviewAttachments.state, "deleting"),
          and(
            eq(reviewAttachments.state, "pending"),
            lt(reviewAttachments.createdAt, new Date(Date.now() - 3600000)),
          ),
        ),
      ),
    )
    .limit(50);
  for (const image of rows) {
    await getDb().transaction(async (tx) => {
      await lockReviewAccount(tx, ownerId, image.tradingAccountId);
      const [current] = await tx
        .select()
        .from(reviewAttachments)
        .where(
          and(
            eq(reviewAttachments.id, image.id),
            eq(reviewAttachments.ownerId, ownerId),
          ),
        )
        .for("update");
      if (!current || current.state === "ready") return;
      const references = await tx
        .select()
        .from(reviewAttachments)
        .where(
          and(
            eq(reviewAttachments.state, "ready"),
            or(
              inArray(reviewAttachments.objectKey, [
                image.objectKey,
                image.thumbnailKey,
              ]),
              inArray(reviewAttachments.thumbnailKey, [
                image.objectKey,
                image.thumbnailKey,
              ]),
            ),
          ),
        );
      if (references.length)
        throw new ReviewError(
          "The object is still referenced and was kept.",
          409,
        );
      await store.remove(image.objectKey);
      await store.remove(image.thumbnailKey);
      await tx
        .delete(reviewAttachments)
        .where(eq(reviewAttachments.id, image.id));
    });
  }
  return { cleaned: rows.length };
}
export async function cleanupMyScreenshots(headers?: Headers) {
  const owner = await requireUser(headers);
  return safe(() => cleanupScreenshots(owner.id));
}
