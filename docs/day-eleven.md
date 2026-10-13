# Day 11 — Strategies and playbooks

Open **Strategies**, name a setup and choose **Create strategy**. Only its name is required. Add optional description, market/timeframe/window notes, context, entry/invalidation/stop/exit/management rules, avoidance conditions, common mistakes and a reorderable checklist. Search by name, filter active/archived strategies, edit, archive/restore, or duplicate the text/checklist. Duplication creates an independent strategy; example image files are not copied. No real-account strategies or examples are pre-created.

## Assignments and historical instructions

Open an existing journal record's details/review workspace and use **Primary strategy**. Search options, choose one active strategy, then **Save strategy assignment**. Answer each snapshotted checklist item as **Met**, **Not met** or **Not assessed**, and save. Assessments are personal judgments, not automatic compliance checks.

Each successful instruction/checklist save creates an immutable playbook revision. A record assignment references the relevant revision; later playbook edits leave its instructions, checklist text and responses intact. **Adopt latest version** explicitly replaces the snapshot and resets all checklist answers, with confirmation. Changing/removing a strategy also confirms discarding its strategy responses; trade notes, images, fees and financial records are retained. Archived strategies remain on historical assignments and daily plans but are excluded from new assignment/planning options.

The text editor reuses debounced, serialized saves, revision conflicts, Saved/Saving/Error states and **Save now**. Failed or in-flight saves preserve newer writing. Conflict comparison requires an explicit choice before replacing writing. Assignment selection/answers have their own explicit save and unsaved-navigation guard; concurrent revisions reject stale saves.

## Reprocessing and recovery

Assignments retain the original immutable source signature. Ordinary processing or identical reimports preserve unchanged signatures and answers. Splits/merges with changed signatures preserve the original classification as unresolved, rather than copying it to multiple records or selecting between conflicting strategies.

The existing **Trade View → review recovery** destination also shows strategy recovery. Inspect the preserved instructions/revision/answers, then explicitly attach the classification to one current record in the original account, or explicitly discard an unwanted unresolved classification. For conflicting merges, choose one classification and discard the others before the result is counted. Unresolved signatures and overlapping ambiguous records are excluded from strategy categories, including Unassigned; attention counts are labeled across the selected accounts. General financial Reports totals remain unchanged when no strategy filter is selected.

## Results and preparation

The playbook **Results** tab uses the existing Reports layer, with date range, account/archive scope, gross/net, complete-trade/closed-portion basis and **All revisions** or a specific assigned revision. It shows sample count, exact decimal P&L, matching average/win-percentage labels, profit factor and contributing journal links. Reports includes a strategy comparison with **Unassigned** using the same calculation logic.

Complete-trade outcomes use a supported final-close record. The current Performance-only journal publishes matched portions and does not prove completed positions, so the complete-trade result can legitimately be empty. Closed-portion outcomes use each source's realized exit date in the journal display timezone. A grouped parent and its constituent portions never enter the same denominator. Each source portion is counted once through its one primary parent assignment. Breakevens remain in the denominator; unknown fees make net outcomes incomplete; estimated fees remain labeled; unsupported/zero denominators do not invent a profit factor or average. Results describe user classifications, not automated detection, backtesting or proof of an edge. Trading currency remains USD with the existing account/currency checks.

Trade View offers an optional **Strategy** column and a strategy filter including Unassigned. Existing filters and pagination remain in the URL. Day View preparation can select several intended strategies and open their saved instructions/checklists. Saved revision references are validated server-side and remain readable after playbook edits or archive. Existing free-text preparation is preserved. Planned strategies never classify imported trades automatically.

## Private examples and setup

The **Examples** tab reuses Day 7's gallery/upload/viewer, authenticated private image endpoints, validation, thumbnail generation, limits and existing S3-compatible configuration. PNG/JPEG/WebP images have captions and Valid setup / Invalid setup / Management example types, ordering, confirmed removal and full-size zoom viewing. Pending uploads/removals can be retried/cleaned using the existing lifecycle approach. Examples are private and create no trades or P&L. Without configured screenshot storage, the text playbook still works and the existing README setup guidance is shown. No new storage provider, AI charts or shared private demo images are introduced.

Reviewed additive migration [0008_overconfident_wild_pack.sql](../drizzle/0008_overconfident_wild_pack.sql) creates owned strategies, immutable revisions, one-per-record assignments and private image metadata. Ownership is checked for strategies, revisions, plans, records, recovery, images and results; composite ownership foreign keys reinforce it. The migration was applied to the configured database with `npm.cmd run db:migrate -- --reviewed`. Review and apply it in other environments before running this version. No financial data reset is needed. Strategy mutations invalidate strategy/Trade View/Reports caches and retain dashboard/calendar financial caches; renaming a strategy never reprocesses broker data. Private caches remain session-scoped and clear on logout.

## Verification

The production build including TypeScript and scoped ESLint passed. The 21 existing Reports, Trade View and review-save/image-validation tests passed. One guarded disposable browser scenario passed create/rules/checklist → assignment/responses → results → archive/restore, failed-save writing retention, historical assignment/daily-plan preservation, explicit adoption/reset, ownership rejection, ordinary processing/identical reimport preservation, ambiguous regrouping/recovery, gross/net/complete versus portion semantics, strategy filtering and nonduplicated totals. Fixture selectors were corrected for PostgreSQL decimal formatting and a current assignment revision during the ownership check.

The playbook editor was visually inspected at 1440px and 390px in both themes without horizontal overflow. Synthetic captures remain ignored under `test-results/day-eleven-Day-11-owned-pl-5c9ba-s-and-ordinary-reprocessing/`. The post-cleanup read-only audit confirmed the original 75 source portions, 41 published groups, no pending processing and unchanged normalization against raw sources. Live S3 upload/view/removal, large-history performance, conflicting multi-assignment merge discard and all recovery UI interactions were not exercised end-to-end. The final recovery snapshot display, selective refresh and playbook return link received build/type/lint verification after the main browser flow.

Day 12 expenses, resets costs and payout tracking are not included.
