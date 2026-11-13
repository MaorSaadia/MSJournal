import { BillingAccess } from "@/components/billing/access";
import { getEntitlement } from "@/lib/billing/entitlements";
import { userSession } from "@/lib/session";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { CalendarCacheProvider } from "@/components/calendar/cache-provider";
import { getPreferences } from "@/lib/preferences";
import { Landing } from "@/components/marketing/landing";
export async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const requestHeaders = await headers();
  const session = await userSession(requestHeaders);
  if (!session) {
    // Render outside the private page's loading boundary. Otherwise browsers
    // without JavaScript remain on its streamed Dashboard fallback.
    if (requestHeaders.get("x-msjournal-pathname") === "/") return <Landing />;
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
      <Shell displayName={owner.name}><BillingAccess initial={await getEntitlement(owner.id)} userId={owner.id}>{children}</BillingAccess></Shell>
    </CalendarCacheProvider>
  );
}
