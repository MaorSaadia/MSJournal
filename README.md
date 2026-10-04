# MSJournal — Day 1

A local, fictional futures-trading dashboard. One Next.js App Router application using React, strict TypeScript, Tailwind v4, shadcn/ui, next-themes, Lucide, Recharts, Motion, date-fns, and @date-fns/tz. Uses npm and its tracked package-lock.json. Geist is locally bundled, so builds do not fetch Google Fonts.

## Run locally

```powershell
npm.cmd ci
npm.cmd run dev -- --hostname 127.0.0.1
```

Open http://localhost:3000. On shells that support npm scripts directly, `npm` works in place of `npm.cmd`. Production preview: `npm.cmd run build`, then `npm.cmd run start -- --hostname 127.0.0.1`.

## Day 1 experience

- Compact desktop dashboard, tablet grids, and a mobile navigation drawer and reformatted calendar.
- Light/dark/system appearance; system is the initial default. Saved preference persists locally.
- Account multiselect, inclusive date range, symbol and long/short filters.
- Shared financial metrics, cumulative and daily net P&L, closed-trade drawdown, balance history, activity heatmap, recent closed trades, and read-only calendar day details.
- Calendar starts in March 2026. “This month” goes to the actual current Jerusalem month, including an empty state outside the fixture.
- Entry-time scatter display supports Asia/Jerusalem, America/New_York, Europe/London, and UTC. Its expandable data table provides access without hover.
- All eight other navigation destinations are coming-soon pages. Import Trades explains the future CSV workflow.

## Demo fixture and calculation scope

The fixed fixture covers **January 1–March 31, 2026**, initially filtered to **March 1–31**. `data/demo.ts` contains only fictional closed trades for four fictional accounts (one per named firm, with both funded and evaluation stages). Each starts at USD 50,000 on January 1. Explicit cash movements: Evergreen +$250 on February 2; Northstar -$1,200 on February 12; Harbor -$850 on March 18. These are fictional cash adjustments, not assertions about firm policies.

`lib/calculations.ts` calculates net P&L from gross minus commissions and fees, rates, ratios, daily results, cumulative results, per-close drawdown, and account balances. Monetary inputs and sums use integer cents. Fractional-cent averages are presentation values only; production persistence and reconciliation will use decimal-safe arithmetic in a later milestone. Undefined ratios display an em dash.

Performance filters apply together. Balance uses account and date scope only, preserving starting capital, results before the selected range, and cash movements. Symbol/direction filters do not change balances. The prop overview shows each account’s illustrative balance as of the selected range end; unselected accounts are dimmed.

Daily grouping always uses **Asia/Jerusalem close dates** in Day 1. Changing the entry-time display timezone does not regroup days. `lib/dates.ts` centralizes IANA-aware dates, UTC timestamp fixtures, and display helpers; daylight-saving offsets are covered by tests. Future CSV imports will accept a chosen source timezone (including New York), retain it with normalized UTC timestamps, and validate ambiguous/nonexistent local times. No CSV interpretation is implemented today.

The radar profile is explicitly illustrative, independent of filters, and has no implemented scoring methodology or composite score. Account limits, targets, broker connections, journaling, authentication, storage, and a database are not implemented. Do not enter private trading information into this demo.

## Verify

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

Eight focused Vitest checks cover net-after-fees metrics, empty/flat/no-loss cases, opening-zero cumulative results, per-close peak drawdown, starting/prior balances and cash, filter reconciliation, close-day grouping, and winter/summer offsets in Jerusalem and New York.

For the browser smoke check, start the production preview on the test port in a separate terminal:

```powershell
npm.cmd run start -- --hostname 127.0.0.1 --port 3100
npm.cmd run test:browser
```

The browser check uses an installed Google Chrome (`channel: chrome`). It checks light/system default, dark persistence, desktop/tablet/mobile page overflow, filters and out-of-period empty states, unchanged balances under trade filters, calendar month/day controls, actual-current-month behavior, timezone display, import explanation, sidebar collapse, coming-soon navigation, mobile drawer, and console/hydration errors. It saves screenshots to `artifacts/`.

Captured: `artifacts/dashboard-light.png`, `artifacts/dashboard-dark.png`, `artifacts/dashboard-tablet.png`, and `artifacts/dashboard-mobile.png`. The two requested TradeZella reference attachments were not available in the conversation; the written layout specification was used. No public deployment was performed.

## Known dependency limitation

The inherited Next.js lint configuration brings a `braces` stack-exhaustion advisory through micromatch/fast-glob. npm audit reports five affected entries in that development-only chain; its suggested fix downgrades eslint-config-next to Next 14. The compatible Next 16 configuration is retained. No forced downgrade was applied. This is unrelated to user-uploaded data, which Day 1 does not accept.

## Configuration references

The installed Next.js guidance is in `node_modules/next/dist/docs/`. Dependency configuration follows [shadcn/ui](https://ui.shadcn.com/docs/installation/manual), [next-themes](https://github.com/pacocoursey/next-themes), [Motion reduced-motion guidance](https://motion.dev/docs/react-accessibility), [Recharts](https://recharts.github.io/en-US/api/ResponsiveContainer/), and [date-fns timezone documentation](https://github.com/date-fns/tz).

Work stops at Day 1 for review. No Neon, Drizzle, CSV parsing, authentication, or later-milestone infrastructure has been configured.
