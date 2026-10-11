# Dashboard visual redesign

The dashboard follows the supplied TradeZella reference proportions while retaining MSJournal branding and emerald/violet accents. Screenshots use a disposable synthetic account (three exit portions, two shared-fill records, no reviews), never an existing user's private data. Consequently the profile, activity and charts are intentionally sparse rather than padded with invented results.

## Presentation

- Compact header with right-aligned filters and one secondary toolbar. Statistics and effective gross/net basis remain visible; coverage and secondary settings expand on demand.
- Five equal metric cards at large desktop sizes, split between values and outcome gauges, monetary profit-factor donut, or average win/loss comparison. Unknown ratios remain unavailable.
- Three aligned columns for the radar/activity/cumulative row and daily/recent/balance row; calendar spans two-thirds beneath them, with drawdown and entry-time charts stacked beside it.
- Neutral charcoal dark surfaces and white light surfaces; dashboard-scoped CSS also adjusts its surrounding shell without recoloring other routes.
- Thirteen calendar weeks in the activity window, violet square cells, actual weekday positions, and muted dates outside the selected filters. The window does not expand financial totals.
- Linear area charts with zero references, short date ticks, violet balance/drawdown, smaller result-colored time points, and real cash-adjustment day markers. Hover values remain exact.
- Compact calendar cells and aligned weekly summaries; signed weekly amounts cannot wrap between sign and amount.

## Profile convention and intentional differences

There is no proprietary score, impersonation banner, fictional checklist, or open-positions tab. Percent axes use 0–100. Profit factor and average win/loss use `min(ratio / 3, 1) × 100` solely for drawing the radar, with raw values in tooltips. Review completion uses known reviewed/eligible counts, including known zero; unavailable axes are omitted and fewer than three supported axes show an insufficient-data state. Review coverage describes recordkeeping, not trading skill.

Financial services, stored imports, authentication, caching, review behavior and navigation calculations are unchanged. Balance setup and cash adjustments remain functional inside an expandable section. Recent records show eight rows at most, with View all linking to the filtered Trade View.

## Verification and captures

Before captures: 1440px desktop and 390px mobile in light/dark. After captures: matching sizes plus 1895×938 upper/lower reference views. The focused browser scenario checks filter/basis changes, fee fallback, calendar and heatmap semantics, cached return navigation, exact-point record navigation, baseline and cash adjustments, responsive overflow, and runtime page errors. It also checks metric heights of 110–125px and main card heights of 300–340px at the reference viewport.

Files prefixed `before-` and `after-` contain the corresponding captures. See `after-dashboard-reference-upper.png` and `after-dashboard-reference-lower.png` for the reference-sized layout.


The development issue badge identified a real hydration mismatch: reduced-motion preference changed the dashboard's initial inline opacity/transform between server rendering and browser hydration. Both dashboard modes now render visibly with `initial={false}`. This fixes the mismatch and avoids flashing the dashboard on return navigation. The optional development browser pass uses the server's intended `localhost` hostname, checks the actual Next.js issue control, and records browser console errors as well as runtime page errors; the badge is not hidden by styling.

Validation: production build (including TypeScript), ESLint, 16 focused dashboard/report/cache tests, and the existing disposable dashboard browser regression with light/dark, 390px mobile, 1440px desktop and 1895×938 reference captures.
