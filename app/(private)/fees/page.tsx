import Link from "next/link";
import { notFound } from "next/navigation";
import { listTradingAccounts } from "@/lib/accounts/service";
import { FeeTotals } from "@/components/fees/totals";
export const metadata = { title: "Fees & net P&L" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string }>;
}) {
  const accounts = await listTradingAccounts(),
    params = await searchParams;
  const account =
    accounts.find((a) => a.id === params.accountId) ?? accounts[0];
  if (params.accountId && !accounts.some((a) => a.id === params.accountId)) notFound();
  return (
    <div className="accounts-page">
      <header className="page-header">
        <div>
          <div className="breadcrumb">Workspace / Accounts</div>
          <h1>Fees & net P&L</h1>
          <p className="muted">
            Reconcile actual trading costs without changing your imported gross
            P&L.
          </p>
        </div>
        <Link href="/trade-view">Back to Trade View</Link>
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
        <FeeTotals key={account.id} accountId={account.id} />
      ) : (
        <p>
          Create a <Link href="/prop-accounts">trading account</Link> and import
          Performance records first.
        </p>
      )}
    </div>
  );
}
