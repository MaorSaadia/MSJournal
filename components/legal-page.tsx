import type { ReactNode } from "react";
import Link from "next/link";
import { BrandLink } from "@/components/brand-link";
import { ThemeControl } from "@/components/shell";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="login-page">
      <header className="login-header">
        <div className="login-header-inner">
          <BrandLink />
          <ThemeControl />
        </div>
      </header>
      <main className="legal-page">
        <h1>{title}</h1>
        {children}
      </main>
      <footer className="login-footer">
        <Link href="/terms">Terms of Use</Link>
        <Link href="/privacy">Privacy Policy</Link>
        <Link href="/contact">Contact us</Link>
      </footer>
    </div>
  );
}
