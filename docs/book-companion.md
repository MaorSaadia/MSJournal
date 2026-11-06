# Book Companion & Worksheets

The companion to **The Consistent Day Trader: A Practical Guide to Trading Psychology, Risk Management, and Prop Firm Challenges**, by **Maor Saadia**.

## Current simplified edition (2026-11-06)

The public companion now has four tools in a 2-by-2 desktop grid and one mobile column. Search/categories and the long introduction were removed. The revised appendices supplied by the author supersede the original public A-L library. `lib/book/current-source.json` records the four revised appendix sections only; `current.ts` provides their typed fields and stable IDs. Appendix B's reset reference is corrected to Appendix C.

| Tool | Route | Template ID / version |
| --- | --- | --- |
| My Plan | `/book/my-personal-trading-plan` | `plan-2` / 2 |
| Session Sheet | `/book/my-trading-session-sheet` | `session-2` / 2 |
| Reset Card | `/book/after-a-missed-trade-or-loss` | `reset-2` / 2 |
| Pattern Review | `/book/review-one-pattern-practice-one-change` | `pattern-2` / 2 |

The editor uses a central writing column, automatic editable dated titles, small save status, Print/PDF and More disclosures, and collapsed Details for optional metadata. Native radio groups distinguish exclusive choices from checks. Per-field value-state selectors are removed; historical unknown/not-applicable values and reasons remain visible, printable and explicitly replaceable. No saved answer is automatically reinterpreted.

A has four numbered sections and paired trigger/response fields. B keeps all three session sections on one page, with optional scroll links and precision-safe per-unit multiplication. Missing/invalid inputs leave its total blank; the unit is explicit, zero remains zero, and the actual-loss warning remains visible. C keeps four instructions always readable and opens saved personalized cards in a reading view with Edit. D validates counts with non-blocking feedback, compares totals and reports no opportunity when the trigger count is zero. It adds no adherence score or charts.

### Preservation and old routes

Original `A-1` through `L-1` definitions and `manuscript.json` remain unchanged. New IDs do not match old appendix letters. Existing database template snapshots, entries, revisions, links, guest storage keys and print URLs are preserved; My Worksheets separates the Previous edition area and filters by template ID. Known old public URLs show a noindex retirement page with links to saved entries and the four current tools. None redirects to an unrelated worksheet. Explicit existing-entry copying/recovery can still resolve the original definition; retired templates are absent from the public directory/new-entry picker and sitemap.

### PDFs, setup and checks

Individual current blank PDFs and the combined workbook use the same typed definitions as the forms. A4 and Letter are supported; workbook links include the edition query to avoid an older cached workbook. Private completed printing remains authenticated; guest printing expands complete local answers. No database migration or new dependency is required for this redesign; existing migration 0014 remains the prerequisite. The backup version stays v6 and already contains both editions' referenced saved definitions.

Focused verification covers four current definitions and all previous definitions, precision-safe multiplication, non-blocking count validation, PDFs, SEO, guest reload/navigation, draft transfer and failed-save recovery, saved history, owner isolation, old-entry preservation, long completed printing, mobile/desktop and both themes. No deployment or broad test suite is part of this change.

Verification results: 16 focused unit tests passed (current/previous edition and SEO); the final current-edition/SEO subset passed again after calculation/PDF refinements. Four focused browser scenarios passed across the main run and the reset-card follow-up. TypeScript and scoped ESLint passed. All four current blank PDFs and both seven-page workbooks have no detected empty or clipped pages. Long guest answers retained their ending across three pages on both paper sizes. Desktop/mobile and both themes were visually reviewed. No unresolved content blocker remains.

---

## Previous-edition implementation reference (2026-11-03)

