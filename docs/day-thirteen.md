# Day 13 — Progress Tracker

Open **Progress Tracker** in the existing navigation. This is a real-data personal overview across all owned accounts, including archived accounts. There is no account filter, score, profit inference, notification system, or duplicated journal/review workflow.

## Sources and denominators

- Preparation: checked items / all items in nonempty saved daily checklist snapshots. Show assessed days, saved entries without applicable checklists, and realized-activity days without a journal separately. An empty checklist is not 100%.
- Trade reviews: explicit `reviewed` status / current canonical journal records with final closes in the range. The implemented real processor publishes grouped closed portions, not verified flat-to-flat trades. Query each parent once; never add its raw portions again. Detached reviews awaiting reassignment do not contribute. Notes alone do not imply completion.
- Adherence: explicitly Followed / explicitly assessed eligible records. Partly followed, Did not follow, and Not assessed are separate. Existing trade-review assessments are used even when the review is still a draft. Daily adherence remains the separate personal Day View statement.
- Daily reviews: explicitly reviewed journals / union of saved journal dates and realized source-exit dates in the range. Deduplicate dates across accounts. Documented no-trade days qualify; unrecorded weekends do not.

Journal dates and checklist snapshots stay attached to their saved civil dates when preferences change. Record closes and realized exits use the current display timezone and its DST rules. This week respects the saved week start. Ranges support 1–366 days. Weekly trends sum numerators and denominators before calculating percentages; missing denominators create chart gaps. Heatmap cells expose counts/status through accessible links and tooltips and open the original Day View.

Recorded mistakes deduplicate each tag per eligible record. Total tagged-record counts can include draft reviews; the displayed share uses tagged **reviewed** records / all reviewed records. Equal-length prior-period rates require reviewed records in both periods and show percentage-point change plus both sample counts. Links use existing Trade View mistake, adherence, close-date, archive and review filters.

## Goals and manual habits

Automatic goals count fully completed nonempty preparation days, explicitly completed daily reviews, or explicitly reviewed canonical records. Every goal uses its own date window, independently of the dashboard filter. A review completed later can count toward the original entry/close date. These counts describe activity associated with those dates, not when the review button was pressed.

Custom habits have one saved check-in per goal/date with Done, Not done, or Not assessed and an optional 500-character note. Missing dates remain unrecorded. Future dates cannot be marked Done, using the current journal timezone. The goal preserves its creation timezone as archive/date context; date-only check-ins do not shift. Goals support create/edit/archive/unarchive, positive targets, optional descriptions, actual counts above target with visually capped bars, and Upcoming/Active/Achieved/Ended states. Archived goals remain viewable and retain their history. Changing a goal type requires a new goal. Window edits cannot discard existing check-ins. Concurrent stale edits return 409 and keep the browser draft.

There is a maximum of 200 saved goals including archived goals; each window supports up to 366 days. Tracker processing allows 50,000 projected canonical records, 5,000 saved daily entries / distinct realized dates, and 73,200 check-ins across the requested/prior/goal windows, with a 30-second database statement timeout. Exceeding a limit produces an explicit error, never partial metrics. Raw imports and review bodies are not sent to the tracker browser. No N+1 queries or external jobs are added.

Recent activity uses genuine saved update timestamps, accurately labeled as updates to currently completed reviews and habit check-ins. Existing reviews have no reliable first-completion timestamp; no completion instant is invented from `updated_at`. Items are associated with dates in the selected range and link to their original entries/records/goals.

## Persistence, privacy and backups

Reviewed additive migration: `drizzle/0010_windy_luminals.sql`. It creates only `process_goals` and `goal_checkins`, with an owner-qualified foreign key, per-goal/date unique index, ownership/window/time indexes and validation checks. The goal ownership index precedes its dependent foreign key in the reviewed SQL. It was applied to the configured development database. No deployment, schema reset, or infrastructure changes were performed. Other environments need the reviewed migration using:

```sh
npm run db:migrate -- --reviewed
```

Every read/mutation authorizes the current server session; check-ins authorize their parent goal and owner. Writes require the configured same origin. User ownership cannot be supplied by the client. Read data comes from one repeatable-read snapshot; writes serialize goal/check-in changes and use revisions. Responses are private/no-store. Shared private navigation caching retains the range, shows cached content during background refresh and invalidates progress after journal/review/import/goal mutations. Logout clears the cache.

Backup format **version 2** adds `data/process_goals.json` and `data/goal_checkins.json` with their IDs, revisions, owner-safe relationship, civil dates, timezone context and UTC timestamps. The generated catalog includes both and validates their references. No authentication credentials or sessions are added. See `manifest.json` and `MANIFEST.txt` for counts and conventions. **Keep this archive for your records. In-app restoration is not available yet.** It does not replace database-provider backups.

## Verification

Focused metric and archive safety checks cover missing denominators, weighted weekly counts, canonical-record/tag deduplication, explicit adherence, unioned dates, independent goal windows, future habit counts, civil dates/DST, backup categories/ownership and the unique check-in index. TypeScript and scoped lint are used rather than a full suite or production build.

Completed: **10 focused unit checks** across `tests/progress.test.ts` and `tests/exports.test.ts`, TypeScript (`tsc --noEmit`), scoped ESLint, and **one focused browser check**. No full suite or production build was run.

The browser check uses guarded disposable users and synthetic records to verify cross-user denial, stale/duplicate check-ins, future/window validation, canonical grouping with exits across two days, backup ZIP version/counts and actual UI saves/navigation. Screenshots cover desktop/mobile and light/dark themes; the visual pass led to page-spacing, compact heatmap-cell and dark native-date-input fixes. Synthetic fixtures were cleaned up; private archives are never committed.

The populated-data case caught and resolved raw-query timestamp conversion. Local verification also encountered the existing 5-per-minute signup rate limit and Next.js 16's development-asset origin restriction. No authentication policy was changed: verification let the rate window expire and ran the preview explicitly with `--hostname 127.0.0.1` to match the browser origin. The first Day View route compilation needed a longer navigation assertion window. The final focused browser run passed in about one minute.

Production deployment, physical mobile keyboards, and large-history load testing remain unverified. Existing Performance-only grouping is not verified complete-trade reconstruction. No restore interface or additional milestone was started.
