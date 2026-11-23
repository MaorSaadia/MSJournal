"use client";
import { useId, type ReactNode } from "react";
import { LockKeyhole } from "lucide-react";
import { ThemeControl } from "@/components/shell";
import { BrandLink } from "@/components/brand-link";
import Link from "next/link";

export function AuthFrame({
  title,
  description,
  configured = true,
  centered = false,
  children,
}: {
  title: string;
  description: string;
  configured?: boolean;
  centered?: boolean;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <div className={`login-page${centered ? " login-page-centered" : ""}`}>
      <header className="login-header">
        <div className="login-header-inner">
          <BrandLink />
          <ThemeControl />
        </div>
      </header>
      <main className="login-layout">
        <section className="login-card" aria-labelledby={titleId}>
          <div className="dialog-symbol">
            <LockKeyhole size={23} aria-hidden="true" />
          </div>
          <h1 id={titleId}>
            {title}
            <span className="title-dot">.</span>
          </h1>
          <p className="muted">{description}</p>
          {!configured && (
            <div className="setup-notice" role="status">
              <strong>Authentication needs local setup</strong>
              <p>
                Configure the database and authentication environment variables,
                then apply the reviewed migration. See README.md.
              </p>
            </div>
          )}
          {children}
        </section>
      </main>
      <footer className="login-footer">
        <Link href="/contact?topic=access">Need help accessing your account?</Link>
        <Link href="/terms">Terms of Use</Link>
        <Link href="/privacy">Privacy Policy</Link>
      </footer>
    </div>
  );
}
