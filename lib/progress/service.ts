import "server-only";
import { and, eq, sql, count } from "drizzle-orm";
import { getDb } from "@/db/client";
import { processGoals, goalCheckins, userPreferences } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { ReviewError } from "@/lib/reviews/model";
import { NotFoundError } from "@/lib/accounts/service";
import { todayIn, shiftDay } from "@/lib/calendar/model";
import {
  rangeSchema,
  saveGoalSchema,
  checkinSchema,
  progressDashboard,
  goalProgress,
  daysBetween,
  recordBasis,
  type Daily,
  type RecordReview,
  type Checkin,
} from "./model";

export async function getProgress(input: unknown, headers: Headers) {
  const owner = await requireUser(headers);
  const range = rangeSchema.parse(input);
  return getDb().transaction(
    async (tx) => {
      await tx.execute(sql`set local statement_timeout = '30s'`);
      const [pref] = await tx
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, owner.id));
      const timezone = pref?.displayTimezone ?? "Asia/Jerusalem",
        weekStartsOn = pref?.weekStartsOn === 1 ? 1 : 0;
      const today = todayIn(timezone);
      const goals = await tx
        .select()
        .from(processGoals)
        .where(eq(processGoals.ownerId, owner.id))
        .limit(201);
      if (goals.length > 200)
        throw new ReviewError(
          "The tracker supports up to 200 saved goals.",
          413,
        );
      const previousStart = shiftDay(
        range.start,
        -(daysBetween(range.start, range.end) + 1),
      );
      const windows = [
        { start: previousStart, end: range.end },
        ...goals.map((g) => ({ start: g.start, end: g.end })),
      ];
      const scope = (date: ReturnType<typeof sql>) =>
        sql`(${sql.join(
          windows.map(
            (w) =>
              sql`(${date} >= ${w.start}::date and ${date} <= ${w.end}::date)`,
          ),
          sql` or `,
        )})`;
      const dailyResult = await tx.execute(sql`
      select entry_date::text as date,
        jsonb_array_length(coalesce(fields->'checklist','[]'::jsonb)) as total,
        (select count(*)::int from jsonb_array_elements(coalesce(fields->'checklist','[]'::jsonb)) item where item->>'checked' = 'true') as completed,
        status = 'reviewed' as reviewed, updated_at as "updatedAt"
      from daily_entries where owner_id = ${owner.id} and ${scope(sql`entry_date`)} order by entry_date limit 5001`);
      const recordsResult = await tx.execute(sql`
      select r.id, (r.exit_at at time zone ${timezone})::date::text as date,
        coalesce(v.status = 'reviewed', false) as reviewed,
        v.fields->>'adherence' as adherence, coalesce(v.fields->'mistakes', '[]'::jsonb) as mistakes,
        v.updated_at as "updatedAt"
      from journal_records r left join journal_reviews v on v.record_id = r.id
        and v.owner_id = r.owner_id and v.trading_account_id = r.trading_account_id and v.needs_reassignment = false
      where r.owner_id = ${owner.id} and r.current = true
        and ${scope(sql`(r.exit_at at time zone ${timezone})::date`)} order by r.exit_at limit 50001`);
      // Realized activity includes partial exits on their own dates, even when the
      // canonical parent closes later. Ownership is checked at every source edge.
      const activityResult = await tx.execute(sql`
      select distinct (greatest(p.bought_at,p.sold_at) at time zone ${timezone})::date::text as date
      from tradovate_performance_records p
      join journal_sources s on s.source_id=p.id and s.owner_id=p.owner_id and s.trading_account_id=p.trading_account_id
      join journal_records r on r.id=s.record_id and r.owner_id=s.owner_id and r.trading_account_id=s.trading_account_id and r.current=true
      where p.owner_id=${owner.id} and ${scope(sql`(greatest(p.bought_at,p.sold_at) at time zone ${timezone})::date`)} limit 5001`);
      if (
        dailyResult.rows.length > 5000 ||
        recordsResult.rows.length > 50000 ||
        activityResult.rows.length > 5000
      )
        throw new ReviewError(
          "This selection exceeds the tracker’s processing limit. Narrow the range or goal windows; no partial metrics were returned.",
          413,
        );
      const daily: Daily[] = dailyResult.rows.map((r) => ({
        ...r,
        total: Number(r.total),
        completed: Number(r.completed),
        updatedAt: new Date(r.updatedAt as string).toISOString(),
      })) as Daily[];
      const records: RecordReview[] = recordsResult.rows.map((r) => ({
        ...r,
        updatedAt: r.updatedAt
          ? new Date(r.updatedAt as string).toISOString()
          : null,
      })) as RecordReview[];
      const activity = activityResult.rows.map((r) => r.date as string);
      const tags = await tx.execute(
        sql`select id, name from review_tags where owner_id=${owner.id}`,
      );
      const checkinRows = await tx
        .select()
        .from(goalCheckins)
        .where(eq(goalCheckins.ownerId, owner.id))
        .limit(73201);
      if (checkinRows.length > 73200)
        throw new ReviewError(
          "The tracker supports up to 73,200 habit check-ins.",
          413,
        );
      const checkins: Checkin[] = checkinRows.map((c) => ({
        goalId: c.goalId,
        date: c.date,
        state: c.state,
        note: c.note,
        revision: c.revision,
        updatedAt: c.updatedAt.toISOString(),
      }));
      const recent = [
        ...daily
          .filter(
            (d) => d.reviewed && d.date >= range.start && d.date <= range.end,
          )
          .map((d) => ({
            id: `daily-${d.date}`,
            label: "Daily entry updated · review complete",
            date: d.date,
            at: d.updatedAt,
            href: `/day-view?date=${d.date}`,
          })),
        ...records
          .filter(
            (r) =>
              r.reviewed &&
              r.updatedAt &&
              r.date >= range.start &&
              r.date <= range.end,
          )
          .map((r) => ({
            id: r.id,
            label: "Trade review updated · marked reviewed",
            date: r.date,
            at: r.updatedAt!,
            href: `/trade-view/${r.id}?mode=real&tab=review`,
          })),
        ...checkins
          .filter((c) => c.date >= range.start && c.date <= range.end)
          .map((c) => ({
            id: `${c.goalId}-${c.date}`,
            label: `Habit check-in updated · ${c.state === "done" ? "Done" : c.state === "not-done" ? "Not done" : "Not assessed"}`,
            date: c.date,
            at: c.updatedAt,
            href: `/progress-tracker?start=${range.start}&end=${range.end}&goal=${c.goalId}#goals`,
          })),
      ]
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 12);
      return {
        userId: owner.id,
        timezone,
        today,
        weekStartsOn,
        range,
        recordBasis,
        ...progressDashboard(
          daily,
          records,
          activity,
          range,
          tags.rows as { id: string; name: string }[],
          weekStartsOn,
        ),
        goals: goals.map((g) =>
          goalProgress(g, daily, records, checkins, today),
        ),
        checkins,
        recent,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export type ProgressData = Awaited<ReturnType<typeof getProgress>>;

export async function saveGoal(input: unknown, headers: Headers) {
  const owner = await requireUser(headers),
    body = saveGoalSchema.parse(input);
  return getDb().transaction(async (tx) => {
    // Serializes per-user goal creation as well as edits; bounds apply under concurrency.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${owner.id}))`);
    const [pref] = await tx
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, owner.id));
    if (!body.id) {
      if (body.revision !== 0)
        throw new ReviewError("New goals must start at revision zero.");
      const [total] = await tx
        .select({ n: count() })
        .from(processGoals)
        .where(eq(processGoals.ownerId, owner.id));
      if (total.n >= 200)
        throw new ReviewError(
          "You can keep up to 200 goals, including archived goals.",
        );
      const [created] = await tx
        .insert(processGoals)
        .values({
          ...body.fields,
          ownerId: owner.id,
          timezone: pref?.displayTimezone ?? "Asia/Jerusalem",
        })
        .returning({ id: processGoals.id });
      return { id: created.id };
    }
    const [goal] = await tx
      .select()
      .from(processGoals)
      .where(
        and(eq(processGoals.id, body.id), eq(processGoals.ownerId, owner.id)),
      )
      .for("update");
    if (!goal) throw new NotFoundError();
    if (goal.revision !== body.revision)
      throw new ReviewError(
        "This goal changed elsewhere. Close and reopen it to load the latest version; your draft is still here.",
        409,
      );
    if (goal.type !== body.fields.type)
      throw new ReviewError(
        "Keep the goal type when editing. Create another goal for a different process.",
      );
    const outside = await tx.execute(
      sql`select id from goal_checkins where owner_id=${owner.id} and goal_id=${goal.id} and (entry_date < ${body.fields.start}::date or entry_date > ${body.fields.end}::date) limit 1`,
    );
    if (outside.rows.length)
      throw new ReviewError(
        "This window would exclude saved habit check-ins. Keep those dates in the window.",
        409,
      );
    await tx
      .update(processGoals)
      .set({
        ...body.fields,
        revision: goal.revision + 1,
        updatedAt: new Date(),
      })
      .where(
        and(eq(processGoals.id, goal.id), eq(processGoals.ownerId, owner.id)),
      );
    return { id: goal.id };
  });
}
export async function saveCheckin(input: unknown, headers: Headers) {
  const owner = await requireUser(headers),
    body = checkinSchema.parse(input);
  return getDb().transaction(async (tx) => {
    const [goal] = await tx
      .select()
      .from(processGoals)
      .where(
        and(
          eq(processGoals.id, body.goalId),
          eq(processGoals.ownerId, owner.id),
        ),
      )
      .for("update");
    if (!goal) throw new NotFoundError();
    if (goal.type !== "habit" || goal.archived)
      throw new ReviewError(
        "Check-ins are available for active custom habit goals.",
      );
    if (body.date < goal.start || body.date > goal.end)
      throw new ReviewError("Choose a date within this goal’s window.");
    const [pref] = await tx
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, owner.id));
    if (
      body.state === "done" &&
      body.date > todayIn(pref?.displayTimezone ?? "Asia/Jerusalem")
    )
      throw new ReviewError("Future dates cannot be marked Done.");
    const scope = and(
      eq(goalCheckins.ownerId, owner.id),
      eq(goalCheckins.goalId, goal.id),
      eq(goalCheckins.date, body.date),
    );
    const [existing] = await tx.select().from(goalCheckins).where(scope);
    if ((existing?.revision ?? 0) !== body.revision)
      throw new ReviewError(
        "This check-in changed elsewhere. Close and reopen it to load the latest version; your draft is still here.",
        409,
      );
    if (existing)
      await tx
        .update(goalCheckins)
        .set({
          state: body.state,
          note: body.note,
          revision: existing.revision + 1,
          updatedAt: new Date(),
        })
        .where(scope);
    else
      await tx
        .insert(goalCheckins)
        .values({
          ownerId: owner.id,
          goalId: goal.id,
          date: body.date,
          state: body.state,
          note: body.note,
        });
    return { saved: true };
  });
}
