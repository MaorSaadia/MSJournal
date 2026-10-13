import "server-only";
import { REAL_RECORD_KIND } from "@/lib/journal/statistics";
import { demoReviews } from "@/data/demo-reviews";
import { reviewState, hasNotes, mistakes } from "@/lib/reviews/model";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  strategies,
  tradingAccounts,
  userPreferences,
  reviewTags,
} from "@/db/schema";
import { requireUser } from "@/lib/session";
import { NotFoundError } from "@/lib/accounts/service";
import { WorkspaceUnavailableError } from "@/lib/server-error";
import { accounts as demoAccounts, trades } from "@/data/demo";
import { D } from "./processing";
import { summary } from "./statistics";
import { durationBounds } from "./analysis-filters";
import {
  viewSchema,
  rangeBounds,
  filterDemo,
  summaryOf,
  type TradeViewData,
  type ViewRecord,
} from "./view-model";

export function demoRecords(): ViewRecord[] {
  return trades.map((t) => {
    const gross = new D(t.grossCents).div(100).toFixed(),
      fees = new D(t.commissionCents + t.feesCents).div(100).toFixed();
    return {
      reviewStatus: demoReviews[t.id]
        ? reviewState(demoReviews[t.id].fields, demoReviews[t.id].status, 0)
        : "unreviewed",
      hasNotes: !!demoReviews[t.id] && hasNotes(demoReviews[t.id].fields),
      imageCount: 0,
      reviewFields: demoReviews[t.id]?.fields,
      id: t.id,
      accountId: t.accountId,
      account: demoAccounts.find((a) => a.id === t.accountId)!.name,
      symbol: t.symbol,
      root: t.symbol,
      direction: t.direction,
      status: "Complete demo trade",
      type: "trade",
      entry: t.entryAt,
      exit: t.closeAt,
      duration: String((Date.parse(t.closeAt) - Date.parse(t.entryAt)) / 1000),
      quantity: null,
      entryPrice: null,
      exitPrice: null,
      gross,
      fees,
      net: new D(gross).minus(fees).toFixed(),
      estimated: false,
      feeKind: "Demo",
      fullGross: gross,
      partial: false,
      imported: null,
    };
  });
}
export async function tradeView(
  input: unknown,
  headers?: Headers,
): Promise<TradeViewData> {
  const user = await requireUser(headers),
    q = viewSchema.parse(input);
  try {
    return await getDb().transaction(
      async (tx) => {
        const [pref] = await tx
          .select()
          .from(userPreferences)
          .where(eq(userPreferences.userId, user.id));
        const timezone = pref?.displayTimezone ?? "Asia/Jerusalem";
        const accounts =
          q.mode === "demo"
            ? demoAccounts.map((a) => ({
                id: a.id,
                name: a.name,
                archived: false,
              }))
            : (
                await tx
                  .select()
                  .from(tradingAccounts)
                  .where(eq(tradingAccounts.ownerId, user.id))
              ).map((a) => ({
                id: a.id,
                name: a.displayName,
                archived: !!a.archivedAt,
              }));
        const available = accounts.filter(
          (a) => q.archived === "1" || !a.archived,
        );
        const ids =
          q.accounts === undefined
            ? available.map((a) => a.id)
            : [...new Set(q.accounts.split(",").filter(Boolean))];
        if (ids.some((id) => !available.some((a) => a.id === id)))
          throw new NotFoundError();
        if (q.mode === "demo") {
          const rows = filterDemo(
            demoRecords().filter((r) => ids.includes(r.accountId)),
            q,
            timezone,
          );
          const pages = Math.max(1, Math.ceil(rows.length / q.size)),
            page = Math.min(q.page, pages),
            index = rows.findIndex((r) => r.id === q.record);
          return {
            userId: user.id,
            timezone,
            accounts,
            rows: rows.slice((page - 1) * q.size, page * q.size),
            summary: summaryOf(rows, q),
            page,
            pages,
            sourceCount: trades.length,
            pending: false,
            navigation:
              index < 0
                ? null
                : {
                    previous: rows[index - 1]?.id ?? null,
                    next: rows[index + 1]?.id ?? null,
                    position: index + 1,
                  },
          };
        }
        const tags = (
          await tx
            .select()
            .from(reviewTags)
            .where(eq(reviewTags.ownerId, user.id))
        ).map(({ id, name, archived }) => ({ id, name, archived }));
        if (
          [q.mistake, ...(q.mistakes?.split(",") ?? [])]
            .filter(Boolean)
            .some(
              (id) =>
                !mistakes.some(([key]) => key === id) &&
                !tags.some((t) => t.id === id),
            )
        )
          throw new NotFoundError();
        const bounds = rangeBounds(q, timezone);
        const within = sql`(${bounds.start}::timestamptz is null or greatest(p.bought_at,p.sold_at) >= ${bounds.start}::timestamptz)
        and (${bounds.end}::timestamptz is null or greatest(p.bought_at,p.sold_at) < ${bounds.end}::timestamptz)
        and (${q.weekday ?? null}::int is null or extract(dow from greatest(p.bought_at,p.sold_at) at time zone ${timezone})=${q.weekday ?? null}::int)`;
        const holding = q.holding ? durationBounds[q.holding] : null;
        const idScope = ids.length
          ? sql`r.trading_account_id in (${sql.join(
              ids.map((id) => sql`${id}::uuid`),
              sql`,`,
            )})`
          : sql`false`;
        // One row per published parent. Portions only supply the selected-period contribution.
        const partValue =
          q.basis === "gross" ? sql`p.gross_pnl` : sql`p.gross_pnl-f.amount`;
        const partOutcome = sql`(${q.outcomeBasis} <> 'portions' or (
          (${q.outcome}='all' or case ${q.outcome} when 'profit' then ${partValue}>0 when 'loss' then ${partValue}<0 else ${partValue}=0 end)
          and (${q.min ?? null}::numeric is null or ${partValue}>=${q.min ?? null}::numeric)
          and (${q.max ?? null}::numeric is null or ${partValue}<=${q.max ?? null}::numeric)))`;
        if (q.strategy && q.strategy !== "unassigned") {
          const [owned] = await tx
            .select()
            .from(strategies)
            .where(
              and(
                eq(strategies.ownerId, user.id),
                eq(strategies.id, q.strategy),
              ),
            );
          if (!owned) throw new NotFoundError();
        }
        const cte = sql`with projected as (
        select r.id::text,sa.strategy_id::text as "strategyId",st.fields->>'name' as "strategyName", r.trading_account_id::text as "accountId", a.display_name as account, r.symbol,
          coalesce(substring(r.symbol from '^([A-Z0-9]+?)[FGHJKMNQUVXZ][0-9]{1,4}$'),r.symbol) as root,
          case when rv.status='reviewed' then 'reviewed' when rv.has_content or coalesce(images.n,0)>0 then 'draft' else 'unreviewed' end as "reviewStatus",
          coalesce(rv.has_notes,false) as "hasNotes", coalesce(images.n,0)::int as "imageCount", rv.fields as "reviewFields",
          r.direction, r.status, ${REAL_RECORD_KIND}::text as type, r.entry_at as entry, r.exit_at as exit,
          extract(epoch from r.exit_at-r.entry_at)::text as duration,
          contribution.quantity::text as quantity, r.entry_price::text as "entryPrice", r.exit_price::text as "exitPrice",
          contribution.values as "sourceValues", contribution.gross::text as gross, contribution.fees::text as fees,
          (contribution.gross-contribution.fees)::text as net, contribution.estimated,
          contribution.kind as "feeKind", r.gross_pnl::text as "fullGross", contribution.partial,
          (select min(b.created_at) from import_provenance ip join import_files f on f.id=ip.file_id and f.owner_id=${user.id}
            join import_batches b on b.id=f.batch_id and b.owner_id=${user.id}
            join journal_sources ls on ls.source_id=ip.performance_record_id and ls.owner_id=${user.id}
            where ip.owner_id=${user.id} and ls.record_id=r.id) as imported
        from journal_records r join trading_accounts a on a.id=r.trading_account_id and a.owner_id=${user.id}
        left join strategy_assignments sa on sa.record_id=r.id and sa.owner_id=${user.id} and sa.needs_reassignment=false
        left join strategies st on st.id=sa.strategy_id and st.owner_id=${user.id}
        left join journal_reviews rv on rv.record_id=r.id and rv.owner_id=${user.id} and rv.trading_account_id=r.trading_account_id and rv.needs_reassignment=false
        left join lateral (select count(*)::int n from review_attachments ra where ra.review_id=rv.id and ra.owner_id=${user.id} and ra.state='ready') images on true
        cross join lateral (
          select jsonb_agg((${partValue})::text) as values, sum(p.gross_pnl) as gross, sum(p.quantity) as quantity,
            case when count(f.amount)=count(*) then sum(f.amount) else null end as fees,
            coalesce(bool_or(f.kind='Estimated'),false) as estimated,
            case when count(f.amount)<>count(*) then 'Unknown' when count(distinct f.kind)>1 then 'Mixed' else min(f.kind) end as kind,
            count(*) < (select count(*) from journal_sources allparts where allparts.record_id=r.id and allparts.owner_id=${user.id}) as partial
          from journal_sources l join tradovate_performance_records p on p.id=l.source_id and p.owner_id=${user.id} and p.trading_account_id=r.trading_account_id
          left join journal_portion_fees f on f.source_id=p.id and f.owner_id=${user.id} and f.trading_account_id=r.trading_account_id
          where l.record_id=r.id and l.owner_id=${user.id} and l.trading_account_id=r.trading_account_id
            and ${partOutcome}
            and (${q.dateBasis}='closed' or ((${within}) and (${q.direction}='all' or
              ${q.direction}=case when p.bought_at<p.sold_at then 'long' when p.bought_at>p.sold_at then 'short' else 'unknown' end)))
        ) contribution
        where r.owner_id=${user.id} and r.current=true and ${idScope} and contribution.gross is not null
          and (${q.dateBasis}='activity' or (
            (${bounds.start}::timestamptz is null or r.exit_at>=${bounds.start}::timestamptz)
            and (${bounds.end}::timestamptz is null or r.exit_at<${bounds.end}::timestamptz)))
      ), filtered as (select * from projected where
        (${q.strategy ?? null}::text is null or case when ${q.strategy ?? null}='unassigned' then "strategyId" is null else "strategyId"=${q.strategy ?? null} end) and
        (${q.review}='all' or (${q.review}='notes' and "hasNotes") or (${q.review}='screenshots' and "imageCount">0) or "reviewStatus"=${q.review})
        and (${q.mistake ?? null}::text is null or ("reviewFields"->'mistakes') ? ${q.mistake ?? null})
        and (${q.mistakes ?? null}::text is null or exists(select 1 from unnest(string_to_array(${q.mistakes ?? null},',')) tag where ("reviewFields"->'mistakes') ? tag))
        and (${q.reviewMissing ?? null}::text is null or case ${q.reviewMissing ?? null} when 'mistake' then coalesce(jsonb_array_length("reviewFields"->'mistakes'),0)=0 when 'emotion' then coalesce(jsonb_array_length("reviewFields"->'emotions'->${q.emotionStage}),0)=0 else "reviewFields"->>'adherence' is null end)
        and (${q.dateBasis}='activity' or ${q.weekday ?? null}::int is null or extract(dow from exit at time zone ${timezone})=${q.weekday ?? null}::int)
        and (${q.hour ?? null}::int is null or extract(hour from entry at time zone ${timezone})=${q.hour ?? null}::int)
        and (${q.holding ?? null}::text is null or (duration::numeric >= ${holding?.[0] ?? null}::numeric and (${holding?.[1] ?? null}::numeric is null or duration::numeric < ${holding?.[1] ?? null}::numeric)))
        and (${q.emotion ?? null}::text is null or ("reviewFields"->'emotions'->${q.emotionStage}) ? ${q.emotion ?? null})
        and (${q.adherence ?? null}::text is null or "reviewFields"->>'adherence'=${q.adherence ?? null})
        and (${q.symbol ?? null}::text is null or symbol=${q.symbol ?? null})
        and (${q.root ?? null}::text is null or root=${q.root ?? null})
        and (${q.dateBasis}='activity' or ${q.direction}='all' or direction=${q.direction})
        and (${q.type} in ('all','portion'))
        and (${q.status}='all' or status=case when ${q.status}='review' then 'Needs review' else 'Matched portions' end)
        and (${q.search}='' or position(lower(${q.search}) in lower(account || ' ' || symbol))>0)
        and (${q.outcomeBasis}='portions' or ${q.outcome}='all' or (${q.basis}='gross' and case ${q.outcome} when 'profit' then gross::numeric>0 when 'loss' then gross::numeric<0 else gross::numeric=0 end)
          or (${q.basis}='net' and case ${q.outcome} when 'profit' then net::numeric>0 when 'loss' then net::numeric<0 else net::numeric=0 end))
        and (${q.outcomeBasis}='portions' or ${q.min ?? null}::numeric is null or (case when ${q.basis}='gross' then gross else net end)::numeric>=${q.min ?? null}::numeric)
        and (${q.outcomeBasis}='portions' or ${q.max ?? null}::numeric is null or (case when ${q.basis}='gross' then gross else net end)::numeric<=${q.max ?? null}::numeric)
      )`;
        const sort = {
          exit: sql`exit`,
          entry: sql`entry`,
          duration: sql`duration::numeric`,
          quantity: sql`quantity::numeric`,
          gross: sql`gross::numeric`,
          fees: sql`fees::numeric`,
          net: sql`net::numeric`,
          symbol: sql`symbol`,
          account: sql`account`,
        }[q.sort];
        const order = q.order === "asc" ? sql`asc` : sql`desc`;
        const result =
          await tx.execute(sql`${cte}, ordered as (select *, row_number() over(order by ${sort} ${order} nulls last,id asc) as position,
        lag(id) over(order by ${sort} ${order} nulls last,id asc) as previous,
        lead(id) over(order by ${sort} ${order} nulls last,id asc) as next from filtered), totals as (
        select jsonb_agg("sourceValues") as "sourceValues", count(*)::int as count, 0 as trades, count(*)::int as portions,
          coalesce(sum(gross::numeric),0)::text as gross,
          case when count(net)=count(*) then coalesce(sum(net::numeric),0)::text else null end as net,
          count(net)::int as covered, coalesce(bool_or(estimated),false) as estimated, null::text as "winRate" from filtered
      ) select row_to_json(totals) as summary,
        coalesce((select json_agg(page_rows order by position) from (
          select * from ordered order by position limit ${q.size}
          offset ((least(${q.page},greatest(1,ceil(totals.count::numeric/${q.size})::int))-1)*${q.size})
        ) page_rows),'[]'::json) as rows,
        (select json_build_object('previous',previous,'next',next,'position',position) from ordered where id=${q.record ?? null}) as navigation,
        (select count(*)::int from tradovate_performance_records where owner_id=${user.id}) as "sourceCount",
        exists(select 1 from tradovate_performance_records p where p.owner_id=${user.id} and not exists(
          select 1 from journal_sources l where l.owner_id=${user.id} and l.source_id=p.id))
          or exists(select 1 from journal_processing where owner_id=${user.id} and status<>'Ready') as pending
        from totals`);
        const data = result.rows[0] as unknown as Pick<
          TradeViewData,
          "summary" | "rows" | "navigation" | "sourceCount" | "pending"
        >;
        const rawSummary = data.summary as typeof data.summary & {
          sourceValues: (string | null)[][] | null;
        };
        data.summary.statistics = summary(
          q.outcomeBasis === "portions"
            ? (rawSummary.sourceValues ?? []).flat()
            : [],
          data.summary.estimated,
        );
        delete (
          data.summary as typeof data.summary & { sourceValues?: unknown }
        ).sourceValues;
        data.rows.forEach((row) => {
          delete (row as typeof row & { sourceValues?: unknown }).sourceValues;
        });
        const pages = Math.max(1, Math.ceil(data.summary.count / q.size));
        return {
          ...data,
          tags,
          strategyRecoveryCount: Number(
            (
              await tx.execute(
                sql`select count(*)::int n from strategy_assignments where owner_id=${user.id} and needs_reassignment=true`,
              )
            ).rows[0].n,
          ),
          recoveryCount: Number(
            (
              await tx.execute(
                sql`select count(*)::int n from journal_reviews where owner_id=${user.id} and needs_reassignment=true`,
              )
            ).rows[0].n,
          ),
          userId: user.id,
          timezone,
          accounts,
          pages,
          page: Math.min(q.page, pages),
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  } catch (e) {
    if (e instanceof NotFoundError) throw e;
    throw new WorkspaceUnavailableError();
  }
}
