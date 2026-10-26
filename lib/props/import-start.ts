import type { Portion } from "@/lib/journal/processing";

export const IMPORT_START_ENABLED = "Automatic import start enabled";

export function earlierImportedStart(
  parts: Pick<Portion, "tradingAccountId" | "boughtAt" | "soldAt">[],
  accountId: string,
  currentStart: string,
) {
  let earliest = currentStart;
  for (const p of parts) {
    if (p.tradingAccountId !== accountId) continue;
    const entry = p.boughtAt < p.soldAt ? p.boughtAt : p.soldAt;
    if (entry < earliest) earliest = entry;
  }
  return earliest < currentStart ? earliest : null;
}

export function automaticStartIsEnabled(kinds: string[]) {
  return (
    kinds.includes(IMPORT_START_ENABLED) &&
    !kinds.some((kind) =>
      [
        "Evaluation start corrected",
        "Explicit baseline/history confirmation",
      ].includes(kind),
    )
  );
}
