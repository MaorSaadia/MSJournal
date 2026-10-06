import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignupForm } from "@/components/auth/signup-form";
import { isConfigured, readConfig } from "@/lib/config";
import { userSession } from "@/lib/session";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata = { title: "Create account" };
export default async function Signup() {
  let signedIn = false;
  try {
    signedIn = !!(await userSession(await headers()));
  } catch {}
  if (signedIn) redirect("/");
  const configured = isConfigured();
  return (
    <SignupForm
      configured={configured}
      verificationRequired={
        configured && readConfig().AUTH_REQUIRE_EMAIL_VERIFICATION === "true"
      }
    />
  );
}
