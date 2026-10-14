import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Sprout } from "lucide-react";
import { navigation } from "@/lib/navigation";
export function generateStaticParams() {
  return navigation
    .filter(
      (n) => !["/", "/prop-accounts", "/settings", "/reports", "/progress-tracker"].includes(n.href),
    )
    .map((n) => ({ section: n.href.slice(1) }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  return {
    title:
      navigation.find((n) => n.href === `/${section}`)?.title ??
      "Page not found",
  };
}
export default async function ComingSoon({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const item = navigation.find((n) => n.href === `/${section}`);
  if (!item) notFound();
  return (
    <div className="coming-page">
      <header className="page-header">
        <h1>{item.title}</h1>
        <span className="badge">Coming soon</span>
      </header>
      <section className="coming-card">
        <div className="coming-icon">
          <item.icon size={30} />
        </div>
        <span className="eyebrow">GROWING ONE DAY AT A TIME</span>
        <h2>{item.title} is coming soon</h2>
        <p>{item.description}</p>
        <p className="muted">
          We’re starting with the dashboard. This workspace will take shape in a
          later milestone.
        </p>
        <Link href="/" className="back-link">
          <ArrowLeft size={16} /> Back to Dashboard
        </Link>
        <Sprout className="coming-sprout" size={25} />
      </section>
    </div>
  );
}
