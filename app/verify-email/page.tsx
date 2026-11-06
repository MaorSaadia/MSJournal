import { absoluteUrl, noIndex } from "@/lib/seo";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { RecoveryForm } from "@/components/auth/recovery-form";
import { isConfigured, emailConfigured } from "@/lib/config";
import { userSession } from "@/lib/session";
import { safeRedirect } from "@/lib/auth-policy";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata = { title: "Verify email", description: "Confirm your email address to access your MSJournal workspace.", alternates: { canonical: absoluteUrl("/verify-email") }, robots: noIndex, referrer: "no-referrer" };
export default async function VerifyEmail({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; error?: string; complete?: string; next?:string }>;
}) {
  const query = await searchParams;
  const destination=query.next ? safeRedirect(query.next):"/welcome";
  let verified = false;
  if (query.complete && !query.error) {
    try {
      verified = !!(await userSession(await headers()));
    } catch {}
  }
  if (verified) redirect(destination);
  return (
    <RecoveryForm
      configured={isConfigured()}
      emailReady={emailConfigured()}
      verify
      destination={destination}
      initialEmail={query.email?.slice(0, 254) ?? ""}
      invalid={!!query.error}
    />
  );
}