- `/book`: public introduction, worksheet search and five category filters, all 12 cards, free-account explanation and A4/US Letter workbook downloads.
- `/book/[worksheet-slug]`: permanent public template, online form, guest draft, printing and blank PDF download.
- **Worksheets** in the existing application navigation, `/worksheets`: owner-only saved entries with title/type/status filters and dates.
- `/worksheets/[id]`: saved form, autosave, complete, duplicate, delete, optional record link and revision history.
- `/worksheets/[id]/print?revision=N`: authenticated, non-indexable completed HTML for browser print/Save as PDF. The route deliberately sits outside the streaming workspace shell so ownership failures return a genuine 404 before emitting print content. It uses the same public URL structure as the saved entry.
- `/book/downloads/[worksheet-slug].pdf` and `/book/downloads/workbook.pdf`: direct downloadable blank PDFs. Default A4; add `?paper=letter` for US Letter. These endpoints accept no private answers and contain only the trusted public definitions.

No subscription or book-purchase verification is required. Saved entries use the existing MSJournal signup/sign-in and account ownership model. Core templates also work without imports, a strategy or a prop account. No Whop work or deployment is included.

## Manuscript coverage

Only the intended Appendices section and its directory/introduction were transcribed into `lib/book/manuscript.json`. The source DOCX and chapters are not in the repository/public directory. Its embedded images are part-divider artwork, not a supplied cover; the landing uses a typographic introduction instead.

| Appendix | Permanent slug | Chapters | Category / optional existing reference |
| --- | --- | --- | --- |
| A — Personal Trading Operating Plan | `personal-trading-operating-plan` | 27 | Build your plan |
| B — Account and Prop-Firm Fact Sheet | `account-and-prop-firm-fact-sheet` | 19–22 | Accounts and commitments / account |
| C — Model Definition Card | `model-definition-card` | 23 | Build your plan / strategy/playbook |
| D — Session Preparation and Closure | `session-preparation-and-closure` | 15, 18, 20 | Prepare and record / daily session |
| E — Risk Budget and Position-Sizing Record | `risk-budget-and-position-sizing-record` | 11–13, 21 | Prepare and record |
| F — Trade Plan and Decision Record | `trade-plan-and-decision-record` | 15–18, 24 | Prepare and record / trade review |
| G — Missed-Trade and Revenge-Trade Reset Card | `missed-trade-and-revenge-trade-reset-card` | 7–9, 24 | Difficult moments |
| H — Drawdown, Pause, and Return Plan | `drawdown-pause-and-return-plan` | 13, 26 | Difficult moments |
| I — Review and Practice Worksheet | `review-and-practice-worksheet` | 24–25 | Review your progress |
| J — Challenge Progress and Payout Review | `challenge-progress-and-payout-review` | 20–22 | Accounts and commitments / account |
| K — Trading Project Cash and Time Ledger | `trading-project-cash-and-time-ledger` | 14, 22, 26 | Accounts and commitments |
| L — Behavioral Progress Record | `behavioral-progress-record` | 4, 24–25 | Review your progress / process goal |

All source prompts, table columns/rows, formulas, explanations, caveats and chapter references are retained. Table records are laid out vertically for legibility and handwriting rather than compressed into narrow columns. Online tables expand on demand; print output always includes their content. Free-text source references and attachment descriptions remain text: the companion does not introduce a separate attachment upload system.

## Definitions, entries and history

`lib/book/templates.ts` is the typed, versioned definition layer. Form controls, blank PDF rendering and completed/blank HTML printing consume the same definitions. IDs derive from this edition's immutable source-node IDs and field offsets; dynamic record rows have stable individual IDs. On later editions, retain IDs for unchanged questions and bump the template version for changed meaning or controls. Do not replace a released definition in place or regenerate all IDs from a renumbered manuscript.

`worksheet_templates` stores a public definition/version/hash. An entry stores its template ID. A hash mismatch refuses new application of a changed definition under the same version; existing entries continue to render from their saved definition. No user-provided formulas are executed.

`worksheet_entries` stores owner, idempotent creation ID, current fields, status, revision and timestamps. `worksheet_revisions` preserves every saved version, including completed versions. Editing completed work creates a draft revision; marking complete records a new timestamp. Internal `reviewed` status is displayed as **Completed by you**, never official compliance or trading readiness. Retrospective markers, notes and F's recorded-then/later column remain explicit. Save/history timestamps are displayed in UTC; user-entered local event timestamps use their separately recorded timezone, never an inferred account timezone.

