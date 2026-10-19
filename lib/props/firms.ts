import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { userPreferences } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { WorkspaceUnavailableError } from "@/lib/server-error";
import { ReviewError } from "@/lib/reviews/model";
import { firmTiles } from "./setup-model";

const firmInput = z
  .object({ name: z.string().trim().min(1).max(100) })
  .strict();
export async function listPropFirms(headers?: Headers) {
  const owner = await requireUser(headers);
  try {
    const [row] = await getDb()
      .select({ names: userPreferences.propFirmNames })
      .from(userPreferences)
      .where(eq(userPreferences.userId, owner.id));
    return row?.names ?? [];
  } catch {
    throw new WorkspaceUnavailableError();
  }
}
export async function addPropFirm(input: unknown, headers: Headers) {
  const owner = await requireUser(headers);
  const { name: requested } = firmInput.parse(input);
  const known = firmTiles.find(
    (f) =>
      f.id !== "Custom" &&
      [f.id.toLowerCase(), f.name.toLowerCase()].includes(
        requested.toLowerCase(),
      ),
  );
  const name = known?.name ?? requested;
  try {
    return await getDb().transaction(async (tx) => {
      await tx
        .insert(userPreferences)
        .values({ userId: owner.id })
        .onConflictDoNothing({ target: userPreferences.userId });
      const [row] = await tx
        .select({ names: userPreferences.propFirmNames })
        .from(userPreferences)
        .where(eq(userPreferences.userId, owner.id))
        .for("update");
      const names = row.names;
      if (names.some((n) => n.toLowerCase() === name.toLowerCase()))
        return names;
      if (names.length >= 50)
        throw new ReviewError("You can save up to 50 firm groups.", 400);
      const next = [...names, name];
      await tx
        .update(userPreferences)
        .set({ propFirmNames: next, updatedAt: new Date() })
        .where(eq(userPreferences.userId, owner.id));
      return next;
    });
  } catch (e) {
    if (e instanceof ReviewError) throw e;
    throw new WorkspaceUnavailableError();
  }
}
