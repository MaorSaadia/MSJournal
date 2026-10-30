import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { requirePageUser } from "@/lib/session";
import { importDetails } from "@/lib/imports/service";
import { NotFoundError } from "@/lib/accounts/service";
import { z } from "zod";
import { getPreferences } from "@/lib/preferences";
import { journalTimestamp } from "@/lib/timezones";
export const metadata = { title: "Import details" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    page?: string;
    file?: string;
    saved?: string;
    processing?: string;
  }>;
}) {
  await requirePageUser();
  const { id } = await params;
  const query = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();
  let details;
  try {
    details = await importDetails(id, Number(query.page ?? 1), query.file);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const { batch, accountName, files, file, rows, page } = details;
  const { displayTimezone } = await getPreferences();
  const performanceOnly = files.every((f) => f.reportType === "performance");
  const pages = Math.max(1, Math.ceil(file.total / 25));
  const href = (p: number) => `/imports/${id}?file=${file.id}&page=${p}`;
  return (
    <div className="accounts-page imports-page">
      <header className="page-header">
        <div>
          <div className="breadcrumb">Workspace / Import history</div>
          <h1>
            {batch.outcome === "Already imported"
              ? "Already imported"
              : performanceOnly
                ? "Imported performance records"
                : "Source records imported"}
            <span className="title-dot">.</span>
          </h1>
          <p className="muted">
            {accountName} · {batch.added} new records · {batch.duplicates}{" "}
            duplicates
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/imports/history">All imports</Link>
        </Button>
      </header>
      {query.saved && (
        <p role="status" className="import-success">
          {batch.outcome === "Already imported"
            ? "These source records were already saved. No source records were added."
            : performanceOnly
              ? "Performance matched-exit records saved successfully. Reported P&L is gross; missing fees remain unknown."
              : "Source records saved successfully. Orders never add a second copy of Performance P&L."}
        </p>
      )}
      {query.saved && (
        <p role="status" className="import-card">
          {query.processing === "failed"
            ? "Import saved. Journal processing failed; your source data is safe. Retry processing in Trade View."
            : "Review processing status, matched groups, and gross P&L in Trade View."}{" "}
          <Link className="back-link" href="/trade-view">
            Open Trade View
          </Link>
        </p>
      )}
      <section className="import-card">
        <h2>Batch details</h2>
        <p className="small muted">
          Tradovate · Source timezone: {batch.timezone} · Parser:{" "}
          {batch.parserVersion} · Imported:{" "}
          {journalTimestamp(batch.createdAt, displayTimezone)} · Journal display
          timezone: {displayTimezone}
        </p>
        <div className="import-file-summary">
          {files.map((f) => (
            <Link
              key={f.id}
              href={`/imports/${id}?file=${f.id}`}
              aria-current={f.id === file.id ? "page" : undefined}
            >
              <strong>
                {f.reportType} · {f.originalName}
              </strong>
              <span>
                {f.total} rows · {f.added} new · {f.duplicates} duplicates
              </span>
              <small>
                {journalTimestamp(f.start, displayTimezone)} —{" "}
                {journalTimestamp(f.end, displayTimezone)} ({displayTimezone})
              </small>
            </Link>
          ))}
        </div>
      </section>
      <section className="import-card">
        <h2>{file.originalName}</h2>
        <p className="small muted">
          Original source values, preserved with source row numbers. Performance
          P&amp;L is gross; fees are unknown.
        </p>
        <div className="import-table-scroll">
          <table className="import-table">
            <thead>
              <tr>
                <th>Source row</th>
                <th>Contract</th>
                <th>
                  {file.reportType === "orders"
                    ? "Status"
                    : "Reported gross P&L"}
                </th>
                <th>Original record</th>
                <th>Timestamp ({displayTimezone})</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.row}>
                  <td>{r.row}</td>
                  <td>{r.raw.Contract ?? r.raw.symbol}</td>
                  <td>{r.raw.Status ?? r.raw.pnl}</td>
                  <td>
                    <details>
                      <summary>View source fields</summary>
                      <dl>
                        {Object.entries(r.raw).map(([k, v]) => (
                          <div key={k}>
                            <dt>{k}</dt>
                            <dd>{v || "(blank)"}</dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                  </td>
                  <td>
                    {file.reportType === "orders" ? (
                      journalTimestamp(r.timestamp, displayTimezone)
                    ) : (
                      <>
                        <div>
                          Bought:{" "}
                          {journalTimestamp(r.boughtAt, displayTimezone)}
                        </div>
                        <div>
                          Sold: {journalTimestamp(r.soldAt, displayTimezone)}
                        </div>
                      </>
                    )}
                    <div className="small muted">
                      Original source: {r.raw.Timestamp ?? r.raw.soldTimestamp}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="import-pagination">
          {page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={href(page - 1)}>Previous</Link>
            </Button>
          ) : (
            <span />
          )}
          <span>
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Button asChild variant="outline" size="sm">
              <Link href={href(page + 1)}>Next</Link>
            </Button>
          ) : (
            <span />
          )}
        </div>
      </section>
      <Button asChild>
        <Link href="/imports">Import more reports</Link>
      </Button>
    </div>
  );
}
