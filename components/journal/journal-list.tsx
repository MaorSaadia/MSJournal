"use client";
import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { ProcessButton } from "./actions";
import type { JournalData } from "@/lib/journal/service";
import type { TradingAccount } from "@/lib/accounts/types";
import { feeTotal, D } from "@/lib/journal/processing";
import {
  localDay,
  realizedPerformance,
  journalMoney,
} from "@/lib/journal/calculations";
import { journalTimestamp } from "@/lib/timezones";
export function JournalList({
  accounts,
  data,
  timezone,
}: {
  accounts: TradingAccount[];
  data: JournalData;
  timezone: string;
}) {
  const dates = data.portions
    .map((p) =>
      localDay(p.boughtAt > p.soldAt ? p.boughtAt : p.soldAt, timezone),
    )
    .sort();
  const [account, setAccount] = useState("all"),
    [start, setStart] = useState(dates[0] ?? ""),
    [end, setEnd] = useState(dates.at(-1) ?? ""),
    [page, setPage] = useState(1);
  const selection = realizedPerformance(
    data.portions,
    data.fees,
    {
      accounts: account === "all" ? accounts.map((a) => a.id) : [account],
      start: start || "0000-01-01",
      end: end || "9999-12-31",
    },
    timezone,
  );
  const included = new Map(selection.selected.map((p) => [p.id, p]));
  const records = data.records
    .filter((r) => r.sourceIds.some((id) => included.has(id)))
    .sort(
      (a, b) => b.exitAt.localeCompare(a.exitAt) || a.id.localeCompare(b.id),
    );
  const pages = Math.max(1, Math.ceil(records.length / 25)),
    current = Math.min(page, pages);
  return (
    <motion.div
      className="accounts-page journal-page"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <header className="page-header">
        <div>
          <div className="breadcrumb">Workspace / Journal</div>
          <h1>
            Trade View<span className="title-dot">.</span>
          </h1>
          <p className="muted">
            Matched portions and shared-fill groups. A journal record is not a
            verified complete trade.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/imports">Import Performance CSV</Link>
        </Button>
      </header>
      <details className="import-card journal-processing">
        <summary>Process existing imports / retry</summary>
        <p className="small muted">
          Process all saved Performance portions for an account, including
          overlapping and adjacent reports. Reprocessing preserves source
          records and manual fees. Orders do not contribute P&L.{" "}
          {data.unprocessed > 0
            ? `${data.unprocessed} source portions await processing.`
            : ""}
        </p>
        {accounts.map((a) => (
          <div className="journal-process-row" key={a.id}>
            <div>
              <strong>{a.displayName}</strong>
              <span className="small muted">
                {data.states.find((s) => s.accountId === a.id)?.status ??
                  "Not processed"}
                {a.archivedAt ? " · Archived" : ""}
              </span>
            </div>
            <ProcessButton accountId={a.id} />
          </div>
        ))}
        {!accounts.length && (
          <Link className="back-link" href="/prop-accounts">
            Add your first account
          </Link>
        )}
      </details>
      {(data.unprocessed > 0 ||
        data.states.some((s) => s.status === "Failed")) && (
        <p role="status" className="import-card">
          Processing is incomplete. Published results below may exclude newly
          imported portions; open “Process existing imports / retry.” Your
          imported sources are retained.
        </p>
      )}
      <section className="import-card">
        <div className="journal-filters">
          <label className="field-label">
            Account
            <select
              value={account}
              onChange={(e) => {
                setAccount(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All my accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.displayName}
                  {a.archivedAt ? " (archived)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Realized from
            <input
              type="date"
              value={start}
              max={end || undefined}
              onChange={(e) => {
                setStart(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="field-label">
            Realized through
            <input
              type="date"
              value={end}
              min={start || undefined}
              onChange={(e) => {
                setEnd(e.target.value);
                setPage(1);
              }}
            />
          </label>
        </div>
        <p className="small muted">
          Exit-date boundaries in {timezone}. Groups appear if any portion
          realizes P&L in this range; amounts below include only those portions.
          Final exit determines row order. Earlier partial exits stay on their
          own realized dates.
        </p>
        <div className="journal-totals">
          <strong>Gross P&L: {journalMoney(selection.gross, true)}</strong>
          <span>
            {selection.selected.length} matched portions · {records.length}{" "}
            journal records
          </span>
          <span>
            {selection.net === null
              ? `Net unavailable · fees known for ${selection.feeCoverage}/${selection.selected.length} portions`
              : `${selection.estimated ? "Estimated net" : "Net with entered fees"}: ${journalMoney(selection.net, true)}`}
          </span>
        </div>
      </section>
      <div className="import-table-scroll">
        <table className="import-table journal-table">
          <caption className="sr-only">
            Private journal records. Selected portion results in USD. Times in{" "}
            {timezone}.
          </caption>
          <thead>
            <tr>
              {[
                "Account / contract",
                "Direction / status",
                "Entry / final exit",
                "Closed quantity",
                "Selected gross P&L",
                "Fees / net",
                "Details",
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.slice((current - 1) * 25, current * 25).map((r) => {
              const parts = r.sourceIds
                  .map((id) => included.get(id))
                  .filter((p) => !!p),
                gross = parts.reduce((n, p) => n.plus(p.grossPnl), new D(0)),
                fee = feeTotal(parts.map((p) => data.fees[p.id]));
              return (
                <tr key={r.id}>
                  <td>
                    <strong>
                      {
                        accounts.find((a) => a.id === r.tradingAccountId)
                          ?.displayName
                      }
                    </strong>
                    <small>{r.symbol}</small>
                  </td>
                  <td>
                    {r.direction === "unknown"
                      ? "Unknown"
                      : r.direction === "long"
                        ? "Long"
                        : "Short"}
                    <small>{r.status}</small>
                  </td>
                  <td>
                    {journalTimestamp(r.entryAt, timezone)}
                    <small>{journalTimestamp(r.exitAt, timezone)}</small>
                  </td>
                  <td>
                    {parts
                      .reduce((n, p) => n.plus(p.quantity), new D(0))
                      .toFixed()}
                    <small>
                      {parts.length}/{r.sourceIds.length} portions · max size
                      unknown
                    </small>
                  </td>
                  <td
                    className={
                      gross.lt(0) ? "negative" : gross.gt(0) ? "positive" : ""
                    }
                  >
                    {journalMoney(gross.toFixed(), true)}
                  </td>
                  <td>
                    {fee.amount === null
                      ? "Fees unknown"
                      : `${journalMoney(fee.amount)} · ${fee.kind}`}
                    <small>
                      {fee.amount === null
                        ? "Net unavailable"
                        : `${fee.kind === "Estimated" || fee.kind === "Mixed" ? "Estimated net" : "Net"}: ${journalMoney(gross.minus(fee.amount).toFixed(), true)}`}
                    </small>
                  </td>
                  <td>
                    <Link className="back-link" href={`/trade-view/${r.id}`}>
                      Inspect
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!records.length && (
        <div className="import-card">
          <h2>
            {data.sourceCount
              ? "No journal records in this selection"
              : "No Performance records imported yet"}
          </h2>
          <p className="muted">
            {data.unprocessed
              ? "Process your existing imports above."
              : "Import Performance.csv or change your account/date filters. Demo data stays separate."}
          </p>
        </div>
      )}
      <nav className="import-pagination" aria-label="Journal pagination">
        <Button
          variant="outline"
          disabled={current <= 1}
          onClick={() => setPage(current - 1)}
        >
          Previous
        </Button>
        <span>
          Page {current} of {pages} · 25 records per page
        </span>
        <Button
          variant="outline"
          disabled={current >= pages}
          onClick={() => setPage(current + 1)}
        >
          Next
        </Button>
      </nav>
    </motion.div>
  );
}
