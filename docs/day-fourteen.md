# Day 14 - Prop account rules and progress

## Using it

Open **Prop Accounts**, select an account, then **Configure progress tracking** (new/unconfigured accounts) or **Rules**. The five-step setup selects identity, exact catalog product/version/stage/size/options, editable rules, tracking start, and a changed-rules preview. Advanced details start collapsed. Existing custom rules populate the editor. Account identity and import mappings stay intact; explicitly selected Performance imports need no broker identifier.

A dated correction appends an immutable rule version. A reset/stage transition closes the previous phase and creates a separate phase with an explicit new balance; evaluation profit never carries automatically. The existing transition form also supports a distinct owned broker account. Saved historical phases, rules, snapshots and imports are preserved. No setting changes the actual firm account.

Choose **From phase start** with the actual ledger balance and complete-history confirmation, or **Current firm dashboard snapshot** with a timestamp, balance, threshold, optional high-water/lock and cycle opening values. Nominal size is separate from ledger balance (some funded products start at zero). Opening profit/counts remain unknown until supplied. Dated daily openings are preferable; aggregate openings overlapping a partial session block eligibility. Explicit activity coverage has a cutoff and cannot be future-dated. Use **Update from firm dashboard** for later observations; snapshots anchor subsequent activity rather than adding deposits/profit.

Overview shows evaluation target or payout-cycle profit, remaining target, supported balance, threshold/buffer with timestamp/quality, requirements, session results, and next actions. Rules show firm sessions, loss/position policies, manual restrictions and source links. Payouts records request, approval, actual deduction and trader receipt independently. History preserves rule versions, phase/status events and snapshot observations. The chart has supported values and snapshot gaps, not a fabricated equity path.

## Financial conventions

- Precision-safe decimal strings; missing fees stay unknown. Only immutable realized source contributions count, never both a grouped record and its portions. Overlapping imports are deduplicated by the existing importer. Fee/import/correction changes recalculate progress on the next read.
- Firm-session IANA timezone/reset/close is independent of journal display timezone. Completed session dates drive days and consistency. Ambiguous/nonexistent configured local times require correction; DST uses existing timezone conversion.
- Static floors stay fixed. Ordinary trailing floors use the greater of previous floor and observed high-water minus distance, respecting a configured cap/lock. EOD closes and next-session activation are separate from breach observations. Cash changes do not become trading profit and make unconfirmed trailing estimates incomplete. Explicit documented payout events or flagged corrections may change a threshold.
- Performance.csv cannot establish intraday equity highs, concurrent exposure, news compliance or all breaches. Unlocked intraday thresholds require dated firm observations; later unknown thresholds are gaps. EOD derivation needs complete supported coverage, known net fees, session confirmation and balance-based highs. Equity-based EOD highs require firm snapshots.
- Consistency retains phase/cycle scope, net/positive-day denominator, strict/inclusive comparison and configured rounding. Nonpositive denominators do not produce a meaningful percentage. Additional required profit assumes the best day stays unchanged. A consistency shortfall never automatically fails the account.
- Evaluation status remains user recorded. Tracked requirements met is not official passing. Failed/closed states require explicit recording. Unsupported restrictions stay visible manual checks.
- Payout forecasts apply day/profit/consistency/wait requirements, submit and post-deduction floors, protected buffer, caps, profit-percentage restrictions, split, cycle/reset timing and known threshold. Unknown critical inputs block eligibility while known progress remains visible. Forecasts never submit requests to a firm.
- Requested funds are reserved only in forecasts. Only an explicit actual deduction creates a linked account withdrawal. Marking Paid never deducts twice; retrying identical writes is idempotent. Editing the deduction updates its single ledger row and appends before/after audit events. Paid entries without recorded deductions remain reserved and need clarification. Linked deductions must be edited in Payouts, not the generic cash editor. Cycle resets use their precise configured event timestamps rather than a status label.
- Snapshot anchors exclude earlier activity/cash already reflected in their balance. Cross-phase payout cash does not bleed into a subsequent phase; phase-spanning trade activity is flagged. Confirmed history and partial projections are labeled separately. Snapshots do not prove previous compliance.

