# Broker fee totals and net P&L

Open **Trade View → Fees & net P&L**, **Settings → Manage fees**, or **Prop Accounts → Fees → Enter actual fee totals**. Choose the account and the local exit-date range corresponding to the broker report. The overview includes every contract in that account, not the Trade View's strategy/direction/product filters. Existing totals can be edited through their original source records, even if later imports added other records on those dates.

During a Performance CSV import, expand **Trading fees & commissions (optional)**. Enter the all-in trading fee total for **all Performance rows in that file, including duplicate rows**. Confirm that the amount excludes unrelated records, open-position charges, deposits, withdrawals and subscription costs. Leaving it blank preserves existing fees or account estimates; explicit zero records zero fees. Orders-only imports cannot carry a Performance fee total. No new CSV format or broker fee schedule is guessed.

Both flows preview the selected source count, local exit dates/timezone, gross P&L, entered fees and resulting net P&L before saving. For example, `$261.50 - $12.48 = $249.02`. Entered totals are user-reported from the broker, not independently verified by a broker API.

## Allocation and reconciliation

Fees use the existing immutable Performance-source fee system. An entered total is allocated by closed quantity across its selected source records; residual decimal amounts are assigned once so persisted allocations sum exactly to the total. Gross source amounts are never rewritten. Full selections reconcile to the entered fee total; individual records, strategies, entry-time charts and partial date ranges use **Allocated** fees, not broker-reported per-trade charges. Trade View, details, CSV exports and the net dashboard identify this basis. Select **Net** in the dashboard P&L selector to show the after-fee result. Unknown fee coverage outside the reconciled records still prevents a complete net result.

Each source belongs to at most one active total. Identical CSV re-uploads with the same total do not deduct fees again. Duplicate confirmation requests reuse their original batch. A cumulative report can replace older totals only if it contains **all** their source records; the preview shows how many totals and individually entered fees will be replaced, and confirmation is explicit. A partial overlap is rejected: edit the existing total or select a wider complete range. Replacement writes source fees once, instead of adding another charge.

Source import persistence and fee-total recording share one transaction. Conflicts and stale fee previews roll back the entire confirmation, including new source rows. Derived journal publication retains its existing separate outcome; if processing fails after an import, the saved source data and fees remain safe and processing can be retried. Management updates publish the derived journal in their own atomic transaction. Account-level locks serialize imports, fee defaults and manual edits; fingerprints bind the exact selection, amount, timezone and existing fee state. Stale confirmations require a fresh review.

Existing default per-side/contract estimates remain available and apply to future unknown records. Applying rates to existing records preserves **Manual** and **Allocated** fees. A record participating in a total cannot overwrite its allocation through the old per-record manual fee control; edit the total instead. Historical totals and allocation snapshots remain available after replacement. The history screen shows the latest 100 totals per account. Reconciliations support 1–10,000 source records; oversized selections fail without truncated calculations.

## Storage, privacy and release

Reviewed additive migration: `drizzle/0011_illegal_korg.sql`. It adds only `fee_reconciliations` and `fee_reconciliation_sources`. Composite owner/account foreign keys bind totals, optional import batches and immutable sources. A partial unique index prevents two active totals owning the same source; monetary fields retain eight decimal places. The parent ownership index precedes its dependent foreign key in the reviewed SQL. Existing fee-kind text fields now support `Allocated`; old fee data is preserved.

This migration was applied to the configured development database. Other environments require the reviewed migration before running the new code:

```sh
npm run db:migrate -- --reviewed
```

No new environment variables, providers or services are needed. Every read/write uses the server session and owner-qualified account/source relationships. Mutations require the configured origin. Responses are private/no-store; fee changes invalidate the existing private financial/progress caches. Notes and private report contents are not logged.

Portable archive format **v3** adds both tables, including historical allocations, source and batch relationships, local date/timezone context and UTC saved timestamps. The backup catalog checks their owner-qualified foreign keys. No original CSV binary, authentication secret or session is added. **Keep this archive for your records. In-app restoration is not available yet.**

## Verification

Passed **19 focused unit checks** (`fees`, `imports`, `exports`), TypeScript, scoped ESLint, and one disposable browser scenario. The browser check covers exact net totals, decimal preservation, source grouping, identical confirmations, duplicate re-uploads, partial overlap rejection, atomic cumulative replacement, stale edits, ownership denial, preservation when applying fee estimates, per-record override protection, archive inclusion, UI edits and the import form. Desktop/mobile in light/dark themes were inspected; checkbox spacing was improved after inspection.

The first browser attempt found an existing user-owned development server and could not start a second preview. Verification used that existing localhost server without stopping it. A subsequent assertion was corrected to match the displayed positive P&L sign. Final browser verification passed in about one minute. Disposable fixture data was cleaned up and no private archive was saved or committed.

No full suite, production build, deployment, live broker import or automated fee-report ingestion was performed. Broker totals must match the selected closed-record scope; fees charged for open positions or a different report timezone cannot be reliably assigned from a summary alone. Allocated per-record net results do not claim exact broker per-trade charges.


## P&L display after saving fees

The real dashboard defaults to Net when no basis is explicitly selected; its embedded calendar follows that default. Explicit Gross links and selections remain available. When all selected fees are known, Gross mode shows the fee total, the corresponding net P&L and a Show net P&L action. The Fees page shows both gross and net in its current summary and history and offers a View net P&L dashboard link after saving. Unknown fee coverage continues to use the existing honest gross fallback. This display fix required no migration; four focused dashboard checks, TypeScript and scoped lint were used instead of a full suite/build.

## Shared account selection and financial basis

Dashboard, Trade View, Calendar, Reports, Day View results, and strategy results share the current account selection, archived-account visibility, and Gross/Net choice within the signed-in workspace. Changing an account checkbox in a financial view changes the shared selection. Sidebar links replace stale account selections while preserving each page's other filters. An explicitly empty selection remains empty. Personal journal writing remains across accounts.

Financial views default to Net. Gross remains available as an explicit choice; unknown fees never become zero. The dashboard and calendar label their gross fallback when coverage is incomplete, while Trade View leaves its unknown net total empty and explains the missing coverage. Drill-down links retain the requested financial basis, including when the source chart temporarily falls back to gross. Current URL filters survive a refresh; demo account filters are isolated from private account selections. Shared state is cleared with the private workspace cache on sign-out. No database migration is needed.

Verification: TypeScript, scoped ESLint, 28 focused unit checks (workspace filters, dashboard, Trade View, Reports, Calendar), and one disposable browser scenario passed. The browser confirmed dashboard selection propagates to Trade View, net reflects entered fees, return navigation preserves the selection, and clearing every account stays empty across Calendar, Reports, and refresh. A browser locator was corrected; existing gross arithmetic fixtures now explicitly request Gross. No full suite, production build, deployment, or live broker data verification was performed.
