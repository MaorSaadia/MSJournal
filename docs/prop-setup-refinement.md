# Day 14 setup refinement

## Setup and existing accounts

Prop Accounts groups accounts by actual firm with compact two-column desktop cards and a single-column mobile layout. Add Account and Finish setup share a three-section dialog: exact firm/product/stage/size/options, rules review, and tracking starting point. Unsupported combinations require Customize. Advanced rules remain collapsed. Edits mark the preset Customized; resetting restores the selected preset. Purchased account settings only affect this journal, never the firm account.

Account identity, phase, immutable rule version, actual baseline and optional opening snapshot are written in one transaction. A request identifier plus payload fingerprint makes identical save retries idempotent. Failures roll back all setup writes. Server-side ownership checks cover accounts, phases and previews. Existing metadata editing, archiving and explicit phase/reset history remain available.

A read-only inspection found Apex02 has 75 stored source rows and Apex006 has 7, but both have zero phases and zero rule versions. That is why imported P&L existed without rule-based progress. Choose Finish setup, select the actual agreement, review the cutoff/activity preview and confirm the real starting balance or a dashboard snapshot. Do not reupload the same history. This implementation does not guess or configure either account automatically.

A snapshot is an anchor, not a deposit. Only later source contributions project its balance. Opening cycle values have an explicit cutoff. History completeness is a user confirmation, not inferred from having a CSV. Platform is editable and may be Unknown; explicit destination-account Tradovate CSV imports no longer reject a different platform label. This does not add any other broker parser or integration.

## Presets and financial boundaries

See [exact coverage and official sources](prop-preset-coverage.md). Topstep and FundedNext Futures are added alongside the original Apex, MFFU, Lucid and TPT presets. Additional sizes are restricted to verified product/stage combinations. Historical saved rules never follow catalog updates automatically.

The typed engine now supports effective consistency-adjusted targets, qualifying versus trading payout days, exclusion of a request/reset session, positive profit requirements after the first payout, lifetime best day against a cycle denominator, and a completed-session buffer gate. Coincident session-close/reset boundaries activate the EOD floor without waiting an extra day. These additions have focused fixtures; no arbitrary formulas execute.

Unknown fees stay unknown. Cards show net where supported and gross/estimated labels otherwise, retaining supported metrics when other requirements are incomplete. Source portions are counted once. Intraday unrealized peaks and maximum simultaneous exposure cannot be verified from Performance.csv. Confirmed threshold snapshots show their timestamps; incomplete inputs cannot certify a pass or payout. FundedNext opening ledgers and session/event uncertainties require actual account information, not nominal-size assumptions.

## Persistence and operation

No new SQL migration, infrastructure, environment variable or deployment is needed for this refinement. Apply the existing reviewed Day 14 migration in environments that do not yet have it. JSON rule/snapshot fields are additive; prior versions remain readable. Backup archive format v5 includes the extended preset references, strategy flags and EOD opening confirmation through the existing owned relational export. Exported IDs/version/phase relationships remain intact. Keep this archive for your records. In-app restoration is not available yet.

## Verification

Focused unit checks: 27 passed across prop tracking, account validation and export utilities. Strict TypeScript passed. A disposable-account browser scenario verifies product/size restrictions, atomic save/rollback, identical-save retry, cross-user rejection, existing-import reuse and saved net progress. It also captures evaluation, funded and incomplete-account layouts at 1440px and 390px in both themes. Scoped ESLint and git whitespace checks passed. The final browser scenario passed in 39.8 seconds; desktop/mobile captures in both themes were visually reviewed, including the reachable sticky dialog footer and no page-wide horizontal overflow.

No full test suite or repeated production build was run for this refinement. No production migration, deployment, live firm API, email or object-storage verification was performed. Real customer data and private captures are not committed.


## Firm-first follow-up (2026-10-19)

The page-level action is now Add Firm. Selecting a known or custom firm saves an empty group; Add account inside the group opens the existing guide with the firm already selected. Existing account-based groups are retained automatically. Firm/active/passed/failed totals sit above the filters. Duplicate saved names are prevented under a locked per-user preference row; existing settings are preserved. Empty groups survive reloads and remain private to their owner.

Migration `0013_orange_madripoor.sql` only adds `user_preferences.prop_firm_names` with an empty-array default. It was reviewed and applied to the configured development database; other environments need `npm.cmd run db:migrate -- --reviewed` before releasing this change. The existing v5 backup catalog automatically includes the new preference column. No account/import/rule data is migrated or reassigned.

Checks: TypeScript and scoped ESLint passed; five focused export tests passed. The updated disposable browser scenario passed, checking persistence, idempotent firm adds, cross-user isolation, firm-specific setup and existing-import reuse. Desktop/mobile captures in both themes were reviewed. A contrast issue in the new dialog search input was corrected after that review. No full suite, production build or deployment was performed.
