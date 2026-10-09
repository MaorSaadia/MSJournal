import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { userPreferences, tradingAccounts } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { NotFoundError } from "@/lib/accounts/service";
import { WorkspaceUnavailableError } from "@/lib/server-error";
import { requestSchema } from "@/lib/calendar/service";
import { monthBounds } from "@/lib/calendar/model";
import { localDay } from "@/lib/journal/calculations";
import { trades, accounts as demoAccounts } from "@/data/demo";
import { demoReviews } from "@/data/demo-reviews";
export type ReviewIndicators = {
  userId: string;
  timezone: string;
  days: Record<string, number>;
};
// Metadata only: editing a review does not recalculate calendar financial history.
export async function reviewIndicators(
  input: unknown,
  headers?: Headers,
): Promise<ReviewIndicators> {
  const owner = await requireUser(headers),
    q = requestSchema.parse(input);
  try {
    return await getDb().transaction(
      async (tx) => {
        const [prefs] = await tx
          .select()
          .from(userPreferences)
          .where(eq(userPreferences.userId, owner.id));
        const timezone = prefs?.displayTimezone ?? "Asia/Jerusalem";
        const available =
          q.mode === "demo"
            ? demoAccounts.map((a) => a.id)
            : (
                await tx
                  .select()
                  .from(tradingAccounts)
                  .where(eq(tradingAccounts.ownerId, owner.id))
              )
                .filter((a) => q.archived === "1" || !a.archivedAt)
                .map((a) => a.id);
        const ids =
          q.accounts === undefined
            ? available
            : [...new Set(q.accounts.split(",").filter(Boolean))];
        if (ids.some((id) => !available.includes(id)))
          throw new NotFoundError();
        const days: Record<string, number> = {};
        if (q.mode === "demo") {
          for (const t of trades) {
            const day = localDay(t.closeAt, timezone);
            if (
              demoReviews[t.id] &&
              ids.includes(t.accountId) &&
              day.startsWith(q.month) &&
              (!q.start || day >= q.start) &&
              (!q.end || day <= q.end) &&
              (!q.symbol || q.symbol === "all" || t.symbol === q.symbol) &&
              (q.direction === "all" || t.direction === q.direction)
            )
              days[day] = (days[day] ?? 0) + 1;
          }
        } else if (ids.length) {
          const bounds = monthBounds(q.month, timezone);
          const result =
            await tx.execute(sql`select to_char(greatest(p.bought_at,p.sold_at) at time zone ${timezone},'YYYY-MM-DD') as "day",count(distinct rv.id)::int n
        from journal_reviews rv join journal_records r on r.id=rv.record_id and r.owner_id=${owner.id} and r.current=true
        join journal_sources l on l.record_id=r.id and l.owner_id=${owner.id}
        join tradovate_performance_records p on p.id=l.source_id and p.owner_id=${owner.id} and p.trading_account_id=rv.trading_account_id
        where rv.owner_id=${owner.id} and rv.needs_reassignment=false and (rv.has_content or rv.status='reviewed' or exists(select 1 from review_attachments im where im.review_id=rv.id and im.owner_id=${owner.id} and im.state='ready'))
        and rv.trading_account_id in (${sql.join(
          ids.map((id) => sql`${id}::uuid`),
          sql`,`,
        )})
        and greatest(p.bought_at,p.sold_at)>=${bounds.start}::timestamptz and greatest(p.bought_at,p.sold_at)<${bounds.end}::timestamptz
        and (${q.symbol ?? "all"}='all' or p.symbol=${q.symbol ?? "all"})
        and (${q.direction}='all' or ${q.direction}=case when p.bought_at<p.sold_at then 'long' when p.bought_at>p.sold_at then 'short' else 'unknown' end)
        group by "day"`);
          for (const row of result.rows) {
            const day = String(row.day);
            if ((!q.start || day >= q.start) && (!q.end || day <= q.end))
              days[day] = Number(row.n);
          }
        }
        return { userId: owner.id, timezone, days };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  } catch (e) {
    if (e instanceof NotFoundError) throw e;
    throw new WorkspaceUnavailableError();
  }
}
