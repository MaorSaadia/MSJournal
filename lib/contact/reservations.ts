import "server-only";
import { and, count, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { contactSubmissions as submissions } from "@/db/schema";

type Reservation = Pick<typeof submissions.$inferInsert, "id" | "fingerprint" | "emailKey" | "networkKey">;

export async function reserveSubmission(fields: Reservation) {
  return getDb().transaction(async (tx) => {
    // Use the same lock order on every instance to serialize overlapping requests.
    for (const key of [fields.id, fields.emailKey, fields.networkKey].sort()) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"contact:" + key}, 0))`);
    }
    const [previous] = await tx.select().from(submissions).where(eq(submissions.id, fields.id));
    if (previous) {
      if (previous.fingerprint !== fields.fingerprint) return "conflict";
      return previous.acceptedAt ? "accepted" : "send";
    }
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const [email] = await tx.select({ total: count() }).from(submissions)
      .where(and(eq(submissions.emailKey, fields.emailKey), gte(submissions.createdAt, since)));
    const [network] = await tx.select({ total: count() }).from(submissions)
      .where(and(eq(submissions.networkKey, fields.networkKey), gte(submissions.createdAt, since)));
    if (email.total >= 3 || network.total >= 10) return "limited";
    await tx.delete(submissions).where(lt(submissions.createdAt, new Date(Date.now() - 2 * 86400000)));
    await tx.insert(submissions).values(fields);
    return "send";
  });
}

export async function markAccepted(id: string) {
  const rows = await getDb().update(submissions).set({ acceptedAt: new Date() })
    .where(and(eq(submissions.id, id), isNull(submissions.acceptedAt))).returning({ id: submissions.id });
  return rows.length === 1;
}
