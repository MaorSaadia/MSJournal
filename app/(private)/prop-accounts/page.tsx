import { AccountsPage } from "@/components/accounts/accounts-page";
import { listTradingAccounts } from "@/lib/accounts/service";
import { requirePageUser } from "@/lib/session";
export const metadata = { title: "Prop Accounts" };
export default async function Page() {
  await requirePageUser();
  return <AccountsPage initialAccounts={await listTradingAccounts()} />;
}
