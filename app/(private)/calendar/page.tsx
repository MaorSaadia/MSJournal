import { requirePageUser } from "@/lib/session";
import { getPreferences } from "@/lib/preferences";
import { listTradingAccounts } from "@/lib/accounts/service";
import { TradingCalendar } from "@/components/calendar/trading-calendar";
import { ModeControl } from "@/components/dashboard/mode-control";
import { accounts as demoAccounts } from "@/data/demo";
import { todayIn } from "@/lib/calendar/model";
export const metadata = { title: "Calendar" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  await requirePageUser();
  const [prefs, owned, params] = await Promise.all([
    getPreferences(),
    listTradingAccounts(),
    searchParams,
  ]);
  const mode = params.mode === "demo" ? "demo" : "real";
  const accounts =
    mode === "demo"
      ? demoAccounts.map((a) => ({ id: a.id, name: a.name, archived: false }))
      : owned.map((a) => ({
          id: a.id,
          name: a.displayName,
          archived: !!a.archivedAt,
        }));
  return (
    <div className="calendar-page">
      <header className="page-header">
        <div>
          <div className="breadcrumb">Workspace / The daily picture</div>
          <h1>
            Calendar<span className="title-dot">.</span>
          </h1>
          <p className="page-description">
            Realized results, one day at a time.
          </p>
        </div>
        <ModeControl mode={mode} base="/calendar" />
      </header>
      {mode === "demo" && (
        <p className="demo-indicator">
          Demo data · Fictional closed trades · January–March 2026
        </p>
      )}
      <TradingCalendar
        key={mode}
        accounts={accounts}
        mode={mode}
        timezone={prefs.displayTimezone}
        initialMonth={
          mode === "demo"
            ? "2026-03"
            : todayIn(prefs.displayTimezone).slice(0, 7)
        }
      />
    </div>
  );
}
