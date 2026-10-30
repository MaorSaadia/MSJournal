# Consistent workspace loading states

Shared presentation lives in `components/ui/loading.tsx` and `app/loading.css`.

- Initial requests and uncached selections use layout-specific skeletons. The workspace shell, available navigation and filters stay usable.
- Requests keep the existing owner/timezone/endpoint/query cache keys. A changed selection cannot inherit another selection's figures. Matching cached results remain immediately available; a same-selection refresh retains its content and shows Updating.
- Errors stop skeletons and retain existing retry controls. Empty results use the existing empty state.
- Route fallbacks cover the private workspace and nested account, trade, strategy and import pages. Local skeletons cover client requests, account options and dialog previews.
- Loading boundaries stay below the private layout. There is intentionally no root `app/loading.tsx`: a root fallback would replace the sidebar while the authenticated layout resolves. Navigation preserves the existing shell and its expanded/collapsed state; only main content shows placeholders.
- Page titles share responsive typography and proper edge spacing through `app/page-headers.css`. Route placeholders have page padding, and Dashboard's loading and loaded headers use the same inset and height.
- Saves, authentication, imports and downloads use the compact shared spinner. Existing submit guards and entered values remain intact.
- Skeletons are decorative, with a concise live status and busy state on their region. Shimmer runs every two seconds; content fades in briefly. Reduced motion removes shimmer, spinner rotation and reveal animation. No artificial delay or financial-value animation is added.

No dependencies, API endpoints, schema changes, cache changes or financial calculations are introduced. No setup or migration is required.

## Focused verification

- TypeScript without incremental cache; ESLint on changed modules and new route fallbacks.
- `tests/calendar-cache.test.ts`: owner/query isolation and matching cache behavior.
- `browser-tests/loading-states.spec.ts`: explicitly delayed localhost responses with disposable accounts; first load, selection changes, matching cache, same-query refresh, failure/retry, reduced motion and failed-save draft preservation. Screenshots cover Dashboard, Trade View, Calendar, Prop Account detail and account setup, with responsive layouts and light/dark themes.

Run the browser fixture only against a configured development database with `MSJOURNAL_TEST_DISPOSABLE=true`; it creates and removes its own test users. Screenshot artifacts are local and ignored by git. The full test suite and production build are deliberately outside this presentation-only check.
