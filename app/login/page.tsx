import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { isConfigured } from "@/lib/config";
import { userSession } from "@/lib/session";
import { safeRedirect } from "@/lib/auth-policy";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata = { title: "Sign in" };
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const destination = safeRedirect((await searchParams).next);
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
    />
  );
}
