import { requirePageUser } from "@/lib/session";
import { listTradingAccounts } from "@/lib/accounts/service";
import { ImportPage } from "@/components/imports/import-page";
import { getPreferences } from "@/lib/preferences";
import { lastSourceTimezones } from "@/lib/imports/service";
export const metadata = { title: "Import Trades" };
export default async function Page() {
  await requirePageUser();
  const accounts = (await listTradingAccounts(undefined, true)).filter(
    (a) => a.platform === "Tradovate" && a.status === "Active",
  );
  const [preferences, lastTimezones] = await Promise.all([
    getPreferences(),
    lastSourceTimezones(),
  ]);
  return (
    <ImportPage
      accounts={accounts}
      displayTimezone={preferences.displayTimezone}
      lastTimezones={lastTimezones}
    />
  );
}
