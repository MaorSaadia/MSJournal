import { AccountsPage } from "@/components/accounts/accounts-page";
import { listTradingAccounts } from "@/lib/accounts/service";
import { requirePageOwner } from "@/lib/session";
export const metadata = { title: "Prop Accounts" };
export default async function Page() {
  await requirePageOwner();
  return <AccountsPage initialAccounts={await listTradingAccounts()} />;
}
