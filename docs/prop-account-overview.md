# Prop account overview

The normal flow is **create account > select rules and starting balance > import trades > view progress**. The compact account detail retains the owned-account switcher, phase selector, light/dark themes, responsive calendar, cached navigation and existing historical records.

## Imported-trade overview refinement

The main overview uses the pure `importedOverview` journal projection, separate from the existing compliance and payout-eligibility calculations:

**Account balance = actual phase starting balance + imported net realized P&L + recorded account adjustments.**

- Original source IDs are included once; grouped records are not counted again. Allocated, manual or estimated source fees are deducted once. Unknown fees remain unknown, and estimated fees are labeled.
- Recorded payout deductions reduce balance once, including when the cash ledger already contains their deduction ID. Requests, forecasts and trader receipts do not become trading profit or duplicate deductions.
- Account IDs, exclusive phase ends, reset starting balances and phase-crossing activity are respected. Evaluation profit does not carry into a new funded phase.
- Trading days count configured firm sessions with imported closes, independently of profit, fee availability or a history-confirmation checkbox. They are journal activity counts, not an official certification of the firm requirement.
- The status shows **Based on imported trades / Last imported [timestamp]**, with an explicit note that this is not a live broker balance.

The top metrics are Account balance, Net profit, Profit remaining (when applicable), Loss limit, Remaining loss buffer and Trading days. The loss limit is the minimum permitted account balance; the buffer is calculated balance minus that limit. Missing essential rules produce one **Set account rules** action. Unknown amounts use an em dash, not zero. Target progress displays net profit, saved target and remaining profit; negative profit does not produce a negative-width bar or an automatic failed status.

## Drawdown rules

Static limits use the saved fixed threshold, or the configured starting balance and fixed drawdown amount. EOD trailing uses completed session balances, never the peak of an individual trade. Effective rule versions, configured high-water marks, next-session activation, caps, locks, explicit corrections and configured payout threshold events are applied chronologically. Ordinary trailing limits do not move down.

Intraday thresholds use a closed-trade high-water estimate and display: **Estimated from closed trades. Your firm intraday limit may differ.** Unrealized equity peaks cannot be reconstructed from Performance.csv. Equity-based or estimated-fee limits are also identified as estimates. Missing fee amounts create gaps instead of being treated as zero.

## Chart and calendar

The chart has an emerald balance line and subtle area, muted red loss-limit line, dashed violet profit-target reference and neutral starting-balance reference. Step segments reflect changes at actual event times without inventing intermediate peaks or dips. Reference names appear in the legend; price/date axes remain readable on narrow screens. Thresholds with insufficient history do not appear as isolated red points.

**Trades** uses closed-trade timestamps and recorded ledger events. **Daily** uses completed firm-session closing balances and ends at the last completed session; the current unfinished session remains visible in Trades and the top metrics. Inactive sessions carry the balance without adding trading days. Both views use **All time / 30 days / Custom** ranges. A cropped range carries the prior value to its edge. Chart amounts are converted to numbers only for plotting; precise decimal strings are retained for tooltips and financial calculations.

Tooltips include only the date/session, account balance, displayed net P&L, loss limit and remaining buffer. Unknown rows are omitted and estimates are labeled. They contain no observation or timestamp-matching instructions. Chart animation does not replay on refresh, and reduced motion is respected.

Calendar P&L and payout events remain account/phase scoped. Source IDs are deduplicated and owned record links remain available. Daily qualification badges are shown only when the existing eligibility engine can establish them; unavailable qualification does not block imported P&L. Requests, approvals, deductions and receipts retain distinct dates. Calendar/range/view/tab state is remembered by user and account without persisting private balances or note bodies in browser storage.

## Optional reconciliation and eligibility

Existing manual snapshots, baseline corrections, phase transitions and status actions are preserved under **Rules**, with a **Manage > Manual reconciliation** shortcut. Snapshots no longer anchor or replace the main imported-trade chart. Historical snapshots and rule versions remain available in History. No original import, balance, rule, account association or manual snapshot is rewritten by viewing this page.

Other account requirements are separate and expandable. The strict compliance/payout engine is unchanged: the imported projection does not certify passing, failure, prior compliance or payout approval. Performance.csv does not establish unrealized equity, concurrent exposure, open-only activity or a complete account history. Only recorded imported results and adjustments contribute to the main balance.

## Verification and setup

Focused financial checks cover precision and fee deductions, duplicate sources/imports, firm-session days and a DST boundary, static/EOD limits, next-session cap activation, intraday estimates, payout deductions, phase resets and preservation of manual snapshots. The existing disposable browser scenario compares overview values with the private API, checks repeated imports, account isolation, range/calendar state, both display modes, and desktop/mobile containment in both themes.

No migration, environment variable, dependency upgrade, production build, deployment or infrastructure change is required. Private synthetic captures are excluded from commits. Verification results are recorded in the implementation handoff; no full application suite is part of this refinement.
