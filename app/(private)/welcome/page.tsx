import Link from "next/link";
import { requirePageUser } from "@/lib/session";
import { listTradingAccounts } from "@/lib/accounts/service";
import { redirect } from "next/navigation";
export const metadata = { title: "Welcome" };
export default async function Welcome() {
  const user = await requirePageUser();
  if ((await listTradingAccounts()).length) redirect("/");
  return (
    <div className="accounts-page">
      <header className="page-header">
        <h1>
          Welcome, {user.name}
          <span className="title-dot">.</span>
        </h1>
      </header>
      <section className="accounts-empty panel">
        <h2>Add your first trading account</h2>
        <p>
          Your journal starts empty. Add your evaluation, funded, or personal
          accounts to make it yours.
        </p>
        <Link className="back-link" href="/prop-accounts">
          Add Account
        </Link>
        <p>
          <Link href="/?mode=demo">Explore the fictional demo</Link>
        </p>
      </section>
    </div>
  );
}
