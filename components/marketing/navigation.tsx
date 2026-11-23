"use client";
import { useRef } from "react";
import Link from "next/link";
import { Menu, ArrowUpRight } from "lucide-react";
import { ThemeControl } from "@/components/shell";

export function MarketingNavigation() {
  const menu = useRef<HTMLDetailsElement>(null);
  const links = <>
    <a href="#features">Features</a>
    <a href="#get-started">How it works</a>
    <a href="#pricing">Pricing</a>
    <Link href="/books">Trading Books</Link>
    <Link href="/book">Book Companion</Link>
  </>;
  return (
    <div className="marketing-navigation">
      <nav className="marketing-desktop-nav" aria-label="Main navigation">{links}</nav>
      <div className="marketing-nav-actions">
        <ThemeControl />
        <Link className="marketing-signin" href="/login">Sign in</Link>
        <Link className="marketing-button compact" href="/signup">
          Create account <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
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
          <Link href="/login">Sign in</Link>
        </nav>
      </details>
    </div>
  );
}
