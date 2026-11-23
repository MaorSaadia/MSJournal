import { absoluteUrl, noIndex } from "@/lib/seo";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { googleOAuthConfig, isConfigured } from "@/lib/config";
import { userSession } from "@/lib/session";
import { safeRedirect } from "@/lib/auth-policy";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata = { title: "Sign in", description: "Sign in to your private MSJournal futures trading workspace.", alternates: { canonical: absoluteUrl("/login") }, robots: noIndex, referrer: "no-referrer" };
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; google?: string }>;
}) {
  const query = await searchParams;
  const destination = safeRedirect(query.next);
  let signedIn = false,
    unavailable = false;
  try {
    signedIn = !!(await userSession(await headers()));
  } catch {
    unavailable = true;
  }
  if (signedIn) redirect(destination);
  return (
    <LoginForm
      configured={isConfigured()}
      destination={destination}
      unavailable={unavailable}
      googleEnabled={!unavailable && !!googleOAuthConfig()}
      googleError={query.google === "error"}
    />
  );
}
