import { ResetForm } from "@/components/auth/reset-form";
import { isConfigured } from "@/lib/config";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata = { title: "Reset password", referrer: "no-referrer" };
export default function ResetPassword() {
  return <ResetForm configured={isConfigured()} />;
}
