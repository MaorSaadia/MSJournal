# Trading Books

Public editorial catalog for Maor Saadia's books. This is separate from `/book`; all four companion worksheets, guest use, saved entries and downloads are unchanged.

## Routes

- `/books` — all nine entries; category navigation uses crawlable URLs (`?category=foundations`, `strategies`, `psychology`) and works without JavaScript.
- `/books/day-trading-for-absolute-beginners`
- `/books/smart-money-simplified`
- `/books/the-ict-playbook`
- `/books/the-modern-ict-traders-masterclass`
- `/books/the-institutional-ict-codex`
- `/books/the-disciplined-edge`
- `/books/the-institutional-operator-book-1`
- `/books/the-institutional-operator-book-2`
- `/books/the-consistent-day-trader`

The first eight entries use the supplied descriptions and artwork. The ninth connects the existing Consistent Day Trader companion. Its introduction uses existing companion facts; no manuscript was copied into public assets. The 3-in-1 Masterclass explicitly identifies its three constituent books. No overlap between other titles is inferred.

## Add Amazon links

The eight supplied Amazon product links are configured. The Consistent Day Trader remains unset until its link is supplied.

Edit **`lib/books/catalog.ts`**, find the entry by its `id` or `slug`, and replace its empty **`amazonUrl`**:

```ts
id: "absolute-beginners",
// ...
amazonUrl: "https://www.amazon.com/dp/YOUR_BOOK_ASIN",
```

| Book | Stable ID |
| --- | --- |
| Day Trading For Absolute Beginners | `absolute-beginners` |
| Smart Money, Simplified | `smart-money` |
| THE ICT PLAYBOOK | `ict-playbook` |
| The Modern ICT Trader's Masterclass | `masterclass` |
| THE INSTITUTIONAL ICT CODEX | `ict-codex` |
| The Disciplined Edge | `disciplined-edge` |
| The Institutional Operator — Book 1 | `operator-1` |
| The Institutional Operator — Book 2 | `operator-2` |
| The Consistent Day Trader | `consistent-day-trader` |

This automatically enables **View on Amazon** on the detail page and any catalog/featured card for that entry. No other component needs editing. HTTPS Amazon storefront domains and `amzn.to` are accepted; credentials, lookalike hosts and non-Amazon destinations are rejected. Blank or invalid links render no purchase action. Changes to static pages need the normal rebuild when eventually deployed; this task does not deploy.

The same typed catalog owns descriptions, audience, highlights, category, order, featured state, related titles, cover metadata and optional `companionHref`. Keep titles/subtitles exact. Do not add prices, offers, ratings or publication facts without a real source.

## Covers

Eight optimized front-cover WebPs are in `public/books/` (about 39–128 KB each). They preserve the supplied art, aspect ratios and complete front covers. No manuscripts, full print wraps or back covers are published. Dimensions are stored in each catalog entry and Next Image supplies responsive sizes. The cover-to-title contact sheet is a private local artifact at `artifacts/books/cover-contact-sheet.png`.

**Missing supplied asset:** The Consistent Day Trader front cover. Its entry intentionally has `cover: null` and uses a restrained title treatment. To add an approved front cover later, optimize it under `public/books/` and set that entry's `cover` to `{path, alt, width, height}`. Do not substitute an old edition or generate replacement cover text.

Local reproduction tool (reads only specific selected front-cover images):

```powershell
node node_modules/tsx/dist/cli.mjs scripts/prepare-trading-book-covers.ts 'PATH_TO_LOCAL_BOOK_ASSET_DIRECTORIES'
```

Raw artwork stays outside the repository. Private artifacts and captures are ignored by Git.

## Integration and SEO

The public navigation and footer link to Trading Books. The signed-out homepage includes three compact featured cards. The companion landing page introduces The Consistent Day Trader with a link back to its book page; purchase is never required for worksheets. There is no promotion added to private journaling flows.

Book HTML and initial covers are server-rendered. Motion enhances entrances and category changes; CSS handles gentle card/cover feedback. Reduced motion disables movement and content remains usable without JavaScript. Category links are native navigation links with `aria-current`, not an inaccessible tab imitation.

`lib/books/seo.ts` reuses canonical-origin and deployment-indexing rules. Detail pages have book-specific social metadata and factual Book JSON-LD without ISBNs, publication dates, reviews or offers. Catalog/detail routes are included in the production sitemap. `next.config.ts` explicitly permits both `/book` and `/books` through public HTML indexing policy while preserving private/API noindex rules. Unknown book slugs return not found.

## Focused verification

- `tests/trading-books.test.ts`: catalog IDs, related/collection references, cover dimensions and sizes, Amazon destination validation, metadata and factual structured data.
- `browser-tests/trading-books.spec.ts`: category/keyboard navigation, desktop/mobile in both themes, cover proportions, missing purchase actions, collection overlap, companion links, all detail HTML routes, invalid-slug 404, no-JavaScript catalog filtering and homepage links.
- Scoped ESLint and TypeScript; no full test suite, schema migration, payment infrastructure or deployment.
