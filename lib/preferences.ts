import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { user, userPreferences } from "@/db/schema";
import { requireUser } from "./session";
import { preferencesSchema } from "./accounts/validation";
import type { Preferences } from "./accounts/types";
import { WorkspaceUnavailableError } from "./server-error";
export async function getPreferences(headers?: Headers): Promise<Preferences> {
  const owner = await requireUser(headers);
  try {
    const [preferences] = await getDb()
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, owner.id));
    return {
      displayName: owner.name,
      email: owner.email,
      displayTimezone: preferences?.displayTimezone ?? "Asia/Jerusalem",
      currency: "USD",
    };
  } catch {
    throw new WorkspaceUnavailableError();
  }
}
export async function savePreferences(input: unknown, headers?: Headers) {
  const owner = await requireUser(headers);
  const values = preferencesSchema.parse(input);
  try {
    await getDb().transaction(async (tx) => {
      await tx
        .update(user)
        .set({ name: values.displayName, updatedAt: new Date() })
        .where(eq(user.id, owner.id));
      await tx
        .insert(userPreferences)
        .values({
          userId: owner.id,
          displayTimezone: values.displayTimezone,
          currency: "USD",
        })
        .onConflictDoUpdate({
          target: userPreferences.userId,
          set: {
            displayTimezone: values.displayTimezone,
            updatedAt: new Date(),
          },
        });
    });
  } catch {
    throw new WorkspaceUnavailableError();
  }
  return { ...values, email: owner.email };
}
