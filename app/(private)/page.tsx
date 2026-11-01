import { cache, Suspense } from "react";
import { headers } from "next/headers";
import { userSession } from "@/lib/session";
import type Home from "@/components/dashboard/home";
import { Landing } from "@/components/marketing/landing";
import { LoadingState } from "@/components/ui/loading";
import { noIndex, publicMetadata } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const session = cache(async () => userSession(await headers()));
export async function generateMetadata() {
  return await session()
    ? { title: "Dashboard", robots: noIndex }
    : publicMetadata;
}

export default async function Page(props: Parameters<typeof Home>[0]) {
  if (!await session()) return <Landing />;
  const { default: DashboardHome } = await import("@/components/dashboard/home");
  return <Suspense fallback={<LoadingState variant="dashboard" label="Loading dashboard" />}><DashboardHome {...props} /></Suspense>;
}
