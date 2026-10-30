import { exitBreakdown } from "@/lib/journal/exits";
import { D, type Portion, type PortionFee } from "@/lib/journal/processing";
import { journalMoney } from "@/lib/journal/calculations";
import { journalTimestamp } from "@/lib/timezones";

export function TradeExits({
  parts,
  fees,
  timezone,
  accountId,
}: {
  accountId: string;
  parts: Portion[];
  fees: Record<string, PortionFee>;
  timezone: string;
}) {
  const { exits, totalQuantity } = exitBreakdown(parts, fees);
  const sameTime = new Set(exits.map((e) => e.at)).size < exits.length;
  return (
    <section
      className="import-card trade-exits"
      aria-labelledby="trade-exits-title"
    >
      <header className="trade-exits-header">
        <div>
          <h2 id="trade-exits-title">Exit breakdown</h2>
          <p className="small muted">
            See what each recorded exit contributed to this trade.
          </p>
        </div>
        <span className="trade-exits-count">
          {exits.length} {exits.length === 1 ? "exit" : "exits"}{" "}
          <span aria-hidden="true">·</span> {new D(totalQuantity).toFixed()}{" "}
          contracts closed
        </span>
      </header>
      <div className="trade-exits-strip" aria-hidden="true">
        {exits.map((e) => (
          <span key={e.id} style={{ flexGrow: e.share }} />
        ))}
      </div>
      <ol className="trade-exits-list">
        {exits.map((e, i) => (
          <li key={e.id}>
            <div className="trade-exit-marker" aria-hidden="true">
              {i + 1}
            </div>
            <div className="trade-exit-identity">
              <strong>
                {exits.length > 1 ? `Partial exit ${i + 1}` : "Recorded exit"}
              </strong>
              <time dateTime={e.at}>{journalTimestamp(e.at, timezone)}</time>
            </div>
            <div className="trade-exit-fact">
              <small>Quantity closed</small>
              <strong>
                {new D(e.quantity).toFixed()}{" "}
                <span>
                  {new D(e.quantity).eq(1) ? "contract" : "contracts"}
                </span>
              </strong>
              <small>
                {new D(e.share).toDecimalPlaces(1).toFixed()}% of recorded
                quantity
              </small>
            </div>
            <div className="trade-exit-fact">
              <small>Exit price</small>
              <strong>
                {e.price === null ? "Unknown" : new D(e.price).toFixed()}
              </strong>
              <small>
                {e.side === "long"
                  ? "Sell to close"
                  : e.side === "short"
                    ? "Buy to close"
                    : "Direction unknown"}
              </small>
            </div>
            <div className="trade-exit-fact">
              <small>Gross P&L</small>
              <strong
                className={new D(e.gross).lt(0) ? "negative" : "positive"}
              >
                {journalMoney(e.gross, true)}
              </strong>
              <small>
                {e.fees === null
                  ? "Fees not recorded"
                  : `Fees ${journalMoney(e.fees)} / ${e.feeKind.toLowerCase()}`}
              </small>
            </div>
            <div className="trade-exit-result">
              <small>
                {e.feeKind === "Estimated" || e.feeKind === "Mixed"
                  ? "Estimated net P&L"
                  : "Net P&L"}
              </small>
              <strong
                className={
                  e.net === null
                    ? "muted"
                    : new D(e.net).lt(0)
                      ? "negative"
                      : "positive"
                }
              >
                {e.net === null ? "Fees needed" : journalMoney(e.net, true)}
              </strong>
              {e.net === null && (
                <a href={`/fees?accountId=${accountId}`}>Review fees</a>
              )}
            </div>
          </li>
        ))}
      </ol>
      <p className="small muted" id="trade-fee-help">
        Times in {timezone}. Quantities and percentages cover these imported
        exits; remaining open quantity is not confirmed.
        {sameTime
          ? " Same-time exits have no confirmed execution order."
          : ""}{" "}
        Missing fees stay unknown.
      </p>
    </section>
  );
}