## Preset coverage

See [verified combinations, official sources and unresolved gaps](prop-preset-coverage.md). Catalog metadata records research date, product/version, official sources and documented effective dates. Unsupported historical combinations use Custom. Account snapshots are independent of later catalog changes; server normalization prevents a modified catalog payload from silently claiming original verification.

## Persistence, privacy and migration

Reviewed additive migration **0012_unusual_random.sql** adds snapshot JSON opening details, owner-scoped payout records, immutable payout audit revisions, foreign keys and indexes. It was applied only to the configured development database. Other environments must review SQL and confirm the intended database before running:

```powershell
npm.cmd run db:migrate -- --reviewed
```

No reset/push workflow, production migration, provisioning or deployment is part of this milestone. No new environment variables. Read transactions use a repeatable-read financial snapshot; account/phase/payout mutations validate nested ownership and lock owned accounts/phases. Optimistic payout revisions protect concurrent edits. Private routes retain existing session/origin and no-store protections. Exports do not contain credentials or other users' rows.

Settings - Data & backups now writes **archive format v4**, adding `prop_payouts` and `prop_payout_events`, extended snapshot details and typed rule/preset references. Stable account/phase/payout/deduction IDs and immutable versions support future restore mapping. Existing private image behavior/limits are unchanged. **Keep this archive for your records. In-app restoration is not available yet.** A portable ZIP does not replace provider-level backups.

## Verification

Passed **27 focused checks** across `tests/prop-tracking.test.ts`, `tests/props.test.ts` and `tests/exports.test.ts`. They cover static/EOD/intraday boundaries, nondecreasing ordinary floors and caps, strict/inclusive consistency and exact decimal rule values, a 23-hour DST session, snapshot/import overlap, explicit opening-day exclusions, missing/estimated fees, phase/account isolation, payout reservation/reset/deduction behavior, percentage/cap/split requirements, preset validation, CSV/ZIP safety and the backup allowlist.

A disposable-account browser/route scenario passed: duplicate uploads counted once, exact net target progress, snapshot cutoffs, independent payout events, retry idempotency, correction audit history and one linked deduction, cross-user account/phase mutation denial, a CRC-valid v4 ZIP with payout/phase/ledger links, the five-step rule-version save, and 1440px/390px containment for evaluation/funded/partial-history accounts in both themes. Synthetic captures under ignored `test-results/day-fourteen-*` were visually inspected. The missing-input forecast was then condensed into one notice and status badges given explicit wrapping gaps. Fixtures were cleaned up; no real private export or screenshot was committed.

TypeScript and scoped ESLint pass. One production build passed using the installed Next.js Webpack builder (`node node_modules/next/dist/bin/next build --webpack`), with a placeholder HTTPS auth origin set only for that process; no deployment occurred. Final small review changes were checked again with TypeScript, scoped lint and the focused tests rather than rerunning the full build.

The first browser attempt exceeded its 15-second cold-navigation wait; the second reached the page but exceeded a 5-second data-readiness assertion. The dev server also reported slow filesystem/cache compaction, and a later attempt coincided with an intermediate compilation error during editing. The final stable-source scenario passed with DOM/content readiness waits. No user development server was stopped.

No full-suite campaign, live firm reconciliation, live trading integration or production deployment was performed. Physical-device keyboards, firm holiday/short-session calendars, concurrent live-account usage, all catalog gaps and real dashboard reconciliation remain unverified. Session boundary/holiday exceptions must be confirmed manually. Performance.csv alone cannot validate intraday equity paths, maximum concurrent positions, prohibited-news behavior, missing historical fees or prior compliance. No paid service, expense accounting, reset-cost accounting, broker API, copy trading or automated firm payout submission was added.
