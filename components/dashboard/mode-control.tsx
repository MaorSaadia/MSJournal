import Link from "next/link";
import { ShieldCheck } from "lucide-react";
export function ModeControl({
  mode,
  base = "/",
}: {
  mode: "real" | "demo";
  base?: string;
}) {
  return (
    <nav className="dashboard-mode" aria-label="Dashboard data mode">
      <Link
        href={base}
        aria-current={mode === "real" ? "page" : undefined}
        className={mode === "real" ? "selected" : ""}
      >
        <ShieldCheck size={13} />
        My Accounts
      </Link>
    </nav>
  );
}
