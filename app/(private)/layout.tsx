import { requirePageOwner } from "@/lib/session";
import { Shell } from "@/components/shell";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default async function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const owner = await requirePageOwner();
  return <Shell displayName={owner.name}>{children}</Shell>;
}
