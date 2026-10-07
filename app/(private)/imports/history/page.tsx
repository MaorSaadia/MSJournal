import Link from "next/link";
import { Button } from "@/components/ui/button";
import { listImports } from "@/lib/imports/service";
import { requirePageUser } from "@/lib/session";
import { getPreferences } from "@/lib/preferences";
import { journalTimestamp } from "@/lib/timezones";
export const metadata = { title: "Import history" };
export default async function Page() {
  await requirePageUser();
  const history = await listImports();
  const { displayTimezone } = await getPreferences();
  return (
    <div className="accounts-page imports-page">
      <header className="page-header">
        <div>
          <div className="breadcrumb">Workspace / Tradovate</div>
          <h1>
            Import history<span className="title-dot">.</span>
          </h1>
          <p className="muted">
            Your latest 100 batches of saved source records. No journal trades
            have been reconstructed. Journal display timezone: {displayTimezone}
            .
          </p>
        </div>
        <Button asChild>
          <Link href="/imports">New import</Link>
        </Button>
      </header>
      <section className="import-card">
        {!history.length ? (
          <div className="import-empty">
            <h2>No source imports yet</h2>
            <p>
              Choose a trading account and upload an Orders or Performance
              report.
            </p>
            <Button asChild>
              <Link href="/imports">Import source records</Link>
            </Button>
          </div>
        ) : (
          <div className="import-table-scroll">
            <table className="import-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Reports / date range ({displayTimezone})</th>
                  <th>Imported at ({displayTimezone})</th>
                  <th>Outcome</th>
                  <th>New records</th>
                  <th>Duplicates</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {history.map(({ batch, accountName, files }) => (
                  <tr key={batch.id}>
                    <td>{accountName}</td>
                    <td>
                      {files.map((f) => (
                        <div key={f.id}>
                          {f.reportType} · {f.originalName}
                          <div className="muted small">
                            {journalTimestamp(f.start, displayTimezone)} —{" "}
                            {journalTimestamp(f.end, displayTimezone)}
                          </div>
                        </div>
                      ))}
                    </td>
                    <td>
                      {journalTimestamp(batch.createdAt, displayTimezone)}
                    </td>
                    <td>{batch.outcome}</td>
                    <td>{batch.added}</td>
                    <td>{batch.duplicates}</td>
                    <td>
                      <Link
                        href={`/imports/${batch.id}`}
                        className="import-link"
                      >
                        View files &amp; records
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
