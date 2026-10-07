import { requirePageUser } from "@/lib/session";
import { listTradingAccounts } from "@/lib/accounts/service";
import { ImportPage } from "@/components/imports/import-page";
export const metadata = { title: "Import Trades" };
export default async function Page() {
  await requirePageUser();
  const accounts = (await listTradingAccounts(undefined, true)).filter(
    (a) => a.platform === "Tradovate" && a.status === "Active",
  );
  return <ImportPage accounts={accounts} />;
}
