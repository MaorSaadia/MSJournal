import Link from "next/link";
import { FlaskConical, ShieldCheck } from "lucide-react";
export function ModeControl({ mode }: { mode: "real" | "demo" }) {
  return (
    <nav className="dashboard-mode" aria-label="Dashboard data mode">
      <Link
        href="/"
        aria-current={mode === "real" ? "page" : undefined}
        className={mode === "real" ? "selected" : ""}
      >
        <ShieldCheck size={13} />
        My Accounts
      </Link>
      <Link
        href="/?mode=demo"
        aria-current={mode === "demo" ? "page" : undefined}
        className={mode === "demo" ? "selected" : ""}
      >
        <FlaskConical size={13} />
        Demo
      </Link>
    </nav>
  );
}
