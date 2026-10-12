import { requirePageUser } from "@/lib/session";
import { listTradingAccounts } from "@/lib/accounts/service";
import { ImportPage } from "@/components/imports/import-page";
import { getPreferences } from "@/lib/preferences";
import { lastSourceTimezones } from "@/lib/imports/service";
export const metadata = { title: "Import Trades" };
export default async function Page({ searchParams }: PageProps<"/imports">) {
  await requirePageUser();
  const accounts = (await listTradingAccounts(undefined, true)).filter(
    (a) => a.platform === "Tradovate" && a.status === "Active",
  );
  const requested = (await searchParams).accounts;
  const ordered =
    typeof requested === "string"
      ? accounts.some((a) => a.id === requested)
        ? [...accounts].sort(
            (a, b) => Number(b.id === requested) - Number(a.id === requested),
          )
        : []
      : accounts;
  const [preferences, lastTimezones] = await Promise.all([
    getPreferences(),
    lastSourceTimezones(),
  ]);
  return (
    <ImportPage
      accounts={ordered}
      displayTimezone={preferences.displayTimezone}
      lastTimezones={lastTimezones}
    />
  );
}
