import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { and, eq, desc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { worksheetTemplates, worksheetEntries, worksheetRevisions, worksheetLinks, strategies, dailyEntries, journalRecords, tradingAccounts, processGoals } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { NotFoundError } from "@/lib/accounts/service";
import { ReviewError } from "@/lib/reviews/model";
import { templates, type Template } from "./templates";
import { createSchema, saveSchema, validateFields, type WorksheetData, type WorksheetFields } from "./model";
type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
const scope = (ownerId: string, id: string) => and(eq(worksheetEntries.ownerId, ownerId), eq(worksheetEntries.id, id));
const safeFields = (t: Template, fields: WorksheetFields) => {
  try { return validateFields(t, fields); } catch (e) { throw new ReviewError(e instanceof Error ? e.message : "Check your answers.", 400); }
};
async function definition(tx: Tx, id: string) {
  const current = templates.find((t) => t.id === id);
  if (current) {
    const hash = createHash("sha256").update(JSON.stringify(current)).digest("hex");
    await tx.insert(worksheetTemplates).values({ id, slug: current.slug, version: current.version, definition: current, hash }).onConflictDoNothing();
    const [stored] = await tx.select().from(worksheetTemplates).where(eq(worksheetTemplates.id, id));
    if (stored.hash !== hash) throw new ReviewError("This template changed without a new version. Contact support; saved versions are preserved.", 409);
    return stored.definition;
  }
  const [old] = await tx.select().from(worksheetTemplates).where(eq(worksheetTemplates.id, id));
  if (!old) throw new NotFoundError();
  return old.definition;
}
async function owned(tx: Tx, ownerId: string, id: string) {
  const [row] = await tx.select().from(worksheetEntries).where(scope(ownerId, id)).for("update");
  if (!row) throw new NotFoundError();
  return row;
}
export async function linkOptions(ownerId: string, kind: Template["linkKind"], tx: Pick<ReturnType<typeof getDb>,"select"> = getDb()) {
  if (kind === "account") return (await tx.select({ id: tradingAccounts.id, label: tradingAccounts.displayName }).from(tradingAccounts).where(eq(tradingAccounts.ownerId, ownerId))).map((r) => ({ ...r, href: `/prop-accounts/${r.id}` }));
  if (kind === "strategy") return (await tx.select({ id: strategies.id, fields: strategies.fields }).from(strategies).where(eq(strategies.ownerId, ownerId))).map((r) => ({ id: r.id, label: r.fields.name, href: `/strategies/${r.id}` }));
  if (kind === "session") return (await tx.select({ id: dailyEntries.id, label: dailyEntries.entryDate }).from(dailyEntries).where(eq(dailyEntries.ownerId, ownerId))).map((r) => ({ ...r, href: `/day-view?date=${r.label}` }));
  if (kind === "trade") return (await tx.select({ id: journalRecords.id, label: journalRecords.symbol }).from(journalRecords).where(and(eq(journalRecords.ownerId, ownerId), eq(journalRecords.current, true)))).map((r) => ({ ...r, href: `/trade-view/${r.id}?tab=review` }));
  if (kind === "progress") return (await tx.select({ id: processGoals.id, label: processGoals.name }).from(processGoals).where(eq(processGoals.ownerId, ownerId))).map((r) => ({ ...r, href: "/progress-tracker" }));
  return [];
}
async function validateLink(tx: Tx, ownerId: string, fields: WorksheetFields) {
  if (fields.link && !(await linkOptions(ownerId, fields.link.kind, tx)).some((l) => l.id === fields.link!.id)) throw new NotFoundError();
}
async function syncLink(tx: Tx, ownerId: string, entryId: string, fields: WorksheetFields) {
  await tx.delete(worksheetLinks).where(and(eq(worksheetLinks.entryId,entryId),eq(worksheetLinks.ownerId,ownerId)));
  if(fields.link)await tx.insert(worksheetLinks).values({entryId,ownerId,kind:fields.link.kind,targetId:fields.link.id});
}
async function data(tx: Tx, row: typeof worksheetEntries.$inferSelect): Promise<WorksheetData> {
  const [t] = await tx.select().from(worksheetTemplates).where(eq(worksheetTemplates.id, row.templateId));
  if (!t) throw new NotFoundError();
  return { ...row, template: t.definition, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), completedAt: row.completedAt?.toISOString() ?? null };
}
export async function createWorksheet(raw: unknown, headers?: Headers) {
  const owner = await requireUser(headers), input = createSchema.parse(raw);
  return getDb().transaction(async (tx) => {
    const t = await definition(tx, input.templateId);
    safeFields(t, input.fields); await validateLink(tx, owner.id, input.fields);
    const completedAt = input.status === "reviewed" ? new Date() : null;
    const [inserted] = await tx.insert(worksheetEntries).values({ ownerId: owner.id, clientId: input.clientId, templateId: t.id, fields: input.fields, status: input.status, completedAt }).onConflictDoNothing().returning();
    if (!inserted) {
      const [previous] = await tx.select().from(worksheetEntries).where(and(eq(worksheetEntries.ownerId, owner.id), eq(worksheetEntries.clientId, input.clientId)));
      if (!previous || previous.templateId !== input.templateId) throw new ReviewError("That draft transfer identifier is already used.", 409);
      if(!isDeepStrictEqual(previous.fields,input.fields) || previous.status!==input.status)throw new ReviewError("This draft was already saved with different answers. Open My Worksheets to review it or save your edits as a separate copy.",409);
      return data(tx, previous);
    }
    await tx.insert(worksheetRevisions).values({ entryId: inserted.id, ownerId: owner.id, revision: 1, fields: inserted.fields, status: inserted.status, completedAt });
    await syncLink(tx,owner.id,inserted.id,inserted.fields);
    return data(tx, inserted);
  });
}
export async function readWorksheet(id: string, headers?: Headers, revision?: number) {
  const owner = await requireUser(headers);
  return getDb().transaction(async (tx) => {
    const row = await owned(tx, owner.id, id);
    const current = await data(tx, row);
    if (revision !== undefined) {
      const [old] = await tx.select().from(worksheetRevisions).where(and(eq(worksheetRevisions.entryId, id), eq(worksheetRevisions.ownerId, owner.id), eq(worksheetRevisions.revision, revision)));
      if (!old) throw new NotFoundError();
      return { ...current, fields: old.fields, revision: old.revision, status: old.status, completedAt: old.completedAt?.toISOString() ?? null, updatedAt: old.recordedAt.toISOString() };
    }
    return current;
  });
}
export async function updateWorksheet(id: string, raw: unknown, headers?: Headers) {
  const owner = await requireUser(headers), input = saveSchema.parse(raw);
  return getDb().transaction(async (tx) => {
    const row = await owned(tx, owner.id, id);
    if (row.revision !== input.revision) throw new ReviewError("A newer version was saved in another tab. Your edits are kept; reload it or save your edits as a separate copy.", 409);
    const [t] = await tx.select().from(worksheetTemplates).where(eq(worksheetTemplates.id, row.templateId));
    safeFields(t.definition, input.fields); await validateLink(tx, owner.id, input.fields);
    const completedAt = input.status === "reviewed" ? new Date() : null;
    const [next] = await tx.update(worksheetEntries).set({ fields: input.fields, status: input.status, revision: row.revision + 1, updatedAt: new Date(), completedAt }).where(scope(owner.id, id)).returning();
    await tx.insert(worksheetRevisions).values({ entryId: id, ownerId: owner.id, revision: next.revision, fields: next.fields, status: next.status, completedAt });
    await syncLink(tx,owner.id,id,next.fields);
    return data(tx, next);
  });
}
export async function deleteWorksheet(id: string, revision: number, headers?: Headers) {
  const owner = await requireUser(headers);
  return getDb().transaction(async (tx) => {
    const row = await owned(tx, owner.id, id);
    if (row.revision !== revision) throw new ReviewError("A newer version exists. Refresh before deleting.", 409);
    await tx.delete(worksheetEntries).where(scope(owner.id, id));
  });
}
export async function duplicateWorksheet(id: string, headers?: Headers) {
  const original = await readWorksheet(id, headers);
  return createWorksheet({ templateId: original.templateId, clientId: randomUUID(), fields: { ...original.fields, title: `${original.fields.title || original.template.title} — copy`.slice(0,160), retrospective: false, retrospectiveNote: "" }, status: "draft" }, headers);
}
export async function listWorksheets(headers?: Headers) {
  const owner = await requireUser(headers);
  return getDb().select({ id: worksheetEntries.id, fields: worksheetEntries.fields, status: worksheetEntries.status, revision: worksheetEntries.revision, templateId: worksheetEntries.templateId, createdAt: worksheetEntries.createdAt, updatedAt: worksheetEntries.updatedAt, template: worksheetTemplates.definition }).from(worksheetEntries).innerJoin(worksheetTemplates, eq(worksheetTemplates.id, worksheetEntries.templateId)).where(eq(worksheetEntries.ownerId, owner.id)).orderBy(desc(worksheetEntries.updatedAt));
}
export async function historyFor(id: string, headers?: Headers) {
  const entry = await readWorksheet(id, headers);
  return getDb().select({ revision: worksheetRevisions.revision, status: worksheetRevisions.status, recordedAt: worksheetRevisions.recordedAt, completedAt: worksheetRevisions.completedAt }).from(worksheetRevisions).where(and(eq(worksheetRevisions.entryId, id), eq(worksheetRevisions.ownerId, entry.ownerId))).orderBy(desc(worksheetRevisions.revision));
}
