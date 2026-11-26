import type { TradingAccount } from "@/lib/accounts/types";
import type { CashAdjustment } from "@/lib/balances/model";
import { D, type Portion, type PortionFee } from "@/lib/journal/processing";
import { importedOverview } from "@/lib/props/imported-overview";
import type { Phase, RuleVersion, Snapshot } from "@/lib/props/model";
import { trackingProgress } from "@/lib/props/tracking-calculations";
import type { Payout } from "@/lib/props/tracking-rules";

type Account = Pick<TradingAccount, "id" | "displayName" | "firm" | "stage" | "status" | "archivedAt">;
type Milestone =
  | { kind: "target"; remaining: string; estimated: boolean }
  | { kind: "payout-days"; count: number; required: number; basis: "trading" | "qualifying" }
  | { kind: "message"; text: string };
type Balance = {
  value: string;
  buffer: string | null;
  source: "journal" | "snapshot";
  asOf: string;
  estimatedFees: boolean;
  estimatedBuffer: boolean;
};

export function propAccountSummary({
  account, phase, versions = [], portions = [], fees = {}, cash = [], snapshots = [], payouts = [], now, pending = false,
}: {
  account: Account;
  phase?: Phase;
  versions?: RuleVersion[];
  portions?: Portion[];
  fees?: Record<string, PortionFee>;
  cash?: CashAdjustment[];
  snapshots?: Snapshot[];
  payouts?: Payout[];
  now: string;
  pending?: boolean;
}) {
  const imported = phase ? importedOverview(phase, versions, portions, fees, cash, payouts, now, pending) : null;
  const stop = phase?.endAt && phase.endAt < now ? phase.endAt : now;
  const snapshot = phase && snapshots
    .filter((s) => s.phaseId === phase.id && s.asOf >= phase.startAt && s.asOf <= stop)
    .reduce<Snapshot | null>((latest, s) => !latest || s.asOf > latest.asOf ? s : latest, null);
  const rules = versions.filter((v) => v.effectiveAt <= stop).at(-1)?.rules.tracking;
  const status = phase?.status ?? account.status;
  const active = !!phase && (!phase.endAt || phase.endAt > now) && status === "Active" && !account.archivedAt;
  const lastPoint = imported?.points.at(-1);
  let balance: Balance | null = null;
  if (imported?.balance != null && lastPoint) {
    balance = {
      value: imported.balance, buffer: imported.buffer, source: "journal", asOf: lastPoint.at,
      estimatedFees: imported.estimatedFees,
      estimatedBuffer: imported.limitEstimated || imported.estimatedFees,
    };
  } else if (snapshot) {
    balance = {
      value: snapshot.balance, buffer: snapshot.threshold === null ? null : new D(snapshot.balance).minus(snapshot.threshold).toFixed(),
      asOf: snapshot.asOf, source: "snapshot", estimatedFees: false, estimatedBuffer: false,
    };
  }

  let milestone: Milestone | null = null;
  if (!account.archivedAt && status === "Active" && !phase) {
    milestone = { kind: "message", text: "Finish setup" };
  } else if (phase && imported && active) {
    if (pending) milestone = { kind: "message", text: "Review imports" };
    else if (imported.missingFees) milestone = { kind: "message", text: "Review missing fees" };
    else if (!rules || imported.missingRules) milestone = { kind: "message", text: "Finish setup" };
    else if (rules.stage === "Evaluation" && imported.remainingProfit !== null) {
      milestone = { kind: "target", remaining: imported.remainingProfit, estimated: imported.estimatedFees };
    } else if (rules.stage !== "Evaluation") {
      const progress = trackingProgress(phase, versions, portions, fees, cash, snapshots, payouts, now, pending);
      const required = rules.payout.requiredDays;
      const basis = rules.payout.dayBasis === "trading" ? "trading" : "qualifying";
      const count = basis === "trading" ? progress?.tradingDays : progress?.qualifyingDays;
      milestone = rules.payout.enabled && required !== null && required > 0 && count != null && rules.session.confirmed
        ? { kind: "payout-days", count, required, basis }
        : { kind: "message", text: (rules.payout.enabled ? progress?.payout.missing[0] : null) ?? "Review payout requirements" };
    }
  }

  return {
    id: account.id,
    name: account.displayName,
    firm: account.firm,
    stage: rules?.stage ?? phase?.kind ?? account.stage,
    status,
    archived: !!account.archivedAt,
    balance,
    milestone,
  };
}

export type DashboardPropAccount = ReturnType<typeof propAccountSummary>;
