import { requirePageUser } from "@/lib/session";
import { listTradingAccounts } from "@/lib/accounts/service";
import { authorizedSelection } from "@/lib/accounts/types";
import { getPreferences } from "@/lib/preferences";
import { RealDashboard } from "@/components/dashboard/real-dashboard";
import { redirect } from "next/navigation";
import { currentMonth } from "@/lib/dates";
import { getJournal } from "@/lib/journal/service";
export const metadata = { title: "Dashboard" };
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    mode?: string;
    accounts?: string;
    archived?: string;
    calMonth?: string;
    calBasis?: string;
  }>;
}) {
  await requirePageUser();
  const params = await searchParams;
  if (params.mode === "demo") {
    const [{ Dashboard }, demo, preferences] = await Promise.all([
      import("@/components/dashboard/dashboard"),
      import("@/data/demo"),
      getPreferences(),
    ]);
    return (
      <Dashboard
        accounts={demo.accounts}
        trades={demo.trades}
        cashMovements={demo.cashMovements}
        displayTimezone={preferences.displayTimezone}
      />
    );
  }
  const [accounts, preferences, data] = await Promise.all([
    listTradingAccounts(),
    getPreferences(),
    getJournal(),
  ]);
  const selectedIds = authorizedSelection(
    accounts,
    params.accounts,
    params.archived === "1",
  );
  if (
    params.accounts !== undefined &&
    params.accounts !== selectedIds.join(",")
  )
    redirect(
      `/?${new URLSearchParams({ ...params, accounts: selectedIds.join(",") })}`,
    );
  return (
    <RealDashboard
      accounts={accounts}
      selectedIds={selectedIds}
      displayTimezone={preferences.displayTimezone}
      initialMonth={currentMonth()}
      data={data}
    />
  );
}
