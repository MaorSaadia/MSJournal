import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { tradingAccounts, userPreferences } from "@/db/schema";
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

/** Remove only the signed-in user's saved, empty group; never delete accounts. */
export async function deletePropFirm(input: unknown, headers: Headers) {
  const owner = await requireUser(headers);
  const { name } = firmInput.parse(input);
  try {
    return await getDb().transaction(async (tx) => {
      const [row] = await tx
        .select({ names: userPreferences.propFirmNames })
        .from(userPreferences)
        .where(eq(userPreferences.userId, owner.id))
        .for("update");
      const saved = row?.names.find((n) => n.toLowerCase() === name.toLowerCase());
      if (!saved) throw new ReviewError("Firm group not found.", 404);
      const preset = firmTiles.find((f) => f.id !== "Custom" &&
        [f.id.toLowerCase(), f.name.toLowerCase()].includes(saved.toLowerCase()));
      const aliases = [...new Set([saved, ...(preset ? [preset.id, preset.name] : [])])]
        .map((value) => value.toLowerCase());
      const [account] = await tx.select({ id: tradingAccounts.id })
        .from(tradingAccounts)
        .where(and(eq(tradingAccounts.ownerId, owner.id),
          inArray(sql`lower(${tradingAccounts.firm})`, aliases)))
        .limit(1);
      if (account) throw new ReviewError(
        "This firm still has accounts, including archived accounts. Only empty firm groups can be deleted.", 409);
      const names = row.names.filter((n) => n !== saved);
      await tx.update(userPreferences)
        .set({ propFirmNames: names, updatedAt: new Date() })
        .where(eq(userPreferences.userId, owner.id));
      return names;
    });
  } catch (e) {
    if (e instanceof ReviewError) throw e;
    throw new WorkspaceUnavailableError();
  }
}
