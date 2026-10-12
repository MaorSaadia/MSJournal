# Day 10 — Daily preparation and trading-day journal

Open **Start my day** on the real dashboard, or **Day View**, to resume today in your journal display timezone. Day View and Notebook share one personal entry per user/calendar date. Visiting an unsaved date creates no database entry. Notes apply across accounts; account filters affect only the accompanying current imported results.

Preparation includes focus, context/levels, setups, stay-out conditions, response to missed moves, readiness, mood, optional personal loss/trade limits, and a stopping rule. Planning currency is recorded separately; limits do not control trading or enforce prop rules. The editable default checklist is available in Notebook. Each saved entry retains its checklist text and unchecked initial state; changing defaults preserves earlier entries.

Session notes support optional timestamped observations about trades, missed moves or staying out. Event time uses the entry timezone, is restricted to its calendar date, and rejects nonexistent or repeated DST wall times. Created/updated timestamps remain separate. Optional record links are checked for ownership on the server and retain source provenance. Regrouped links can resolve to an equivalent record; unavailable links retain the observation text.

Daily review offers reflection, plan adherence, mood and an explicit **Mark day reviewed / Reopen daily review** action. Neither P&L nor checklist completion sets execution quality or completes individual trade reviews. “Chose not to trade” is a personal statement; if imported realized activity exists, the page displays both with a contextual notice.

Writing saves after a 900ms debounce, with Saving/Saved/Error states and **Save now**. Saves are serialized; later writing survives in-flight responses. Failed saves retain input. Server revisions reject conflicting edits; compare the saved version, then explicitly choose which version to keep. Navigation/unload prompts protect unsaved writing. These prompts are not a backup: confirmed discard, browser crashes and closing a tab without a successful save can lose unsaved text.

The saved calendar date and IANA timezone never shift when display preferences change. Existing entries use their retained timezone for results and observation times and disclose differences from preferences/calendar links. DST-aware local boundaries reuse the calendar calculations. Personal journal days remain separate from prop reset days.

The results panel reuses current calendar realized activity, including partial exits only for the selected day, closed-portion counts and gross P&L. Fees/net remain unavailable or estimated as appropriate. Links open existing trade details, reviews and screenshots; no trade writing is copied into notes. Account filters and archive inclusion follow the calendar. Existing trading accounts are USD; personal planning currencies do not convert or combine trading results. “No imported realized activity” is not evidence that no trading occurred. Imports, regrouping or archive operations do not rewrite daily writing.

Notebook searches all matching owned daily writing on the server, including preparation, session observations and reflection, with date/status filters and 20-entry pagination. Calendar days show a violet **D** indicator distinct from trade reviews, and day details open the same journal with account/date scope and return navigation. Note saves invalidate Notebook/note indicators without rebuilding cached financial results.

## Migration

Reviewed additive migration [0007_melted_talos.sql](../drizzle/0007_melted_talos.sql) creates `daily_entries` and `daily_templates`, with ownership foreign keys and a unique user/date index. It was applied to the configured database using `npm.cmd run db:migrate -- --reviewed`. Other environments must review and apply it before running this version. No financial history reset or private-data rewrite is needed.

## Verification

Production build including TypeScript and scoped ESLint passed. The 18 existing autosave/calendar/cache tests passed. One guarded disposable browser flow passed preparation → save → observation → review → Notebook reopening, failed-save retention, navigation protection, stale-revision conflict comparison, cross-user record-link rejection, retained timezone results after a preference change, new-import preservation, and historical checklist preservation after default changes. The first browser attempt needed its alert selector scoped to exclude Next.js's route announcer; the corrected flow passed.

Day View captures were inspected in both themes at 1440px and 390px without horizontal overflow. The final surrounding page inset and concise calendar/dashboard link labels were adjusted afterward; those cosmetic edits were not separately recaptured. Synthetic captures remain ignored in `test-results/day-ten-Daily-preparation--8b8f9-vations-review-and-Notebook/`. After cleanup, the read-only audit found the original 75 portions and 41 published groups with no pending processing and normalized values matching preserved raw sources. Large-dataset Notebook pagination and unusual browser-history edge cases were not exercised. No deployment, AI writing, events integration, screenshot infrastructure, prop enforcement, or Day 11 strategy/playbook work is included.
