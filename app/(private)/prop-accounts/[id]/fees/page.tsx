import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getFeeSettings } from "@/lib/journal/service";
import { NotFoundError } from "@/lib/accounts/service";
import { FeeSettings } from "@/components/journal/fee-settings";
export const metadata = { title: "Account fees" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  let data;
  try {
    data = await getFeeSettings(id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  return (
    <div className="accounts-page">
      <header className="page-header">
        <div>
          <div className="breadcrumb">Workspace / Prop Accounts</div>
          <h1>
            Fee settings<span className="title-dot">.</span>
          </h1>
          <p className="muted">
            {data.account.name} · Explicit estimates, never inferred broker
            fees.
          </p>
        </div>
        <Link className="back-link" href="/prop-accounts">
          Back to accounts
        </Link>
      </header>
      <section className="import-card journal-fee-card">
        <FeeSettings
          accountId={id}
          initialRate={data.perSide}
          initialOverrides={data.contractOverrides}
        />
      </section>
    </div>
  );
}
