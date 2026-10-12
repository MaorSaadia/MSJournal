import "server-only";
import { and, eq, sql, gte, lte, count, desc, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import {
  dailyEntries,
  dailyTemplates,
  userPreferences,
  journalRecords,
  journalSources,
} from "@/db/schema";
import { requireUser } from "@/lib/session";
import { calendarData } from "@/lib/calendar/service";
import { daySchema, monthSchema, monthEnd } from "@/lib/calendar/model";
import { localInstant } from "@/lib/props/validation";
import { localDay } from "@/lib/journal/calculations";
import { ReviewError, unchangedAssociation } from "@/lib/reviews/model";
import { WorkspaceUnavailableError } from "@/lib/server-error";
import {
  emptyDaily,
  defaultChecklist,
  saveDailySchema,
  templateSchema,
  notebookSchema,
  type DailyData,
  type ObservationMeta,
} from "./model";
type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
async function safe<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ReviewError || e instanceof z.ZodError) throw e;
    throw new WorkspaceUnavailableError();
  }
}
async function preference(tx: Tx, userId: string) {
  const [p] = await tx
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId));
  return p?.displayTimezone ?? "Asia/Jerusalem";
}
async function template(tx: Tx, userId: string) {
  const [t] = await tx
    .select()
    .from(dailyTemplates)
    .where(eq(dailyTemplates.ownerId, userId));
  return {
    revision: t?.revision ?? 0,
    items:
      t?.items ??
      defaultChecklist.map((text, i) => ({
        id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
        text,
        checked: false,
      })),
  };
}
async function entryData(
  tx: Tx,
  userId: string,
  date: string,
): Promise<DailyData> {
  const [row] = await tx
    .select()
    .from(dailyEntries)
    .where(
      and(eq(dailyEntries.ownerId, userId), eq(dailyEntries.entryDate, date)),
    );
  const preferenceTimezone = await preference(tx, userId);
  const fields = row?.fields ?? emptyDaily((await template(tx, userId)).items);
  const observations: DailyData["observations"] = {};
  // Source signatures retain provenance across regrouping; unavailable links never erase writing.
  const linked = fields.observations.filter((o) => o.recordId);
  const accountIds = [
    ...new Set(
      linked
        .map((o) => row?.observationMeta[o.id]?.originalAccountId)
        .filter((id): id is string => !!id),
    ),
  ];
  const current = accountIds.length
    ? await tx
        .select({ record: journalRecords, sourceId: journalSources.sourceId })
        .from(journalRecords)
        .innerJoin(
          journalSources,
          and(
            eq(journalSources.recordId, journalRecords.id),
            eq(journalSources.ownerId, userId),
          ),
        )
        .where(
          and(
            eq(journalRecords.ownerId, userId),
            eq(journalRecords.current, true),
            inArray(journalRecords.tradingAccountId, accountIds),
          ),
        )
    : [];
  const signatures = new Map<string, string[]>();
  for (const r of current)
    signatures.set(r.record.id, [
      ...(signatures.get(r.record.id) ?? []),
      r.sourceId,
    ]);
  for (const o of fields.observations) {
    const meta = row?.observationMeta[o.id];
    if (!meta) continue;
    const found = o.recordId
      ? unchangedAssociation(
          meta.sourceIds,
          [...signatures].map(([id, sourceIds]) => ({ id, sourceIds })),
        )
      : null;
    observations[o.id] = {
      ...meta,
      linkStatus: !o.recordId
        ? "none"
        : found === o.recordId
          ? "available"
          : found
            ? "changed"
            : "unavailable",
      href: found ? `/trade-view/${found}?tab=review` : null,
    };
  }
  return {
    userId,
    date,
    preferenceTimezone,
    timezone: row?.timezone ?? preferenceTimezone,
    id: row?.id ?? null,
    revision: row?.revision ?? 0,
    status: row?.status ?? "draft",
    fields,
    observations,
  };
}
export async function getDaily(date: unknown, headers?: Headers) {
  const owner = await requireUser(headers);
  const parsed = daySchema.parse(date);
  return safe(() =>
    getDb().transaction((tx) => entryData(tx, owner.id, parsed), {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    }),
  );
}
export async function saveDaily(input: unknown, headers?: Headers) {
  const owner = await requireUser(headers);
  const value = saveDailySchema.parse(input);
  return safe(() =>
    getDb().transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${owner.id + ":daily:" + value.date},0))`,
      );
      const [previous] = await tx
        .select()
        .from(dailyEntries)
        .where(
          and(
            eq(dailyEntries.ownerId, owner.id),
            eq(dailyEntries.entryDate, value.date),
          ),
        )
        .for("update");
      if ((previous?.revision ?? 0) !== value.revision)
        throw new ReviewError(
          "This day was edited in another tab. Compare the saved version before replacing anything.",
          409,
        );
      const timezone = previous?.timezone ?? (await preference(tx, owner.id));
      if (timezone !== value.timezone)
        throw new ReviewError(
          "The daily context changed. Reload the saved day before saving; your writing is kept.",
          409,
        );
      const now = new Date();
      const meta: Record<string, ObservationMeta> = {};
      for (const observation of value.fields.observations) {
        const old = previous?.fields.observations.find(
            (o) => o.id === observation.id,
          ),
          oldMeta = previous?.observationMeta[observation.id];
        let eventAt: string;
        try {
          eventAt = localInstant(observation.eventLocal, timezone);
        } catch {
          throw new ReviewError(
            "Observation time is invalid or ambiguous in this day's timezone. Choose a valid local time.",
          );
        }
        if (localDay(eventAt, timezone) !== value.date)
          throw new ReviewError(
            "Each observation must occur on this entry's calendar date.",
          );
        let sourceIds = oldMeta?.sourceIds ?? [],
          originalAccountId = oldMeta?.originalAccountId ?? null;
        if (
          observation.recordId &&
          (!oldMeta || old?.recordId !== observation.recordId)
        ) {
          const [record] = await tx
            .select()
            .from(journalRecords)
            .where(
              and(
                eq(journalRecords.ownerId, owner.id),
                eq(journalRecords.id, observation.recordId),
                eq(journalRecords.current, true),
              ),
            );
          if (!record)
            throw new ReviewError(
              "Choose an available record owned by your account.",
              404,
            );
          const sources = await tx
            .select({ id: journalSources.sourceId })
            .from(journalSources)
            .where(
              and(
                eq(journalSources.ownerId, owner.id),
                eq(journalSources.recordId, record.id),
              ),
            );
          if (!sources.length)
            throw new ReviewError("This record is awaiting processing.", 409);
          sourceIds = sources.map((s) => s.id);
          originalAccountId = record.tradingAccountId;
        } else if (!observation.recordId) {
          sourceIds = [];
          originalAccountId = null;
        }
        meta[observation.id] = {
          eventAt,
          createdAt: oldMeta?.createdAt ?? now.toISOString(),
          updatedAt:
            old && JSON.stringify(old) === JSON.stringify(observation)
              ? (oldMeta?.updatedAt ?? now.toISOString())
              : now.toISOString(),
          sourceIds,
          originalAccountId,
        };
      }
      const changes = {
        fields: value.fields,
        status: value.status,
        observationMeta: meta,
        updatedAt: now,
        revision: value.revision + 1,
      };
      if (previous)
        await tx
          .update(dailyEntries)
          .set(changes)
          .where(
            and(
              eq(dailyEntries.ownerId, owner.id),
              eq(dailyEntries.id, previous.id),
            ),
          );
      else
        await tx.insert(dailyEntries).values({
          ...changes,
          ownerId: owner.id,
          entryDate: value.date,
          timezone,
        });
      return entryData(tx, owner.id, value.date);
    }),
  );
}
export async function getTemplate(headers?: Headers) {
  const owner = await requireUser(headers);
  return safe(() => getDb().transaction((tx) => template(tx, owner.id)));
}
export async function saveTemplate(input: unknown, headers?: Headers) {
  const owner = await requireUser(headers),
    value = templateSchema.parse(input);
  return safe(() =>
    getDb().transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${owner.id + ":daily-template"},0))`,
      );
      const existing = await template(tx, owner.id);
      if (existing.revision !== value.revision)
        throw new ReviewError(
          "Checklist defaults changed in another tab. Reload them before saving.",
          409,
        );
      const items = value.items.map((i) => ({ ...i, checked: false }));
      await tx
        .insert(dailyTemplates)
        .values({ ownerId: owner.id, items, revision: value.revision + 1 })
        .onConflictDoUpdate({
          target: dailyTemplates.ownerId,
          set: { items, revision: value.revision + 1, updatedAt: new Date() },
        });
      return { items, revision: value.revision + 1 };
    }),
  );
}
export async function notebook(input: unknown, headers?: Headers) {
  const owner = await requireUser(headers),
    params = notebookSchema.parse(input);
  return safe(() =>
    getDb().transaction(
      async (tx) => {
        const writing = sql`concat_ws(' ', ${dailyEntries.fields}->>'focus', ${dailyEntries.fields}->>'context', ${dailyEntries.fields}->>'setups', ${dailyEntries.fields}->>'stayOut', ${dailyEntries.fields}->>'missedMove', ${dailyEntries.fields}->>'stoppingRule', ${dailyEntries.fields}->>'session', ${dailyEntries.fields}->>'wentWell', ${dailyEntries.fields}->>'departed', ${dailyEntries.fields}->>'pressure', ${dailyEntries.fields}->>'repeat', ${dailyEntries.fields}->>'change', (select string_agg(concat_ws(' ',o->>'happened',o->>'response'),' ') from jsonb_array_elements(${dailyEntries.fields}->'observations') o))`;
        const where = and(
          eq(dailyEntries.ownerId, owner.id),
          params.start ? gte(dailyEntries.entryDate, params.start) : undefined,
          params.end ? lte(dailyEntries.entryDate, params.end) : undefined,
          params.status !== "all"
            ? eq(dailyEntries.status, params.status)
            : undefined,
          params.q
            ? sql`strpos(lower(${writing}),lower(${params.q}))>0`
            : undefined,
        );
        const [total] = await tx
          .select({ n: count() })
          .from(dailyEntries)
          .where(where);
        const rows = await tx
          .select()
          .from(dailyEntries)
          .where(where)
          .orderBy(desc(dailyEntries.entryDate))
          .limit(20)
          .offset((params.page - 1) * 20);
        return {
          userId: owner.id,
          timezone: await preference(tx, owner.id),
          total: total.n,
          page: params.page,
          entries: rows.map((r) => ({
            date: r.entryDate,
            timezone: r.timezone,
            status: r.status,
            excerpt: (
              r.fields.focus ||
              r.fields.wentWell ||
              r.fields.session ||
              r.fields.change
            ).slice(0, 180),
            mood: r.fields.endMood ?? r.fields.mood,
            completed: r.fields.checklist.filter((i) => i.checked).length,
            checklistCount: r.fields.checklist.length,
          })),
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    ),
  );
}
export async function dailyResults(
  date: unknown,
  filters: Record<string, string>,
  headers?: Headers,
) {
  const entry = await getDaily(date, headers);
  return {
    userId: entry.userId,
    timezone: entry.preferenceTimezone,
    results: await calendarData(
      {
        ...filters,
        month: entry.date.slice(0, 7),
        day: entry.date,
        mode: "real",
      },
      headers,
      entry.timezone,
    ),
  };
}
export async function dailyIndicators(month: unknown, headers?: Headers) {
  const owner = await requireUser(headers),
    parsed = monthSchema.parse(month);
  return safe(async () => {
    const rows = await getDb()
      .select({ date: dailyEntries.entryDate, status: dailyEntries.status })
      .from(dailyEntries)
      .where(
        and(
          eq(dailyEntries.ownerId, owner.id),
          gte(dailyEntries.entryDate, parsed + "-01"),
          lte(dailyEntries.entryDate, monthEnd(parsed)),
        ),
      );
    return {
      userId: owner.id,
      timezone: (await getDaily(parsed + "-01", headers)).preferenceTimezone,
      days: Object.fromEntries(rows.map((r) => [r.date, r.status])),
    };
  });
}
