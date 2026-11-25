"use client";
import { useRef } from "react";
import { PublicPageLink } from "@/components/public-page-link";
import { Menu, ArrowUpRight } from "lucide-react";
import { ThemeControl } from "@/components/shell";

export function MarketingNavigation() {
  const menu = useRef<HTMLDetailsElement>(null);
  const links = <>
    <a href="#features">Features</a>
    <a href="#get-started">How it works</a>
    <a href="#pricing">Pricing</a>
    <PublicPageLink href="/books">Trading Books</PublicPageLink>
    <PublicPageLink href="/book">Book Companion</PublicPageLink>
  </>;
  return (
    <div className="marketing-navigation">
      <nav className="marketing-desktop-nav" aria-label="Main navigation">{links}</nav>
      <div className="marketing-nav-actions">
        <ThemeControl />
        <PublicPageLink className="marketing-signin" href="/login">Sign in</PublicPageLink>
        <PublicPageLink className="marketing-button compact" href="/signup">
          Create account <ArrowUpRight size={15} aria-hidden="true" />
        </PublicPageLink>
      </div>
      <details ref={menu} className="marketing-mobile-menu" onKeyDown={(event) => {
        if (event.key === "Escape" && menu.current) {
          menu.current.open = false;
          menu.current.querySelector("summary")?.focus();
        }
      }}>
        <summary aria-label="Open navigation"><Menu size={21} aria-hidden="true" /></summary>
        <nav aria-label="Mobile navigation" onClick={(event) => {
          if ((event.target as HTMLElement).closest("a") && menu.current) menu.current.open = false;
        }}>
          {links}
          <PublicPageLink href="/login">Sign in</PublicPageLink>
        </nav>
      </details>
    </div>
  );
}
