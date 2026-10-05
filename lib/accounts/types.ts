import type { tradingAccounts } from "@/db/schema";
type Row = typeof tradingAccounts.$inferSelect;
export type TradingAccount = Omit<
  Row,
  "ownerId" | "createdAt" | "updatedAt" | "archivedAt"
> & { createdAt: string; updatedAt: string; archivedAt: string | null };
export type Preferences = {
  displayName: string;
  email: string;
  displayTimezone: string;
  currency: "USD";
};
export function authorizedSelection(
  accounts: Pick<TradingAccount, "id" | "archivedAt">[],
  requested: string | undefined,
) {
  const available = accounts.filter((a) => !a.archivedAt).map((a) => a.id);
  return requested === undefined
    ? available
    : [...new Set(requested.split(","))].filter((id) => available.includes(id));
}
