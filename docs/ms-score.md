# MS Score v1.0 and trade terminology

The Dashboard MS Score replaces the old unscored Performance profile. The same calculation runs on selected real data and on explicitly labeled Demo data. It is an MSJournal formula, not the proprietary TradeZella score.

## Formula

The score is the arithmetic mean of six normalized measures, each clamped to 0-100:

| Axis | Normalization |
| --- | --- |
| Win % | Winning outcomes / all selected outcomes, including breakevens, times 100 |
| Profit factor | Total positive selected-basis P&L / absolute total negative selected-basis P&L, divided by 3, times 100 |
| Average win/loss | Average winning result / absolute average losing result, divided by 3, times 100 |
| Recovery | Positive total daily P&L / maximum daily drawdown, divided by 3, times 100 |
| Drawdown | (1 - maximum daily drawdown / sum of absolute daily P&L) times 100 |
| Consistency | (1 - largest positive day / total positive-day profit) / (1 - 1 / positive-day count), times 100 |

Consistency requires at least two positive days; otherwise that axis is 0. It measures the distribution of positive-day profits and is separate from firm payout requirements. Ratios with no losses reach the cap only when there are winning outcomes. Recovery without drawdown reaches the cap only when total daily P&L is positive. Empty, all-flat or unknown-P&L selections have no composite score. No infinite ratios are displayed.

Drawdown follows chronological local daily closes starting from zero in the selected range; it does not reconstruct intraday equity or use the nominal account size. Cash movements, account baselines and review completion do not contribute. Counts below 20 trades or 5 active days are marked early samples. The calculation uses the existing decimal utility; only chart coordinates become JavaScript numbers. The composite rounds once to two decimal places.

The score follows the selected statistical basis and daily realized data. If requested net data cannot be calculated, the existing Dashboard gross fallback remains in force and the score is labeled gross / fees incomplete. This is a descriptive summary, not an account pass, payout qualification or prediction.

## Display terminology

User-facing text uses closed trades, exits and source records instead of the old technical unit wording. Trade Win replaces the previous winning-outcome card label. A statistical-basis tooltip explains that several recorded exits may belong to one position. The expanded Dashboard count/fallback disclosure has been removed; gross/net labels and fee notices stay explicit.

Internal enum values, API keys, URLs, persisted statuses, record IDs, import relationships and backups retain their existing values for compatibility. Historical generated record descriptions are formatted at display time. No data migration, import reprocessing or financial total changes are required.

## Focused checks

`tests/ms-score.test.ts` covers the formula, date ordering, empty/unknown results, no-loss and all-loss cases, breakevens, ratio bounds and legacy status display. Existing dashboard, journal and report arithmetic tests protect unchanged totals. `browser-tests/ms-score.spec.ts` uses disposable accounts to check account-specific scores, incomplete-fee labels, trade wording, and desktop/mobile layouts in both themes.
