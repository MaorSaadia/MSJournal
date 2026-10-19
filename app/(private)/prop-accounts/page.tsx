import { AccountsPage } from "@/components/accounts/accounts-page";
import { listTradingAccounts } from "@/lib/accounts/service";
import { listPropFirms } from "@/lib/props/firms";
import { requirePageUser } from "@/lib/session";
export const metadata = { title: "Prop Accounts" };
export default async function Page() {
  await requirePageUser();
  const [accounts, firms] = await Promise.all([
    listTradingAccounts(),
    listPropFirms(),
  ]);
  return <AccountsPage initialAccounts={accounts} initialFirms={firms} />;
}