`worksheet_links` holds the optional current reference separately; revision fields preserve historical references. Choices are read from owner-scoped strategies, daily entries, current trade records, accounts and process goals. Writes reject other users' targets. Deleted/reprocessed references show unavailable rather than exposing another record; detach an unavailable reference before saving a changed link. Answers never update the linked source, official account rules or imported analytics. No automatic prefill is implemented, so no source values can silently drift into historical answers.

Forms distinguish blank, unknown, not applicable and actual numeric zero. Unknown/not-applicable cells can include a reason. Partial and no-trade drafts are supported. Limits: 5,000 characters per answer, 1,000 per reason/retrospective note, 150 repeatable records per table and 512 KiB per save request. These limits are validated server-side; failed requests leave edits available.

## Guest drafts, autosave and conflicts

Guest drafts use temporary **sessionStorage**, not URLs or public storage. Same-tab navigation, reload and sign-in preserve them when browser storage is available; closing the tab or changing origins can remove them. The UI explains this and provides explicit clear/print actions. Browser storage is not a substitute for a saved account entry.

Signup/sign-in retain a validated return path, including email verification. After authentication the draft is offered explicitly, with its timestamp and destination account. It is bound to the first offered user, is never silently attached to another sign-in, and transfers as a new entry. The temporary copy is cleared only after success. Creation IDs make matching retries idempotent; a changed retry is rejected rather than overwriting a previously created entry.

Signed-in saves reuse `SaveController`: 900 ms debounce, serialized requests, edits retained during saves, clear saving/error state, manual retry and revision conflict protection. Owner/entry-bound recovery copies can be restored explicitly after a reload, including a not-yet-created entry. A stale recovery revision still conflicts instead of overwriting newer work. Conflict options reload with confirmation or save local edits as a separate entry. The existing writing guard protects unsaved navigation.

Delete requires confirmation and the current revision. It deletes only that worksheet's current data, links and revisions. Source journals, trades, strategies and accounts are unaffected.

## Calculations and limitations

- **E:** optional assistance only for the declared linear tick-valued case. Users supply entry, protective exit, positive tick size/value, costs, execution allowance, available amount, permitted increment and maximum quantity. A worksheet currency and explicit confirmations for all constraints/reconciled exposure are needed. Quantity is rounded down to the permitted increment after both budget and quantity caps. Missing values are not zero. No result says “safe to trade”; price risk and total planning amount remain estimates. Helper inputs are temporary assistance, clearly labeled; users record the inputs/source/result in the worksheet if they use it. Moving floors, additional exposure paths and product-specific non-linear formulas remain manual.
- **K:** only the external-project-cash table contributes to its currency-separated helper. Receipts, operating expenses and personal brokerage transfers remain separate sections. Unknown amounts produce incomplete totals, not zero. Conversion narratives are left manual; only explicit single ISO currency codes are grouped. Unreceived payout requests, netted costs and tax obligations retain their separate prompts. No simulated imported losses are automatically added as expenses. The manuscript's brokerage reconciliation formula and qualifications remain visible for manual use.
- **L:** `followed / (followed + breached)` only for classified rows whose trigger occurred. Trigger-occurrence/followed/breached/unclear/not-applicable/unresolved-trigger counts accompany the result. No classified relevant events means an explanatory empty state. No inference of profitability, causation or an improved score from missing observations.

No worksheet infers live equity, open exposure or intraday threshold compliance from Performance.csv. The existing financial engine is unchanged.

## Persistence, backups and setup

Reviewed additive migration: **`drizzle/0014_book_companion.sql`**. It is applied to the configured development database. For other environments, review the SQL and use the existing workflow:

```powershell
npm.cmd run db:migrate -- --reviewed
```

It creates four tables, owner/retry/version indexes and composite ownership constraints; no existing table/data reset. The entry composite unique index is created before the dependent foreign keys.

Portable archives are now **v6**, containing the owner's worksheet entries, revisions and links plus only their referenced public template definitions. No restore UI was added. No new environment variables are required. Existing `SITE_URL` controls canonicals, sitemap and companion attribution URLs. `pdf-lib` is the only new runtime package; PDF generation needs no external service or browser infrastructure.

