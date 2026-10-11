import { requirePageUser } from "@/lib/session";
import { listTradingAccounts } from "@/lib/accounts/service";
import { authorizedSelection } from "@/lib/accounts/types";
import { getPreferences } from "@/lib/preferences";
import { RealDashboard } from "@/components/dashboard/real-dashboard";
import { redirect } from "next/navigation";
import { todayIn, monthEnd, shiftDay } from "@/lib/calendar/model";
import { localDay } from "@/lib/journal/calculations";
import { portionExit } from "@/lib/journal/processing";
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
  const initialMonth = todayIn(preferences.displayTimezone).slice(0, 7);
  const available = data.portions
    .filter((p) => selectedIds.includes(p.tradingAccountId))
    .map((p) => localDay(portionExit(p), preferences.displayTimezone))
    .sort();
  return (
    <RealDashboard
      accounts={accounts.map(
        ({ id, displayName, firm, stage, archivedAt }) => ({
          id,
          displayName,
          firm,
          stage,
          archivedAt,
        }),
      )}
      displayTimezone={preferences.displayTimezone}
      initialMonth={initialMonth}
      initialRange={{
        start: available[0]
          ? available[0] < shiftDay(available.at(-1)!, -3660)
            ? shiftDay(available.at(-1)!, -3660)
            : available[0]
          : initialMonth + "-01",
        end: available.at(-1) ?? monthEnd(initialMonth),
      }}
      initialSymbols={[...new Set(data.portions.map((p) => p.symbol))].sort()}
    />
  );
}
