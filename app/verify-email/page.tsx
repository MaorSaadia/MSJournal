import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { RecoveryForm } from "@/components/auth/recovery-form";
import { isConfigured, emailConfigured } from "@/lib/config";
import { userSession } from "@/lib/session";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata = { title: "Verify email", referrer: "no-referrer" };
export default async function VerifyEmail({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; error?: string; complete?: string }>;
}) {
  const query = await searchParams;
  let verified = false;
  if (query.complete && !query.error) {
    try {
      verified = !!(await userSession(await headers()));
    } catch {}
  }
  if (verified) redirect("/welcome");
  return (
    <RecoveryForm
      configured={isConfigured()}
      emailReady={emailConfigured()}
      verify
      initialEmail={query.email?.slice(0, 254) ?? ""}
      invalid={!!query.error}
    />
  );
}
