import Link from "next/link";
import { notFound } from "next/navigation";
import { listTradingAccounts } from "@/lib/accounts/service";
import { getFeeSettings } from "@/lib/journal/service";
import { FeeSettings } from "@/components/journal/fee-settings";
import { FeeTotals } from "@/components/fees/totals";
export const metadata = { title: "Fees & net P&L" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string; accounts?: string }>;
}) {
  const accounts = await listTradingAccounts(),
    params = await searchParams;
  const selectedId = params.accountId ?? params.accounts;
  if (selectedId && !accounts.some((a) => a.id === selectedId)) notFound();
  const account = accounts.find((a) => a.id === selectedId) ?? accounts[0];
  const settings = account ? await getFeeSettings(account.id) : null;
  return (
    <div className="fees-workspace">
      <header className="page-header">
        <div>
          <div className="breadcrumb">Workspace / Account fees</div>
          <h1>Fees & net P&L</h1>
          <p className="muted">
            Record broker fees and manage optional estimates in one place.
          </p>
        </div>
        <div className="fee-page-actions">
          {account && (
            <Link href={`/prop-accounts/${account.id}`}>Back to account</Link>
          )}
          <Link href="/trade-view">Trade View</Link>
        </div>
      </header>
      <nav className="fee-account-links" aria-label="Fees account">
        {accounts.map((a) => (
          <Link
            key={a.id}
            aria-current={a.id === account?.id ? "page" : undefined}
            href={`/fees?accountId=${a.id}`}
          >
            {a.displayName}
            {a.archivedAt ? " (archived)" : ""}
          </Link>
        ))}
      </nav>
      {account ? (
        <div className="fee-sections" key={account.id}>
          <FeeTotals accountId={account.id} />
          {settings && (
            <details className="fee-estimates" id="estimates">
              <summary>
                <span>
                  Automatic fee estimates <small>Optional</small>
                </span>
                <span className="muted">
                  For future imports or records with missing fees
                </span>
              </summary>
              <div className="fee-estimate-body">
                <p className="muted">
                  Use this when you know your per-contract rate. Estimates stay
                  labeled as estimates; saved broker totals and manual fees are
                  preserved.
                </p>
                <FeeSettings
                  accountId={account.id}
                  initialRate={settings.perSide}
                  initialOverrides={settings.contractOverrides}
                />
              </div>
            </details>
          )}
        </div>
      ) : (
        <p>
          Create a <Link href="/prop-accounts">trading account</Link> and import
          Performance records first.
        </p>
      )}
    </div>
  );
}
