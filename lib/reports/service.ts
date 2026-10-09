import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { tradingAccounts, userPreferences, reviewTags } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { NotFoundError } from "@/lib/accounts/service";
import { WorkspaceUnavailableError } from "@/lib/server-error";
import { rangeBounds, viewSchema, rootSymbol } from "@/lib/journal/view-model";
import { demoRecords } from "@/lib/journal/view-service";
import { trades, accounts as demoAccounts } from "@/data/demo";
import { demoReviews } from "@/data/demo-reviews";
import { reviewState, mistakes } from "@/lib/reviews/model";
import { D, type Portion, type PortionFee } from "@/lib/journal/processing";
import {
  reportSchema,
  summarizeReports,
  type ReportRecord,
  type ReportData,
} from "./model";
const noReview = () => ({
  status: "unreviewed" as const,
  mistakes: [],
  emotions: { before: [], during: [], after: [] },
  adherence: null,
});
export async function reports(
  input: unknown,
  headers?: Headers,
): Promise<ReportData> {
  const owner = await requireUser(headers),
    q = reportSchema.parse(input);
  try {
    return await getDb().transaction(
      async (tx) => {
        const [pref] = await tx
          .select()
          .from(userPreferences)
          .where(eq(userPreferences.userId, owner.id));
        const timezone = pref?.displayTimezone ?? "Asia/Jerusalem";
        const owned = await tx
          .select()
          .from(tradingAccounts)
          .where(eq(tradingAccounts.ownerId, owner.id));
        const accounts =
          q.mode === "demo"
            ? demoAccounts.map((a) => ({
                id: a.id,
                name: a.name,
                archived: false,
              }))
            : owned.map((a) => ({
                id: a.id,
                name: a.displayName,
                archived: !!a.archivedAt,
              }));
        const available = accounts.filter(
            (a) => q.archived === "1" || !a.archived,
          ),
          ids =
            q.accounts === undefined
              ? available.map((a) => a.id)
              : [...new Set(q.accounts.split(",").filter(Boolean))];
        if (ids.some((id) => !available.some((a) => a.id === id)))
          throw new NotFoundError();
        if (
          q.mode === "real" &&
          owned.some((a) => ids.includes(a.id) && a.currency !== "USD")
        )
          throw new NotFoundError();
        const tags =
          (q.tab === "behavior" || !!q.mistakes) && q.mode === "real"
            ? await tx
                .select({
                  id: reviewTags.id,
                  name: reviewTags.name,
                  archived: reviewTags.archived,
                })
                .from(reviewTags)
                .where(eq(reviewTags.ownerId, owner.id))
            : [];
        const allTags = [
          ...mistakes.map(([id, name]) => ({ id, name, archived: false })),
          ...tags,
        ];
        if (
          q.mistakes &&
          q.mistakes.split(",").some((id) => !allTags.some((t) => t.id === id))
        )
          throw new NotFoundError();
        const bounds = rangeBounds(
          viewSchema.parse({ start: q.start, end: q.end }),
          timezone,
        );
        const fees: Record<string, PortionFee> = {};
        let portions: Portion[] = [],
          records: ReportRecord[] = [],
          unresolved = 0,
          pending = false;
        if (q.mode === "demo") {
          portions = trades
            .filter(
              (t) =>
                ids.includes(t.accountId) &&
                (!q.root || (rootSymbol(t.symbol) ?? t.symbol) === q.root),
            )
            .map((t) => ({
              id: t.id,
              ownerId: owner.id,
              tradingAccountId: t.accountId,
              symbol: t.symbol,
              buyFillId: t.id,
              sellFillId: t.id,
              quantity: "1",
              buyPrice: "0",
              sellPrice: "0",
              grossPnl: new D(t.grossCents).div(100).toFixed(),
              boughtAt: t.direction === "long" ? t.entryAt : t.closeAt,
              soldAt: t.direction === "long" ? t.closeAt : t.entryAt,
            }));
          // Integer fixture cents are converted with the existing exact decimal class.
          portions.forEach((p) => {
            const t = trades.find((t) => t.id === p.id)!;
            p.grossPnl = new D(t.grossCents).div(100).toFixed();
            fees[p.id] = {
              amount: new D(t.commissionCents + t.feesCents).div(100).toFixed(),
              kind: "Manual",
            };
          });
          records = demoRecords()
            .filter(
              (r) =>
                ids.includes(r.accountId) &&
                r.exit >= bounds.start! &&
                r.exit < bounds.end! &&
                (!q.symbol || r.symbol === q.symbol) &&
                (!q.root || (r.root ?? r.symbol) === q.root),
            )
            .map((r) => {
              const review = demoReviews[r.id];
              return {
                ...r,
                reviewData: review
                  ? {
                      status: reviewState(review.fields, review.status, 0),
                      mistakes: review.fields.mistakes,
                      emotions: review.fields.emotions,
                      adherence: review.fields.adherence,
                    }
                  : noReview(),
              };
            });
        } else if (ids.length) {
          const scope = sql`r.trading_account_id in (${sql.join(
            ids.map((id) => sql`${id}::uuid`),
            sql`,`,
          )})`;
          const symbol = sql`(${q.symbol ?? null}::text is null or r.symbol=${q.symbol ?? null}) and (${q.root ?? null}::text is null or coalesce(substring(r.symbol from '^([A-Z0-9]+?)[FGHJKMNQUVXZ][0-9]{1,4}$'),r.symbol)=${q.root ?? null})`;
          if (q.tab !== "behavior" && q.analysis === "activity") {
            const result =
              await tx.execute(sql`select p.id::text,p.owner_id as "ownerId",p.trading_account_id::text as "tradingAccountId",p.symbol,p.buy_fill_id as "buyFillId",p.sell_fill_id as "sellFillId",p.quantity::text,p.buy_price::text as "buyPrice",p.sell_price::text as "sellPrice",p.gross_pnl::text as "grossPnl",p.bought_at as "boughtAt",p.sold_at as "soldAt",f.amount::text as amount,f.kind
     from journal_records r join journal_sources l on l.record_id=r.id and l.owner_id=${owner.id} and l.trading_account_id=r.trading_account_id
     join tradovate_performance_records p on p.id=l.source_id and p.owner_id=${owner.id} and p.trading_account_id=r.trading_account_id
     left join journal_portion_fees f on f.source_id=p.id and f.owner_id=${owner.id} and f.trading_account_id=r.trading_account_id
     where r.owner_id=${owner.id} and r.current=true and ${scope} and ${symbol} and greatest(p.bought_at,p.sold_at)>=${bounds.start}::timestamptz and greatest(p.bought_at,p.sold_at)<${bounds.end}::timestamptz`);
            for (const raw of result.rows) {
              const row = raw as unknown as Portion & {
                amount: string | null;
                kind: PortionFee["kind"];
              };
              portions.push({
                ...row,
                boughtAt: new Date(row.boughtAt).toISOString(),
                soldAt: new Date(row.soldAt).toISOString(),
              });
              fees[row.id] = {
                amount: row.amount,
                kind: row.kind ?? "Unknown",
              };
            }
          }
          const behavior = q.tab === "behavior";
          const reviewProjection = behavior
            ? sql`case when rv.status='reviewed' then 'reviewed' when rv.has_content or exists(select 1 from review_attachments im where im.review_id=rv.id and im.owner_id=${owner.id} and im.state='ready') then 'draft' else 'unreviewed' end as "reviewStatus",rv.fields->'mistakes' as mistakes,rv.fields->'emotions' as emotions,rv.fields->>'adherence' as adherence`
            : sql`'unreviewed'::text as "reviewStatus",null::jsonb as mistakes,null::jsonb as emotions,null::text as adherence`;
          const reviewJoin = behavior
            ? sql`left join journal_reviews rv on rv.record_id=r.id and rv.owner_id=${owner.id} and rv.trading_account_id=r.trading_account_id and rv.needs_reassignment=false`
            : sql``;
          const result =
            await tx.execute(sql`select r.id::text,r.trading_account_id::text as "accountId",a.display_name as account,r.symbol,r.direction,r.status,'portion'::text as type,r.entry_at as entry,r.exit_at as exit,extract(epoch from r.exit_at-r.entry_at)::text as duration,r.gross_pnl::text as gross,r.fees::text as fees,(r.gross_pnl-r.fees)::text as net,r.fee_kind as "feeKind",(r.fee_kind in ('Estimated','Mixed')) as estimated,${reviewProjection}
    from journal_records r join trading_accounts a on a.id=r.trading_account_id and a.owner_id=${owner.id} ${reviewJoin}
    where r.owner_id=${owner.id} and r.current=true and ${scope} and ${symbol} and r.exit_at>=${bounds.start}::timestamptz and r.exit_at<${bounds.end}::timestamptz`);
          records = result.rows.map((raw) => {
            const row = raw as unknown as ReportRecord & {
              reviewStatus: "unreviewed" | "draft" | "reviewed";
              mistakes: string[] | null;
              emotions: ReportRecord["reviewData"]["emotions"] | null;
              adherence: string | null;
            };
            return {
              ...row,
              root: rootSymbol(row.symbol),
              entry: row.entry ? new Date(row.entry).toISOString() : null,
              exit: new Date(row.exit).toISOString(),
              quantity: null,
              entryPrice: null,
              exitPrice: null,
              fullGross: row.gross,
              partial: false,
              imported: null,
              reviewData: {
                status: row.reviewStatus,
                mistakes: row.mistakes ?? [],
                emotions: row.emotions ?? { before: [], during: [], after: [] },
                adherence: row.adherence,
              },
            };
          });
          if (behavior) {
            const detached = await tx.execute(
              sql`select count(*)::int n from journal_reviews rv where rv.owner_id=${owner.id} and rv.needs_reassignment=true and rv.trading_account_id in (${sql.join(
                ids.map((id) => sql`${id}::uuid`),
                sql`,`,
              )}) and (${q.symbol ?? null}::text is null or rv.original_symbol=${q.symbol ?? null}) and (${q.root ?? null}::text is null or coalesce(substring(rv.original_symbol from '^([A-Z0-9]+?)[FGHJKMNQUVXZ][0-9]{1,4}$'),rv.original_symbol)=${q.root ?? null})`,
            );
            unresolved = Number(detached.rows[0].n);
          }
          pending = Boolean(
            (
              await tx.execute(
                sql`select exists(select 1 from journal_processing where owner_id=${owner.id} and trading_account_id in (${sql.join(
                  ids.map((id) => sql`${id}::uuid`),
                  sql`,`,
                )}) and status<>'Ready') or exists(select 1 from tradovate_performance_records p where p.owner_id=${owner.id} and p.trading_account_id in (${sql.join(
                  ids.map((id) => sql`${id}::uuid`),
                  sql`,`,
                )}) and not exists(select 1 from journal_sources l where l.source_id=p.id and l.owner_id=${owner.id})) as pending`,
              )
            ).rows[0].pending,
          );
        }
        const data = summarizeReports({
          q,
          ids,
          timezone,
          portions,
          fees,
          records,
          tags: allTags,
          unresolved,
        });
        // Account labels are owned metadata, including parents that close after the activity range.
        data.groups.account?.forEach((g) => {
          g.label = accounts.find((a) => a.id === g.key)?.name ?? g.label;
        });
        return {
          userId: owner.id,
          timezone,
          currency: "USD",
          accounts,
          tags: allTags,
          pending,
          ...data,
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  } catch (e) {
    if (e instanceof NotFoundError) throw e;
    throw new WorkspaceUnavailableError();
  }
}
