import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { journalDetails } from "@/lib/journal/service";
import { NotFoundError, getTradingAccount } from "@/lib/accounts/service";
import { getPreferences } from "@/lib/preferences";
import { journalTimestamp } from "@/lib/timezones";
import { journalMoney } from "@/lib/journal/calculations";
import {
  D,
  direction,
  portionEntry,
  portionExit,
  sum,
} from "@/lib/journal/processing";
import { ManualFeeForm } from "@/components/journal/actions";
import { DetailNavigation } from "@/components/journal/detail-navigation";
import { demoRecords } from "@/lib/journal/view-service";
import { viewSchema } from "@/lib/journal/view-model";
import { realizedPerformance } from "@/lib/journal/calculations";
export const metadata = { title: "Journal record" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const search = await searchParams;
  const selection = viewSchema.safeParse(
    Object.fromEntries(
      Object.entries(search).filter(
        ([k, v]) => k !== "from" && typeof v === "string",
      ),
    ),
  );
  if (search.mode === "demo") {
    const record = demoRecords().find((r) => r.id === id);
    if (!record) notFound();
    const prefs = await getPreferences();
    return (
      <div className="accounts-page journal-page">
        <DetailNavigation id={id} />
        <header className="page-header">
          <div>
            <div className="breadcrumb">Demo data / Trade View</div>
            <h1>
              {record.symbol}
              <span className="title-dot">.</span>
            </h1>
            <p>
              {record.account} · {record.direction} · Complete demo trade
            </p>
          </div>
        </header>
        <section className="import-card">
          <div className="journal-summary">
            <div>
              <small>Gross P&L · USD</small>
              <strong>{journalMoney(record.gross, true)}</strong>
            </div>
            <div>
              <small>Fictional fees</small>
              <strong>{journalMoney(record.fees)}</strong>
            </div>
            <div>
              <small>Net P&L</small>
              <strong>{journalMoney(record.net, true)}</strong>
            </div>
            <div>
              <small>Entry · {prefs.displayTimezone}</small>
              <strong>
                {journalTimestamp(record.entry, prefs.displayTimezone)}
              </strong>
            </div>
            <div>
              <small>Close</small>
              <strong>
                {journalTimestamp(record.exit, prefs.displayTimezone)}
              </strong>
            </div>
            <div>
              <small>Duration</small>
              <strong>{record.duration}s</strong>
            </div>
          </div>
          <p className="small muted">
            The deterministic demo fixture models complete trades and fictional
            fees. Quantity, entry/exit prices, execution portions and source
            imports are not modeled.
          </p>
        </section>
      </div>
    );
  }
  if (!z.uuid().safeParse(id).success) notFound();
  let details;
  try {
    details = await journalDetails(id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const { record, parts, fees, references } = details;
  const [account, prefs] = await Promise.all([
    getTradingAccount(record.tradingAccountId),
    getPreferences(),
  ]);
  const timezone = prefs.displayTimezone,
    net =
      record.fees === null
        ? null
        : new D(record.grossPnl).minus(record.fees).toFixed();
  const realized = realizedPerformance(
    parts,
    fees,
    {
      accounts: [record.tradingAccountId],
      start: "0000-01-01",
      end: "9999-12-31",
    },
    timezone,
  );
  const contribution =
    selection.success && selection.data.dateBasis === "activity"
      ? realizedPerformance(
          parts,
          fees,
          {
            accounts: [record.tradingAccountId],
            start: selection.data.start ?? "0000-01-01",
            end: selection.data.end ?? "9999-12-31",
            direction: selection.data.direction,
            symbol: selection.data.symbol,
          },
          timezone,
        )
      : null;
  return (
    <div className="accounts-page journal-page">
      <DetailNavigation id={id} />
      <header className="page-header">
        <div>
          <div className="breadcrumb">Workspace / Trade View</div>
          <h1>
            {record.symbol}
            <span className="title-dot">.</span>
          </h1>
          <p className="muted">
            {account.displayName} ·{" "}
            {record.direction === "unknown"
              ? "Direction unknown"
              : record.direction}{" "}
            · {record.status}
          </p>
        </div>
      </header>
      <section className="import-card">
        <h2>Closed-portion record · full result</h2>
        <p className="muted">{record.explanation}</p>
        <div className="journal-summary">
          <div>
            <small>Gross P&L</small>
            <strong>{journalMoney(record.grossPnl, true)}</strong>
          </div>
          <div>
            <small>Fees · {record.feeKind}</small>
            <strong>{journalMoney(record.fees)}</strong>
          </div>
          <div>
            <small>
              {record.feeKind === "Estimated" || record.feeKind === "Mixed"
                ? "Estimated net P&L"
                : "Net P&L"}
            </small>
            <strong>{journalMoney(net, true)}</strong>
          </div>
          <div>
            <small>Closed matched quantity</small>
            <strong>{record.closedQuantity.replace(/\.0+$/, "")}</strong>
            <small>Maximum simultaneous position size unknown</small>
          </div>
          <div>
            <small>Earliest supported entry · {timezone}</small>
            <strong>{journalTimestamp(record.entryAt, timezone)}</strong>
          </div>
          <div>
            <small>Final matched exit · {timezone}</small>
            <strong>{journalTimestamp(record.exitAt, timezone)}</strong>
            <small>
              {record.entryAt
                ? `${(new Date(record.exitAt).getTime() - new Date(record.entryAt).getTime()) / 1000}s matched interval; not verified full-position duration`
                : "Duration unknown"}
            </small>
          </div>
          <div>
            <small>Quantity-weighted entry / exit</small>
            <strong>
              {record.entryPrice === null
                ? "Unavailable"
                : new D(record.entryPrice).toFixed()}{" "}
              /{" "}
              {record.exitPrice === null
                ? "Unavailable"
                : new D(record.exitPrice).toFixed()}
            </strong>
          </div>
        </div>
        <p className="small muted">
          Source gross sum {journalMoney(sum(parts.map((p) => p.grossPnl)))} =
          derived gross {journalMoney(record.grossPnl)}. Daily realized P&L uses
          each portion’s exit date; this group’s final exit is only for list
          order. Fees are never added twice.
        </p>
      </section>
      {contribution && (
        <section className="import-card">
          <h2>P&L in range · selected contribution</h2>
          <p>
            {selection.success
              ? `${selection.data.start ?? "All dates"} through ${selection.data.end ?? "All dates"}`
              : ""}{" "}
            · {timezone}
          </p>
          <div className="journal-summary">
            <div>
              <small>Gross P&L in range</small>
              <strong>{journalMoney(contribution.gross, true)}</strong>
            </div>
            <div>
              <small>Fees in range</small>
              <strong>{journalMoney(contribution.feeAmount)}</strong>
            </div>
            <div>
              <small>
                {contribution.estimated ? "Estimated net" : "Net"} P&L in range
              </small>
              <strong>{journalMoney(contribution.net, true)}</strong>
            </div>
          </div>
          <p className="small muted">
            {contribution.selected.length} of {parts.length} closed portions
            selected. The full record result is shown above.
          </p>
        </section>
      )}
      <section className="import-card">
        <h2>Daily realized contributions</h2>
        <div className="tv-daily">
          {realized.days.map((day) => (
            <div key={day.date}>
              <small>{day.date}</small>
              <p>
                Gross {journalMoney(day.gross, true)} ·{" "}
                {day.estimated ? "Estimated net" : "Net"}{" "}
                {journalMoney(day.net, true)}
              </p>
            </div>
          ))}
        </div>
      </section>
      <section className="import-card">
        <h2>Contributing source portions</h2>
        <p className="small muted">
          Times in {timezone}. For shorts, sell is entry and buy is exit. Equal
          timestamps have unknown direction.
        </p>
        <div className="import-table-scroll">
          <table className="import-table journal-table">
            <thead>
              <tr>
                {[
                  "Quantity / direction",
                  "Buy price / timestamp",
                  "Sell price / timestamp",
                  "Realized exit",
                  "Gross P&L",
                  "Fee provenance",
                  "Source imports",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parts.map((p) => (
                <tr key={p.id}>
                  <td>
                    {new D(p.quantity).toFixed()}
                    <small>{direction(p)}</small>
                  </td>
                  <td>
                    {new D(p.buyPrice).toFixed()}
                    <small>{journalTimestamp(p.boughtAt, timezone)}</small>
                  </td>
                  <td>
                    {new D(p.sellPrice).toFixed()}
                    <small>{journalTimestamp(p.soldAt, timezone)}</small>
                  </td>
                  <td>
                    {journalTimestamp(portionExit(p), timezone)}
                    <small>
                      Entry: {journalTimestamp(portionEntry(p), timezone)}
                    </small>
                  </td>
                  <td>{journalMoney(p.grossPnl, true)}</td>
                  <td>
                    {fees[p.id]?.kind ?? "Unknown"}:{" "}
                    {journalMoney(fees[p.id]?.amount ?? null)}
                    <small>
                      {fees[p.id]?.kind === "Estimated"
                        ? `${new D(p.quantity).toFixed()} × 2 × ${new D(fees[p.id].perSide!).toFixed()} USD`
                        : fees[p.id]?.kind === "Manual"
                          ? "Allocated explicit record total"
                          : "No fee supplied"}
                    </small>
                  </td>
                  <td>
                    <details>
                      <summary>Source imports</summary>
                      {references
                        .filter((r) => r.sourceId === p.id)
                        .map((r, i) => (
                          <small key={i}>
                            <Link
                              className="back-link"
                              href={`/imports/${r.batchId}`}
                            >
                              {r.name} · row {r.row}
                            </Link>
                          </small>
                        ))}
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="import-card journal-fee-card">
        <h2>Explicit fee adjustment</h2>
        <ManualFeeForm
          recordId={record.id}
          amount={record.feeKind === "Manual" ? record.fees : null}
        />
        <Link
          className="back-link"
          href={`/prop-accounts/${record.tradingAccountId}/fees`}
        >
          Account fee settings
        </Link>
      </section>
      <details className="import-card">
        <summary>Processing and original source diagnostics</summary>
        <p className="small muted">
          Version {record.version} · Record {record.id}. Shared fill identifiers
          connect matched portions, not inferred event order or full fill
          quantities. Same-second events are not ordered by ID. Open portions
          may be missing even when the represented graph balances.
        </p>
        {parts.map((p) => (
          <div key={p.id}>
            <strong>{p.id}</strong>
            <p className="small muted">
              Buy fill {p.buyFillId} · Sell fill {p.sellFillId}
            </p>
            <pre className="source-json">
              {JSON.stringify(
                references.find((r) => r.sourceId === p.id)?.raw ?? {},
                null,
                2,
              )}
            </pre>
          </div>
        ))}
      </details>
    </div>
  );
}
