import { getJournal } from "@/lib/journal/service";
import { listTradingAccounts } from "@/lib/accounts/service";
import { getPreferences } from "@/lib/preferences";
import { JournalList } from "@/components/journal/journal-list";
export const metadata = { title: "Trade View" };
export default async function Page() {
  const [data, accounts, preferences] = await Promise.all([
    getJournal(),
    listTradingAccounts(),
    getPreferences(),
  ]);
  return (
    <JournalList
      data={data}
      accounts={accounts}
      timezone={preferences.displayTimezone}
    />
  );
}
