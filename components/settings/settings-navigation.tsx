import Link from "next/link";
import { CreditCard, KeyRound, SlidersHorizontal } from "lucide-react";

export function SettingsNavigation({ active }: { active: "general" | "billing" }) {
  return (
    <nav className="settings-navigation" aria-label="Settings sections">
      <Link href="/settings" aria-current={active === "general" ? "page" : undefined}>
        <SlidersHorizontal size={15} aria-hidden="true" />General
      </Link>
      <Link href="/settings/billing" aria-current={active === "billing" ? "page" : undefined}>
        <CreditCard size={15} aria-hidden="true" />Plan &amp; billing
      </Link>
      <Link href="/settings#password" className="settings-security-link">
        <KeyRound size={14} aria-hidden="true" />Password &amp; security
      </Link>
    </nav>
  );
}
