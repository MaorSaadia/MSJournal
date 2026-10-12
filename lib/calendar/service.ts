import "server-only";
import { and, eq, inArray, sql, gte, lt, isNull, count } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import {
  tradingAccounts,
  userPreferences,
  tradovatePerformance as p,
  journalSources as links,
  journalRecords as records,
  journalPortionFees as f,
  journalProcessing as states,
} from "@/db/schema";
import { requireUser } from "@/lib/session";
import { NotFoundError } from "@/lib/accounts/service";
import { WorkspaceUnavailableError } from "@/lib/server-error";
import {
  D,
  PROCESSING_VERSION,
  portionExit,
  direction,
  sum,
  type Portion,
  type PortionFee,
} from "@/lib/journal/processing";
import {
  realizedPerformance,
  selectedPortions,
} from "@/lib/journal/calculations";
import {
  aggregateCalendar,
  monthSchema,
  daySchema,
  monthEnd,
  dayBounds,
  monthBounds,
  todayIn,
  type CalendarMonth,
  type CalendarDetails,
  type DayContribution,
} from "./model";
import { accounts as demoAccounts, trades as demoTrades } from "@/data/demo";

export const requestSchema = z
  .object({
    month: monthSchema,
    mode: z.enum(["real", "demo"]).default("real"),
    accounts: z.string().max(8000).optional(),
    archived: z.enum(["0", "1"]).default("0"),
    basis: z.enum(["gross", "net"]).default("gross"),
    start: daySchema.optional(),
    end: daySchema.optional(),
    day: daySchema.optional(),
    symbol: z.string().max(80).optional(),
    direction: z.enum(["all", "long", "short", "unknown"]).default("all"),
  })
  .strict()
  .refine((v) => !v.start || !v.end || v.start <= v.end);