## SEO and privacy

Public book HTML has unique titles, descriptions, self-canonicals, server-rendered introductions and existing branded sharing metadata. The production sitemap now includes `/book` and its 12 actual worksheet pages alongside `/`. Public navigation links to Book Companion. Downloads are noindex and point to the HTML landing via canonical Link headers. Entries and completed-print pages are authenticated, noindex and private/no-store; private responses never enter public metadata, images, sitemap or blank PDFs. Public online forms themselves are dynamically rendered/no-store so signed-in context cannot become shared HTML.

Google verification/indexing/submission has not been performed. See `docs/technical-seo.md` for the existing manual Search Console and future domain workflow. Guest browser storage does not cross domains; save or print a draft before moving to a new origin.

## Focused verification

- `tests/book.test.ts`: all 12 appendix blocks/columns and stable IDs, explicit value states, sizing boundaries/missing constraints, currency isolation, adherence denominator, user-bound drafts, failed-save retry and all PDF formats.
- Existing focused export/auth/SEO tests are included for the changed integration points; no full test suite.
- `browser-tests/book-companion.spec.ts`: public pages/downloads, guest navigation/auth transfer, failed creation/update and recovery, completion history, stale revision rejection, idempotency, foreign-user read/update/delete/duplicate/print rejection, linked-account ownership and long completed printing.
- `scripts/book-pdfs.ts` writes ignored blank inspection artifacts. All 12 PDFs and A4/Letter workbooks are checked for empty/out-of-margin pages and visually reviewed. Completed PDFs exercise long answers and repeatable records on both paper sizes. Desktop/mobile and both themes are checked.
- TypeScript, scoped lint and production metadata/route generation are the project gates. Local production-mode browser tests may use a test-only Origin adapter with `MSJOURNAL_TEST_AUTH_ORIGIN`; this does not alter deployed origin validation. Only disposable development-database users are created/cleaned.

No public deployment, external account provisioning, billing change, broker integration or full-manuscript publication is part of this milestone.

### Milestone verification results (2026-11-03)

- Production build and route/metadata generation passed.
- Scoped TypeScript and ESLint checks passed; 22 focused tests passed across book, SEO, export and authentication integration.
- Both focused Playwright scenarios passed, covering guest transfer/recovery, revision conflicts, idempotency, owner isolation and private print responses.
- Desktop/mobile layouts in light/dark themes were visually reviewed. The sizing helper was checked with missing currency, a known estimate and a removed required cost.
- All 12 individual blank PDFs and both workbooks have no detected empty or out-of-margin pages. Final workbooks contain 42 A4 pages and 44 US Letter pages. Long completed examples produced 13 pages on each paper size, retaining all 12 repeated records and retrospective text without app navigation.
- Disposable verification users were cleaned up. No production deployment or full test suite was run.

### Organized PDF presentation (6 November 2026)

Current blank downloads now use an editorial layout: a small MSJournal masthead, clear title/introduction, pale emerald section bands, aligned identity/date and short-risk fields, handwriting areas, continuation headings and per-worksheet page numbers. Unit hints are consolidated without removing instructions. A4 and US Letter blank sets each total seven pages: Plan 2, Session 2, Reset 1, Pattern 2. The previous-edition renderer is retained.

Completed and browser-blank print copies share `CurrentPrintDocument` and the same section/group layout definitions. Completed answers use readable typography, subtle dividers and compact human-readable dates; revision/timestamp metadata is subordinate. Appendix A starts sections 3-4 on a fresh page. Long answers may continue over additional pages; content is never truncated to meet a page target. Named print-page margins provide page numbering in supporting browsers. Download links carry a layout version to avoid previously cached files.

The user's supplied three-page completed Appendix A was reproduced as an organized two-page local copy on both paper sizes, retaining all 19 answers (dates reformatted for readability). All four blank worksheets on both paper sizes were checked against every source question/instruction and for clipping. No saved records, template IDs, rule definitions or database rows were changed by the PDF redesign.
