import { RecoveryForm } from "@/components/auth/recovery-form";
import { isConfigured, emailConfigured } from "@/lib/config";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata = { title: "Forgot password", referrer: "no-referrer" };
export default function ForgotPassword() {
  return (
    <RecoveryForm configured={isConfigured()} emailReady={emailConfigured()} />
  );
}
