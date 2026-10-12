import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { tradingAccounts, propPhases } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { accountValues, tradingAccountSchema } from "./validation";
import type { TradingAccount } from "./types";
import { WorkspaceUnavailableError } from "@/lib/server-error";
import { ZodError } from "zod";
import { ReviewError } from "@/lib/reviews/model";
export class NotFoundError extends Error {
  constructor() {
    super("Account not found or unavailable.");
  }
}
export class DuplicateAccountError extends Error {
  constructor() {
    super(
      "This broker identifier already belongs to an account on this platform, including archived accounts.",
    );
  }
}
const accountId = z.uuid();
function serialize(row: typeof tradingAccounts.$inferSelect): TradingAccount {
  const { ownerId: _ownerId, createdAt, updatedAt, archivedAt, ...data } = row;
  void _ownerId;
  return {
    ...data,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    archivedAt: archivedAt?.toISOString() ?? null,
  };
}
function databaseError(error: unknown): never {
  const e = error as { code?: string; cause?: { code?: string } };
  if (e.code === "23505" || e.cause?.code === "23505")
    throw new DuplicateAccountError();
  if (
    error instanceof NotFoundError ||
    error instanceof ZodError ||
    error instanceof ReviewError
  )
    throw error;
  throw new WorkspaceUnavailableError();
}
export async function listTradingAccounts(
  headers?: Headers,
  activeOnly = false,
) {
  const owner = await requireUser(headers);
  try {
    const rows = await getDb()
      .select()
      .from(tradingAccounts)
      .where(
        and(
          eq(tradingAccounts.ownerId, owner.id),
          activeOnly ? isNull(tradingAccounts.archivedAt) : undefined,
        ),
      )
      .orderBy(desc(tradingAccounts.createdAt));
    return rows.map(serialize);
  } catch (error) {
    databaseError(error);
  }
}
export async function getTradingAccount(id: string, headers?: Headers) {
  const owner = await requireUser(headers);
  try {
    const [row] = await getDb()
      .select()
      .from(tradingAccounts)
      .where(
        and(
          eq(tradingAccounts.id, accountId.parse(id)),
          eq(tradingAccounts.ownerId, owner.id),
        ),
      );
    if (!row) throw new NotFoundError();
    return serialize(row);
  } catch (error) {
    databaseError(error);
  }
}
export async function saveTradingAccount(
  input: unknown,
  id?: string,
  headers?: Headers,
) {
  const owner = await requireUser(headers);
  const values = accountValues(tradingAccountSchema.parse(input));
  try {
    const db = getDb();
    const [row] = await db.transaction(async (tx) => {
      if (id) {
        const [existing] = await tx
          .select()
          .from(tradingAccounts)
          .where(
            and(
              eq(tradingAccounts.id, accountId.parse(id)),
              eq(tradingAccounts.ownerId, owner.id),
              isNull(tradingAccounts.archivedAt),
            ),
          )
          .for("update");
        if (!existing) throw new NotFoundError();
        const [phase] = await tx
          .select({ id: propPhases.id })
          .from(propPhases)
          .where(
            and(
              eq(propPhases.ownerId, owner.id),
              eq(propPhases.tradingAccountId, id),
            ),
          )
          .limit(1);
        if (
          phase &&
          (values.stage !== existing.stage || values.status !== existing.status)
        )
          throw new ReviewError(
            "Use the account's dated phase/status actions to change phase or status without rewriting history.",
            400,
          );
        return tx
          .update(tradingAccounts)
          .set({ ...values, updatedAt: new Date() })
          .where(
            and(
              eq(tradingAccounts.id, id),
              eq(tradingAccounts.ownerId, owner.id),
            ),
          )
          .returning();
      }
      return tx
        .insert(tradingAccounts)
        .values({ ...values, ownerId: owner.id })
        .returning();
    });
    if (!row) throw new NotFoundError();
    return serialize(row);
  } catch (error) {
    databaseError(error);
  }
}
export async function archiveTradingAccount(
  id: string,
  archive: boolean,
  headers?: Headers,
) {
  const owner = await requireUser(headers);
  try {
    const [row] = await getDb()
      .update(tradingAccounts)
      .set({ archivedAt: archive ? new Date() : null, updatedAt: new Date() })
      .where(
        and(
          eq(tradingAccounts.id, accountId.parse(id)),
          eq(tradingAccounts.ownerId, owner.id),
        ),
      )
      .returning();
    if (!row) throw new NotFoundError();
    return serialize(row);
  } catch (error) {
    databaseError(error);
  }
}
