"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { Layers3, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { requestJson } from "@/lib/client-api";
import type { BillingStatus } from "@/lib/billing/status";
import type { Entitlement } from "@/lib/billing/policy";
const Context = createContext<Entitlement | null>(null);
export function BillingAccess({
  initial,
  userId,
  children,
}: {
  initial: Entitlement;
  userId: string;
  children: ReactNode;
}) {
  const [entitlement, setEntitlement] = useState(initial),
    [open, setOpen] = useState(false);
  const busy = useRef(false);
  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const data = await requestJson<BillingStatus>("/api/billing");
      if (data.userId !== userId) return;
      setEntitlement(data);
      if (data.plan === "Pro") setOpen(false);
    } catch {
      /* actions still have authoritative server checks */
    } finally {
      busy.current = false;
    }
  }, [userId]);
  useEffect(() => {
    const upgrade = () => setOpen(true),
      changed = (event: Event) => {
        if (
          (event as CustomEvent<{ url?: string }>).detail?.url?.startsWith(
            "/api/billing",
          ) ||
          (event as CustomEvent<{ url?: string }>).detail?.url?.startsWith(
            "/api/trading-accounts",
          ) ||
          (event as CustomEvent<{ url?: string }>).detail?.url?.startsWith(
            "/api/prop-progress/setup",
          )
        )
          void refresh();
      };
    window.addEventListener("msjournal:upgrade-needed", upgrade);
    window.addEventListener("msjournal:data-updated", changed);
    window.addEventListener("focus", refresh);
    const timer = setInterval(() => void refresh(), 120000);
    const initialRefresh = setTimeout(() => void refresh(), 0);
    return () => {
      clearTimeout(initialRefresh);
      clearInterval(timer);
      window.removeEventListener("msjournal:upgrade-needed", upgrade);
      window.removeEventListener("msjournal:data-updated", changed);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);
  return (
    <Context.Provider value={entitlement}>
      {entitlement.plan === "Free" && entitlement.usage > 1 && (
        <aside className="billing-access-note">
          <ShieldCheck size={18} aria-hidden="true" />
          <div>
            <strong>
              {entitlement.needsSelection
                ? "Choose your Free account"
                : "Your other accounts are kept for you"}
            </strong>
            <p>
              {entitlement.needsSelection
                ? "Choose one account for Free use or upgrade to Pro. Your accounts and history remain available to read and export."
                : "Your selected Free account is ready to use. Other accounts remain available to read and export; Pro restores imports and editing across them."}
            </p>
          </div>
          <Link href="/settings/billing">Manage plan</Link>
        </aside>
      )}
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="billing-upgrade-dialog">
          <div className="billing-upgrade-icon">
            <Layers3 size={26} />
          </div>
          <p className="eyebrow">A LITTLE MORE ROOM</p>
          <DialogTitle>Keep your accounts together.</DialogTitle>
          <DialogDescription>
            Track multiple accounts and prop firms with MSJournal Pro.
          </DialogDescription>
          <p className="small muted">
            Free includes one trading account from one prop firm. Archived
            accounts count toward that allowance. Your entered details stay here
            while you review Pro in another tab.
          </p>
          <div className="billing-upgrade-actions">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Not now
            </Button>
            <Button asChild>
              <Link
                href="/settings/billing"
                target="_blank"
                rel="noopener noreferrer"
              >
                Upgrade<span className="sr-only"> (opens in a new tab)</span>
              </Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Context.Provider>
  );
}
export function AccountUsage() {
  const entitlement = useContext(Context);
  if (!entitlement) return null;
  return (
    <Link href="/settings/billing" className="billing-usage">
      <Layers3 size={14} aria-hidden="true" />
      {entitlement.plan === "Pro"
        ? "Pro · Multiple accounts"
        : entitlement.usage > 1
          ? `${entitlement.usage} accounts retained · Free plan`
          : `${entitlement.usage} of 1 account used`}
    </Link>
  );
}
export function AccountAccessLabel({ accountId }: { accountId: string }) {
  const entitlement = useContext(Context);
  const account = entitlement?.accounts.find((a) => a.id === accountId);
  return account && !account.writable ? (
    <span
      className="billing-readonly"
      title="Read and export access is preserved. Upgrade to resume importing and editing this account."
    >
      Read only
    </span>
  ) : null;
}
