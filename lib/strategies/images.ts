import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { strategies, strategyImages } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { NotFoundError } from "@/lib/accounts/service";
import { ReviewError } from "@/lib/reviews/model";
import { objectStorage } from "@/lib/reviews/storage";
import { validatedImage, MAX_IMAGES } from "@/lib/reviews/images";
import {
  ownedStrategy,
  strategyData,
  strategySafe,
  type StrategyTx,
} from "./service";
import { exampleTypes } from "./model";
async function ownedImage(tx: StrategyTx, userId: string, id: string) {
  z.uuid().parse(id);
  const [row] = await tx
    .select()
    .from(strategyImages)
    .where(and(eq(strategyImages.id, id), eq(strategyImages.ownerId, userId)));
  if (!row) throw new NotFoundError();
  return row;
}
async function bumpGallery(tx: StrategyTx, userId: string, id: string) {
  const row = await ownedStrategy(tx, userId, id, true);
  await tx
    .update(strategies)
    .set({ galleryRevision: row.galleryRevision + 1, updatedAt: new Date() })
    .where(eq(strategies.id, id));
}
export async function uploadExample(
  strategyId: string,
  bytes: Buffer,
  headers?: Headers,
) {
  const user = await requireUser(headers);
  await strategySafe(() =>
    getDb().transaction((tx) => ownedStrategy(tx, user.id, strategyId)),
  );
  const store = await objectStorage(),
    image = await validatedImage(bytes),
    id = randomUUID();
  const row = await strategySafe(() =>
    getDb().transaction(async (tx) => {
      const strategy = await ownedStrategy(tx, user.id, strategyId, true);
      if (strategy.archivedAt)
        throw new ReviewError("Restore the strategy before changing examples.");
      const images = await tx
        .select()
        .from(strategyImages)
        .where(
          and(
            eq(strategyImages.ownerId, user.id),
            eq(strategyImages.strategyId, strategyId),
          ),
        );
      if (images.filter((i) => i.state !== "deleting").length >= MAX_IMAGES)
        throw new ReviewError("Maximum 10 examples per playbook.");
      const key = `strategies/${randomUUID()}/${id}`;
      const [row] = await tx
        .insert(strategyImages)
        .values({
          id,
          ownerId: user.id,
          strategyId,
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
    await store.put(row.objectKey, image.full, image.mime);
    await store.put(row.thumbnailKey, image.thumbnail, "image/webp");
    return await strategySafe(() =>
      getDb().transaction(async (tx) => {
        const strategy = await ownedStrategy(tx, user.id, strategyId, true),
          pending = await ownedImage(tx, user.id, id);
        if (strategy.archivedAt || pending.state !== "pending")
          throw new ReviewError("Upload changed; retry cleanup.", 409);
        await tx
          .update(strategyImages)
          .set({ state: "ready" })
          .where(eq(strategyImages.id, id));
        await bumpGallery(tx, user.id, strategyId);
        return strategyData(tx, user.id, strategyId);
      }),
    );
  } catch (e) {
    await strategySafe(() =>
      getDb()
        .update(strategyImages)
        .set({ state: "deleting" })
        .where(
          and(eq(strategyImages.id, id), eq(strategyImages.state, "pending")),
        ),
    ).catch(() => {});
    await cleanupExamples(headers).catch(() => {});
    throw e;
  }
}
export async function exampleContent(
  id: string,
  thumbnail: boolean,
  headers?: Headers,
) {
  const user = await requireUser(headers),
    row = await strategySafe(() =>
      getDb().transaction((tx) => ownedImage(tx, user.id, id)),
    );
  if (row.state !== "ready") throw new NotFoundError();
  const store = await objectStorage();
  return {
    bytes: await store.get(thumbnail ? row.thumbnailKey : row.objectKey),
    mime: thumbnail ? "image/webp" : row.mime,
  };
}
export async function editExample(input: unknown, headers?: Headers) {
  const user = await requireUser(headers),
    v = z
      .object({
        id: z.uuid(),
        revision: z.number().int().positive(),
        caption: z.string().max(500),
        stage: z.enum(exampleTypes).nullable(),
      })
      .strict()
      .parse(input);
  return strategySafe(() =>
    getDb().transaction(async (tx) => {
      const row = await ownedImage(tx, user.id, v.id),
        strategy = await ownedStrategy(tx, user.id, row.strategyId, true);
      if (strategy.archivedAt)
        throw new ReviewError("Restore the strategy before editing examples.");
      const fresh = await ownedImage(tx, user.id, v.id);
      if (fresh.state !== "ready" || fresh.revision !== v.revision)
        throw new ReviewError(
          "Image metadata changed. Refresh before saving.",
          409,
        );
      await tx
        .update(strategyImages)
        .set({ caption: v.caption, stage: v.stage, revision: v.revision + 1 })
        .where(eq(strategyImages.id, row.id));
      await bumpGallery(tx, user.id, row.strategyId);
      return { saved: true };
    }),
  );
}
export async function orderExamples(input: unknown, headers?: Headers) {
  const user = await requireUser(headers),
    v = z
      .object({
        strategyId: z.uuid(),
        revision: z.number().int().positive(),
        ids: z.array(z.uuid()).max(10),
      })
      .strict()
      .parse(input);
  return strategySafe(() =>
    getDb().transaction(async (tx) => {
      const strategy = await ownedStrategy(tx, user.id, v.strategyId, true);
      if (strategy.archivedAt)
        throw new ReviewError("Restore the strategy before editing examples.");
      const images = await tx
        .select()
        .from(strategyImages)
        .where(
          and(
            eq(strategyImages.ownerId, user.id),
            eq(strategyImages.strategyId, v.strategyId),
            eq(strategyImages.state, "ready"),
          ),
        );
      if (
        strategy.galleryRevision !== v.revision ||
        v.ids.length !== images.length ||
        new Set(v.ids).size !== images.length ||
        v.ids.some((id) => !images.some((i) => i.id === id))
      )
        throw new ReviewError(
          "Examples changed. Refresh before reordering.",
          409,
        );
      for (const [position, id] of v.ids.entries())
        await tx
          .update(strategyImages)
          .set({ position })
          .where(eq(strategyImages.id, id));
      await bumpGallery(tx, user.id, strategy.id);
      return strategyData(tx, user.id, strategy.id);
    }),
  );
}
export async function removeExample(id: string, headers?: Headers) {
  const user = await requireUser(headers);
  const row = await strategySafe(() =>
    getDb().transaction(async (tx) => {
      const image = await ownedImage(tx, user.id, id),
        strategy = await ownedStrategy(tx, user.id, image.strategyId, true);
      if (strategy.archivedAt)
        throw new ReviewError("Restore the strategy before removing examples.");
      await tx
        .update(strategyImages)
        .set({ state: "deleting" })
        .where(eq(strategyImages.id, id));
      await bumpGallery(tx, user.id, strategy.id);
      return image;
    }),
  );
  const store = await objectStorage();
  await store.remove(row.objectKey);
  await store.remove(row.thumbnailKey);
  await strategySafe(() =>
    getDb()
      .delete(strategyImages)
      .where(
        and(
          eq(strategyImages.id, id),
          eq(strategyImages.ownerId, user.id),
          eq(strategyImages.state, "deleting"),
        ),
      ),
  );
  return { removed: true };
}
export async function cleanupExamples(headers?: Headers) {
  const user = await requireUser(headers),
    store = await objectStorage();
  const rows = await strategySafe(() =>
    getDb()
      .select()
      .from(strategyImages)
      .where(
        and(
          eq(strategyImages.ownerId, user.id),
          lt(strategyImages.createdAt, new Date(Date.now() - 3600000)),
        ),
      ),
  );
  const deleting = await strategySafe(() =>
    getDb()
      .select()
      .from(strategyImages)
      .where(
        and(
          eq(strategyImages.ownerId, user.id),
          eq(strategyImages.state, "deleting"),
        ),
      ),
  );
  for (const row of [
    ...new Map(
      [...rows.filter((i) => i.state === "pending"), ...deleting].map((i) => [
        i.id,
        i,
      ]),
    ).values(),
  ]) {
    const marked = await strategySafe(() =>
      getDb().transaction(async (tx) => {
        await ownedStrategy(tx, user.id, row.strategyId, true);
        const fresh = await ownedImage(tx, user.id, row.id);
        if (fresh.state === "ready") return false;
        await tx
          .update(strategyImages)
          .set({ state: "deleting" })
          .where(eq(strategyImages.id, row.id));
        return true;
      }),
    );
    if (!marked) continue;
    await store.remove(row.objectKey);
    await store.remove(row.thumbnailKey);
    await strategySafe(() =>
      getDb()
        .delete(strategyImages)
        .where(
          and(
            eq(strategyImages.ownerId, user.id),
            eq(strategyImages.id, row.id),
            eq(strategyImages.state, "deleting"),
          ),
        ),
    );
  }
  return { cleaned: true };
}
