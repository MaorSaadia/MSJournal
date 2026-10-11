export type Direction = "long" | "short";
export type Account = {
  id: string;
  name: string;
  firm: string;
  stage: "Evaluation" | "Funded";
  startingBalanceCents: number;
  openedOn: string;
};
export type Trade = {
  id: string;
  accountId: string;
  symbol: "ES" | "NQ" | "MES" | "MNQ";
  direction: Direction;
  entryAt: string;
  closeAt: string;
  grossCents: number;
  commissionCents: number;
  feesCents: number;
};
export type CashMovement = {
  accountId: string;
  date: string;
  amountCents: number;
  description: string;
};
export type Filters = {
  accounts: string[];
  start: string;
  end: string;
  symbol: string;
  direction: "all" | Direction | "unknown";
};
export type DailyResult = {
  date: string;
  netCents: number;
  trades: Trade[];
  wins: number;
  losses: number;
  breakeven: number;
};
