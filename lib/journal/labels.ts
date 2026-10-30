/** Display-only wording for persisted historical record descriptions. */
export function tradeText(value: string) {
  return value
    .replace(/closed-portion/gi, "trade")
    .replace(/matched portions/gi, (text) =>
      text[0] === "M" ? "Matched trades" : "matched exits",
    )
    .replace(/\bportions\b/gi, "exits")
    .replace(/\bportion\b/gi, "exit");
}
