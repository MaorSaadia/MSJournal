import { absoluteUrl, noIndex } from "@/lib/seo";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignupForm } from "@/components/auth/signup-form";
import { isConfigured, readConfig } from "@/lib/config";
import { userSession } from "@/lib/session";
import { safeRedirect } from "@/lib/auth-policy";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata = { title: "Create account", description: "Create your MSJournal account to import trades and start your private trading journal.", alternates: { canonical: absoluteUrl("/signup") }, robots: noIndex, referrer: "no-referrer" };
export default async function Signup({searchParams}:{searchParams:Promise<{next?:string}>}) {
  const query=await searchParams;
  const destination=query.next ? safeRedirect(query.next):"/welcome";
  let signedIn = false;
  try {
    signedIn = !!(await userSession(await headers()));
  } catch {}
  if (signedIn) redirect(destination);
  const configured = isConfigured();
  return (
    <SignupForm
      destination={destination}
      configured={configured}
      verificationRequired={
        configured && readConfig().AUTH_REQUIRE_EMAIL_VERIFICATION === "true"
      }
    />
  );
}
