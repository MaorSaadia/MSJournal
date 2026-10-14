import { journalMoney } from "@/lib/journal/calculations";
import type { FeeQuote } from "@/lib/fees/model";
export function FeeSummary({ quote }: { quote: FeeQuote }) {
  return (
    <div className="fee-summary">
      <div>
        <span>Gross P&L</span>
        <strong>{journalMoney(quote.gross, true)}</strong>
      </div>
      <div>
        <span>Trading fees & commissions</span>
        <strong>{journalMoney(quote.total)}</strong>
      </div>
      <div>
        <span>Net P&L after entered fees</span>
        <strong>{journalMoney(quote.net, true)}</strong>
      </div>
      <p>
        {quote.count} Performance records · exits {quote.start} – {quote.end} ·{" "}
        {quote.timezone}.
      </p>
      <p>
        The total is entered from your broker report. Per-record fees are
        allocated by closed quantity, not broker-reported trade fees. Partial
        date ranges, strategies and individual records use these allocations.
      </p>
      {quote.unchanged ? (
        <p>
          This same fee total is already recorded. It will not be deducted
          again.
        </p>
      ) : (
        quote.replaceRequired && (
          <p>
            {quote.existingTotals} existing fee totals and {quote.manualRecords}{" "}
            individually entered fees will be replaced, not added to this total.
            Previous totals remain in history.
          </p>
        )
      )}
    </div>
  );
}
