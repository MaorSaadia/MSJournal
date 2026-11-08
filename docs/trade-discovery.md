# Trade confirmations and performance filters

Trade Review includes confirmation chips below Primary strategy. Select built-in labels or add a custom label (60 characters, single line, maximum 30 per review). They use the existing review autosave, conflict handling, source association, recovery and backup paths. Strategy checklist assessments remain independent; selecting a confirmation is a personal observation, not proof of rule compliance.

Custom confirmations and emotions saved on this user's reviews become reusable choices. Nothing is shared between users. `/api/reviews/filter-options` is authenticated, private and owner scoped, including strategy names. No migration is needed: confirmations are an optional property on existing review JSON; older reviews remain valid.

Dashboard → Filters and Trade View → More filters support strategy, confirmation, emotion and its before/during/after stage, local entry hour, local exit weekday, holding duration and plan adherence. Custom emotions are included. Filters combine with AND; a selected tag requires that tag to have been recorded. Empty assessments do not imply a negative answer. Multiple confirmation tags may be recorded; the filter selects one tag at a time. No claim of statistical significance or strategy profitability is made from small samples.

Entry hour and holding duration describe the published trade group, matching Trade View. Unknown entries do not match an entry-time or duration filter. Weekday follows each source exit for realized activity, and the closing timestamp for complete trades. All times use the journal display timezone, including DST.

Dashboard performance selects matching published parents and sums each realized source contribution once within its existing account/date/symbol/direction scope. Fees retain the existing known/estimated/missing behavior. Metrics, activity, daily/cumulative P&L and recent records use this selection. Account balance intentionally continues to use the full account ledger. Filtered drill-through links retain the filters; they lead to Trade View rather than silently dropping unsupported filters in Reports.

Filters live in the URL and use existing identity-scoped request/cache keys. Review and strategy changes invalidate affected Dashboard results and reusable choices. Existing Dashboard account defaults and independent page account selections remain unchanged.

Focused checks: `tests/discovery.test.ts`, `tests/reviews.test.ts`, `tests/dashboard.test.ts`; disposable browser fixture `browser-tests/trade-discovery.spec.ts` (requires `MSJOURNAL_TEST_DISPOSABLE=true`). The browser fixture creates and cleans up only its own synthetic users and verifies saved custom labels, combined filtering, consistent net P&L and cross-user access prevention.
