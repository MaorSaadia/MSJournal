import { PublicWebAnalytics } from "@/components/public-web-analytics";
import { indexableDeployment } from "@/lib/seo";
import type { ReactNode } from "react";
import { PublicPageLink } from "@/components/public-page-link";
import { BrandLink } from "@/components/brand-link";
import { ThemeControl } from "@/components/shell";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="login-page">
      <PublicWebAnalytics enabled={indexableDeployment} />
      <header className="login-header">
        <div className="login-header-inner">
          <BrandLink documentNavigation />
          <ThemeControl />
        </div>
      </header>
      <main className="legal-page">
        <h1>{title}</h1>
        {children}
      </main>
      <footer className="login-footer">
        <PublicPageLink href="/terms">Terms of Use</PublicPageLink>
        <PublicPageLink href="/privacy">Privacy Policy</PublicPageLink>
        <PublicPageLink href="/contact">Contact us</PublicPageLink>
      </footer>
    </div>
  );
}
