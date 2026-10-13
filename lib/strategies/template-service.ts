import "server-only";
import { and, eq, desc } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { strategyTemplates, userPreferences } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { NotFoundError } from "@/lib/accounts/service";
import { ReviewError } from "@/lib/reviews/model";
import { strategySafe } from "./service";
import { playbookSchema, type Playbook } from "./model";
export type PersonalTemplate = {
  id: string;
  revision: number;
  fields: Playbook;
  updatedAt: string;
};
export type TemplateList = {
  userId: string;
  timezone: string;
  templates: PersonalTemplate[];
};
export async function listTemplates(headers?: Headers): Promise<TemplateList> {
  const owner = await requireUser(headers);
  return strategySafe(() =>
    getDb().transaction(async (tx) => {
      const [pref] = await tx
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, owner.id));
      const rows = await tx
        .select()
        .from(strategyTemplates)
        .where(eq(strategyTemplates.ownerId, owner.id))
        .orderBy(desc(strategyTemplates.updatedAt));
      return {
        userId: owner.id,
        timezone: pref?.displayTimezone ?? "Asia/Jerusalem",
        templates: rows.map((r) => ({
          id: r.id,
          revision: r.revision,
          fields: r.fields,
          updatedAt: r.updatedAt.toISOString(),
        })),
      };
    }),
  );
}
export async function saveTemplate(input: unknown, headers?: Headers) {
  const owner = await requireUser(headers),
    value = z
      .object({
        id: z.uuid().optional(),
        revision: z.number().int().nonnegative(),
        fields: playbookSchema,
      })
      .strict()
      .parse(input);
  return strategySafe(() =>
    getDb().transaction(async (tx) => {
      if (value.id) {
        const [old] = await tx
          .select()
          .from(strategyTemplates)
          .where(
            and(
              eq(strategyTemplates.ownerId, owner.id),
              eq(strategyTemplates.id, value.id),
            ),
          )
          .for("update");
        if (!old) throw new NotFoundError();
        if (old.revision !== value.revision)
          throw new ReviewError(
            "This template changed in another tab. Your input is kept; reopen the latest template before replacing it.",
            409,
          );
        const [row] = await tx
          .update(strategyTemplates)
          .set({
            fields: value.fields,
            revision: value.revision + 1,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(strategyTemplates.ownerId, owner.id),
              eq(strategyTemplates.id, value.id),
            ),
          )
          .returning();
        return {
          id: row.id,
          revision: row.revision,
          fields: row.fields,
          updatedAt: row.updatedAt.toISOString(),
        };
      }
      if (value.revision !== 0)
        throw new ReviewError("Invalid new template revision.");
      const [row] = await tx
        .insert(strategyTemplates)
        .values({ ownerId: owner.id, fields: value.fields })
        .returning();
      return {
        id: row.id,
        revision: row.revision,
        fields: row.fields,
        updatedAt: row.updatedAt.toISOString(),
      };
    }),
  );
}
export async function deleteTemplate(input: unknown, headers?: Headers) {
  const owner = await requireUser(headers),
    value = z
      .object({
        id: z.uuid(),
        revision: z.number().int().positive(),
        confirmed: z.literal(true),
      })
      .strict()
      .parse(input);
  return strategySafe(() =>
    getDb().transaction(async (tx) => {
      const [old] = await tx
        .select()
        .from(strategyTemplates)
        .where(
          and(
            eq(strategyTemplates.ownerId, owner.id),
            eq(strategyTemplates.id, value.id),
          ),
        )
        .for("update");
      if (!old) throw new NotFoundError();
      if (old.revision !== value.revision)
        throw new ReviewError(
          "Template changed. Refresh before deleting it.",
          409,
        );
      await tx
        .delete(strategyTemplates)
        .where(
          and(
            eq(strategyTemplates.ownerId, owner.id),
            eq(strategyTemplates.id, value.id),
          ),
        );
      return { deleted: true };
    }),
  );
}
