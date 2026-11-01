import { absoluteUrl, noIndex } from "@/lib/seo";
import { RecoveryForm } from "@/components/auth/recovery-form";
import { isConfigured, emailConfigured } from "@/lib/config";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata = { title: "Forgot password", description: "Request a secure password recovery link for your MSJournal account.", alternates: { canonical: absoluteUrl("/forgot-password") }, robots: noIndex, referrer: "no-referrer" };
export default function ForgotPassword() {
  return (
    <RecoveryForm configured={isConfigured()} emailReady={emailConfigured()} />
  );
}
