import { requirePageUser } from "@/lib/session";
import { getPreferences } from "@/lib/preferences";
import { todayIn, daySchema } from "@/lib/calendar/model";
import { getDaily } from "@/lib/daily/service";
import { listTradingAccounts } from "@/lib/accounts/service";
import { DayWorkspace } from "@/components/daily/day-workspace";
export const metadata = { title: "Day View" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageUser();
  const pref = await getPreferences(),
    params = await searchParams;
  const date =
    typeof params.date === "string"
      ? daySchema.parse(params.date)
      : todayIn(pref.displayTimezone);
  const [initial, accounts] = await Promise.all([
    getDaily(date),
    listTradingAccounts(undefined, true),
  ]);
  return (
    <DayWorkspace
      key={date}
      initial={initial}
      accounts={accounts.map((a) => ({
        id: a.id,
        name: a.displayName,
        archived: !!a.archivedAt,
      }))}
    />
  );
}
