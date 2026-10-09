import { requirePageUser } from "@/lib/session";
import { Shell } from "@/components/shell";
import { CalendarCacheProvider } from "@/components/calendar/cache-provider";
import { getPreferences } from "@/lib/preferences";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default async function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const owner = await requirePageUser();
  const preferences = await getPreferences();
  return (
    <CalendarCacheProvider
      key={owner.id}
      userId={owner.id}
      timezone={preferences.displayTimezone}
      weekStartsOn={preferences.weekStartsOn}
    >
      <Shell displayName={owner.name}>{children}</Shell>
    </CalendarCacheProvider>
  );
}