export async function calendarData(
  input: unknown,
  headers?: Headers,
  contextTimezone?: string,
): Promise<CalendarMonth | CalendarDetails> {
  const owner = await requireUser(headers);
  const params = requestSchema.parse(input);
  if (params.day && !params.day.startsWith(params.month))
    throw new NotFoundError();
  try {
    return await getDb().transaction(
      async (tx) => {
        const [pref] = await tx
          .select()
          .from(userPreferences)
          .where(eq(userPreferences.userId, owner.id));
        // Both locations use the saved display zone; immutable demo and source timestamps stay unchanged.
        const timezone =
            contextTimezone ?? pref?.displayTimezone ?? "Asia/Jerusalem",
          weekStartsOn = pref?.weekStartsOn === 1 ? 1 : 0;
        const owned =
          params.mode === "demo"
            ? demoAccounts.map((a) => ({
                id: a.id,
                name: a.name,
                archived: false,
              }))
            : (
                await tx
                  .select()
                  .from(tradingAccounts)
                  .where(eq(tradingAccounts.ownerId, owner.id))
              ).map((a) => ({
                id: a.id,
                name: a.displayName,
                archived: !!a.archivedAt,
              }));
        const available = owned.filter(
          (a) => params.archived === "1" || !a.archived,
        );
        const ids =
          params.accounts === undefined
            ? available.map((a) => a.id)
            : [...new Set(params.accounts.split(",").filter(Boolean))];
        if (ids.some((id) => !available.some((a) => a.id === id)))
          throw new NotFoundError();
        const accounts = available.filter((a) => ids.includes(a.id));
        const filter = {
          accounts: ids,
          start: params.start ?? params.month + "-01",
          end: params.end ?? monthEnd(params.month),
          symbol: params.symbol,
          direction: params.direction,
        };
        let rows: Portion[] = [],
          fees: Record<string, PortionFee> = {},
          contributions: DayContribution[] = [],
          unpublished = 0,
          failed = false,
          outdated = false;
        if (params.mode === "demo") {
          rows = demoTrades.map((t) => ({
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
          fees = Object.fromEntries(
            demoTrades.map((t) => [
              t.id,
              {
                amount: new D(t.commissionCents + t.feesCents)
                  .div(100)
                  .toFixed(),
                kind: "Manual" as const,
              },
            ]),
          );
          if (params.day)
            contributions = selectedPortions(
              rows,
              { ...filter, start: params.day, end: params.day },
              timezone,
            ).map((r) => ({
              id: r.id,
              account: accounts.find((a) => a.id === r.tradingAccountId)!.name,
              symbol: r.symbol,
              direction: direction(r),
              exitAt: portionExit(r),
              quantity: null,
              gross: r.grossPnl,
              fees: fees[r.id].amount,
              net: new D(r.grossPnl).minus(fees[r.id].amount!).toFixed(),
              estimated: false,
              status: "Trades closed",
              partial: false,
              href: `/trade-view/${r.id}?mode=demo`,
            }));
        } else if (ids.length) {
          const bounds = params.day
            ? dayBounds(params.day, timezone)
            : monthBounds(params.month, timezone);
          const exit = sql`greatest(${p.boughtAt},${p.soldAt})`;
          const scope = and(
            eq(p.ownerId, owner.id),
            inArray(p.tradingAccountId, ids),
            gte(exit, new Date(bounds.start)),
            lt(exit, new Date(bounds.end)),
          );
          const published = await tx
            .select({ source: p, fee: f, record: records })
            .from(p)
            .innerJoin(
              links,
              and(
                eq(links.sourceId, p.id),
                eq(links.ownerId, owner.id),
                eq(links.tradingAccountId, p.tradingAccountId),
              ),
            )
            .innerJoin(
              records,
              and(
                eq(records.id, links.recordId),
                eq(records.ownerId, owner.id),
                eq(records.current, true),
              ),
            )
            .leftJoin(
              f,
              and(
                eq(f.sourceId, p.id),
                eq(f.ownerId, owner.id),
                eq(f.tradingAccountId, p.tradingAccountId),
              ),
            )
            .where(scope);
          rows = published.map(({ source: r }) => ({
            ...r,
            boughtAt: r.boughtAt.toISOString(),
            soldAt: r.soldAt.toISOString(),
          }));
          fees = Object.fromEntries(
            published.map(({ source: r, fee }) => [
              r.id,
              { amount: fee?.amount ?? null, kind: fee?.kind ?? "Unknown" },
            ]),
          );
          if (params.day) {
            const selected = new Set(
              selectedPortions(
                rows,
                { ...filter, start: params.day, end: params.day },
                timezone,
              ).map((r) => r.id),
            );
            const grouped = new Map<string, typeof published>();
            published
              .filter((r) => selected.has(r.source.id))
              .forEach((r) =>
                grouped.set(r.record.id, [
                  ...(grouped.get(r.record.id) ?? []),
                  r,
                ]),
              );
            contributions = [...grouped].map(([id, items]) => {
              const record = items[0].record,
                gross = sum(items.map((i) => i.source.grossPnl)),
                quantity = sum(items.map((i) => i.source.quantity));
              const amount = items.every((i) => i.fee?.amount != null)
                ? sum(items.map((i) => i.fee!.amount!))
                : null;
              return {
                id,
                account: accounts.find((a) => a.id === record.tradingAccountId)!
                  .name,
                symbol: record.symbol,
                direction: record.direction,
                exitAt: items
                  .map((i) =>
                    portionExit({
                      ...i.source,
                      boughtAt: i.source.boughtAt.toISOString(),
                      soldAt: i.source.soldAt.toISOString(),
                    }),
                  )
                  .sort()
                  .at(-1)!,
                quantity,
                gross,
                fees: amount,
                net:
                  amount === null ? null : new D(gross).minus(amount).toFixed(),
                estimated: items.some((i) => i.fee?.kind === "Estimated"),
                status: record.status,
                partial: new D(quantity).lt(record.closedQuantity),
                href: `/trade-view/${id}`,
              };
            });
          } else {
            const [missing] = await tx
              .select({ n: count() })
              .from(p)
              .leftJoin(links, eq(links.sourceId, p.id))
              .where(and(scope, isNull(links.sourceId)));
            unpublished = missing.n;
            const processing = await tx
              .select()
              .from(states)
              .where(
                and(
                  eq(states.ownerId, owner.id),
                  inArray(states.tradingAccountId, ids),
                ),
              );
            failed = processing.some((s) => s.status === "Failed");
            outdated = processing.some((s) => s.version !== PROCESSING_VERSION);
          }
        }
        if (params.day) {
          const result = realizedPerformance(
            rows,
            fees,
            {
              ...filter,
              start: params.day > filter.start ? params.day : filter.start,
              end: params.day < filter.end ? params.day : filter.end,
            },
            timezone,
          );
          // Date-range exclusions apply to both summary and records.
          return {
            userId: owner.id,
            date: params.day,
            timezone,
            accounts,
            day: result.days[0] ?? null,
            records: result.days.length
              ? contributions.sort((a, b) => a.exitAt.localeCompare(b.exitAt))
              : [],
            mode: params.mode,
          };
        }
        return {
          userId: owner.id,
          ...aggregateCalendar(
            rows,
            fees,
            filter,
            timezone,
            params.month,
            weekStartsOn,
            params.basis,
          ),
          accounts,
          mode: params.mode,
          processing: { unpublished, failed, outdated },
          today: todayIn(timezone),
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof z.ZodError)
      throw error;
    throw new WorkspaceUnavailableError();
  }
}
