import { absoluteUrl, noIndex } from "@/lib/seo";
import { ResetForm } from "@/components/auth/reset-form";
import { isConfigured } from "@/lib/config";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata = { title: "Reset password", description: "Set a new password for your MSJournal account using your recovery link.", alternates: { canonical: absoluteUrl("/reset-password") }, robots: noIndex, referrer: "no-referrer" };
export default function ResetPassword() {
  return <ResetForm configured={isConfigured()} />;
}
