import { userSession } from "@/lib/session";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { CalendarCacheProvider } from "@/components/calendar/cache-provider";
import { getPreferences } from "@/lib/preferences";
export async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const requestHeaders = await headers();
  const session = await userSession(requestHeaders);
  if (!session) {
    if (requestHeaders.get("x-msjournal-pathname") === "/") return children;
    redirect("/login");
  }
  const owner = session.user;
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
