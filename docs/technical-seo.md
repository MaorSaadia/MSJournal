# Technical SEO and social sharing milestone

## Route audit

| Route | Access and indexing |
| --- | --- |
| `/` signed out | Server-rendered public landing; production-only indexing; self-canonical |
| `/` signed in | Existing private Dashboard, sidebar, filters and caches; noindex; no canonical or JSON-LD; private/no-store |
| `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email` | Auth screens with unique metadata, self-canonicals and noindex headers/metadata; excluded from sitemap |
| `/calendar`, `/day-view`, `/trade-view/**`, `/notebook`, `/reports`, `/strategies/**`, `/progress-tracker`, `/prop-accounts/**`, `/settings`, `/imports/**`, `/fees`, `/welcome` | Existing server authorization; noindex layout/header; excluded from sitemap |
| `/api/**` | Existing endpoint authorization; noindex header and robots disallow |
| `/opengraph-image`, `/icon.svg`, `/apple-icon.png` | Public product branding only, no account data |
| `/robots.txt`, `/sitemap.xml` | Public metadata routes; sitemap contains only `/` in production |
| Unknown paths | Genuine 404, including nested unknown paths; noindex |

No existing public marketing, legal, pricing, billing or checkout pages were found. The unused private `[section]` placeholder was removed: every navigation entry already has a concrete route, and this placeholder caused unknown signed-out paths to redirect to login rather than return 404. Dashboard code and its shell were extracted without changing calculations, ownership, imports, query parameters or selection behavior. Root remains inside the shared workspace route group so its client cache, filters and navigation state persist when navigating to other private pages. `proxy.ts` overwrites a request-path header; the layout permits anonymous content only for `/` and requires an authoritative session everywhere else. This header never replaces endpoint/page ownership checks. Root session lookup is request-memoized for metadata and rendering; session failures remain errors instead of exposing a private dashboard.

The landing describes implemented CSV imports, fees, analytics, calendars, reviews, screenshots, configurable prop progress and archives. Workflow illustrations contain no fabricated financial results, testimonials, pricing or partnerships. Prop progress is distinguished from official firm compliance. There is no broker synchronization or guaranteed outcome claim.

## Configuration and implementation

Set these **server-only** variables in Vercel ׳’ג€ ג€™ project ׳’ג€ ג€™ Settings ׳’ג€ ג€™ Environment Variables, then redeploy when ready:

- `SITE_URL=https://ms-journal.vercel.app`: stable production HTTPS origin, also the fallback when omitted. Rejects paths, ports, credentials, queries, fragments, localhost and IPv4 literals. Never set this to a preview hostname. Local authentication still uses its own local `BETTER_AUTH_URL`.
- `GOOGLE_SITE_VERIFICATION`: optional **content value only** from the Google HTML verification tag. Omission is valid. This is public verification information, not analytics or a secret.

`lib/seo.ts` centralizes canonical, sharing, JSON-LD and sitemap URL construction, without request hosts or `VERCEL_URL`. Vercel `VERCEL_ENV=production` enables public indexing. Preview/development deployments and local development return noindex headers and metadata. For standalone hosting, `NODE_ENV=production` with no `VERCEL_ENV` enables production behavior. Explicit `VERCEL_ENV=preview` wins over production Node mode. Do not override Vercel's deployment environment to make previews indexable.

Root metadata supplies language, local Geist fonts, application name, metadataBase, title template, default noindex, sharing metadata and optional verification. Only signed-out production `/` opts into indexing. It has its own canonical; other pages do not inherit that canonical. Signed-in `/` is dynamic and not publicly cached. Auth and private document headers remain noindex even for redirects. Private metadata/images contain only generic product information.

The public ImageResponse PNG is 1200ײ³ג€”630, using existing logo paths and emerald/violet branding. Twitter/X uses a large-image card with the same PNG. The existing SVG favicon is retained; Apple touch icon is 180ײ³ג€”180, generated from it with existing Sharp tooling. The public page has semantic headings/landmarks, a keyboard skip link, crawlable links, explicit icon dimensions, static server-rendered content and reduced-motion-aware controls. No fake dashboard metrics, external image/font requests, trackers, new dependencies or cookie banner.

Robots allows documents to be crawled so their noindex can be read, and permits rendering assets. Only APIs are disallowed. Robots and noindex never replace authorization. Sitemap has no invented `lastmod`, priority or frequency. Private, auth, parameter variants, demo and nonexistent pages are excluded. New real public pages must get their own metadata/canonical, an explicit sitemap entry, and an intentional exception to the non-root noindex header in `next.config.ts`.

## Exact manual Search Console steps

**Not performed:** no Google account access, property verification, sitemap submission or deployment took place during repository implementation.

1. Deploy this revision to production when ready. Open [Google Search Console](https://search.google.com/search-console/) using your Google account and choose **Add property** in the property selector.
2. Select **URL prefix** and enter `https://ms-journal.vercel.app/`. Do not choose a Domain property for `vercel.app`, which you do not own.
3. In verification options select **HTML tag**. Copy only the string inside `content="..."` in its `<meta name="google-site-verification" ...>` tag.
4. Add `GOOGLE_SITE_VERIFICATION` with that value to the Vercel project's **Production** environment. Set `SITE_URL=https://ms-journal.vercel.app`. Redeploy production.
5. Visit the homepage signed out and view source. Confirm the verification tag, canonical `https://ms-journal.vercel.app/`, `index, follow`, HTTP 200 and no noindex response header. Ensure production deployment protection does not prevent public access to the landing or metadata assets. Keep previews non-indexable/protected.
6. Return to Search Console and click **Verify**. Retain the token because ownership can be rechecked.
7. Open **Sitemaps**, submit `https://ms-journal.vercel.app/sitemap.xml` (or just `sitemap.xml` if the prefix is already shown), and check fetch status.
8. Open **URL inspection** for `https://ms-journal.vercel.app/`, run **Test live URL**, check accessibility/indexability and canonical, then select **Request indexing** when available.
9. Monitor **Page indexing**, **Sitemaps**, **Security issues** and **Manual actions**. Investigate public noindex, server/fetch errors and canonical mismatches. Private/auth noindex and unknown-path 404s are intentional. Reports take time; submissions do not guarantee indexing or rankings.

Search Console is separate from analytics; no tracking script is required.

Official sources: [properties](https://support.google.com/webmasters/answer/34592?hl=en), [HTML-tag verification](https://support.google.com/webmasters/answer/9008080?hl=en), [sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), [URL inspection](https://support.google.com/webmasters/answer/9012289/).

## Future purchased-domain migration

No redirect to an unpurchased domain is configured.

1. Add the purchased domain in **Vercel ׳’ג€ ג€™ Settings ׳’ג€ ג€™ Domains**, apply the displayed DNS records and verify HTTPS. Pick one canonical www/apex hostname. Keep the old production hostname operational.
2. Change Production `SITE_URL` to the new HTTPS origin. Update `BETTER_AUTH_URL` to the same exact app origin; existing auth and mutation checks permit only that origin. Review email verification/recovery callback URLs, configured storage CORS and any actual external integration callbacks. Keep private buckets private and avoid wildcard trusted origins. There is no Tradovate API integration to migrate.
3. Verify the new URL-prefix property (or a DNS Domain property for the domain you own) in Search Console. Update the optional meta token when appropriate. Preserve ownership of the old property through a suitable verification method while migrating.
4. Redeploy and test new-origin sign-in/out, email recovery/verification, imports and private screenshots before activating redirects. Cookies are host scoped: existing users may need to sign in again. Validate old emailed links with disposable accounts; active callbacks are not guaranteed to transfer across hosts.
5. Configure **one host-specific permanent redirect**, only from `ms-journal.vercel.app` to the new canonical host. Use Vercel's domain redirection, or later a Next redirect with `source: "/:path*"`, `has: [{ type: "host", value: "ms-journal.vercel.app" }]`, destination `https://YOUR-PURCHASED-HOST/:path*`, and `permanent: true`. Next forwards query strings unless replaced. Do not use a global redirect that catches the destination host, localhost or previews. Avoid competing application/domain redirects.
6. Check that old `/`, `/login`, a private deep link and an inert query string redirect once to the matching new path/query without loops. Test actual verification/recovery callbacks. Old browser API clients may require a new-origin sign-in because strict mutation-origin enforcement is intentional; do not weaken it to accommodate stale sessions.
7. Confirm all canonicals, sharing, JSON-LD, sitemap and robots URLs use the new host. Recheck public production headers, submit the new sitemap and inspect the new homepage.
8. In the old Search Console property use **Settings ׳’ג€ ג€™ Change of address** if supported for your properties, completing verification for both and the tool's checks. Keep permanent redirects and monitor both properties; Google recommends retaining redirects for at least a year.

Official sources: [Vercel domains/redirection](https://vercel.com/docs/domains/working-with-domains/deploying-and-redirecting), [Google site moves](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes), [Change of Address](https://support.google.com/webmasters/answer/9370220).

## Focused verification and setup

- `tests/seo.test.ts`: validated origins, safe JSON-LD, production/preview indexing and sitemap exclusion.
- `browser-tests/seo.spec.ts`: SSR content/metadata, sharing image type/dimensions, icons, sitemap/robots, auth noindex, private authorization, genuine 404s, keyboard access, desktop/mobile in both themes, optional disposable signed-in Dashboard and cross-session cache isolation.
- Use `MSJOURNAL_SEO_PRODUCTION=true` against a local production server. The auth browser check additionally requires `MSJOURNAL_TEST_DISPOSABLE=true`, configured development database/auth and email verification disabled; it cleans only synthetic fixture users.
- Scoped lint/type checks and one production build validate generated metadata routes. No full test suite or deployment.

No database migration or external infrastructure is required. Google ownership, sitemap submission and live checks remain manual follow-up after deployment.

### Completed checks

The final production build and TypeScript check passed, along with scoped lint and all three SEO unit tests. Public production browser checks passed for rendered metadata, root canonical normalization, production indexing, sitemap/robots, sharing PNG dimensions, icons, auth noindex, anonymous private-route/API rejection, a forged path header, and genuine 404s. The disposable authenticated production check passed for Dashboard preservation, no private canonical/JSON-LD, independent anonymous HTML, and Dashboard → Calendar → Dashboard filter persistence. Desktop/mobile captures in both themes and the sharing image were visually reviewed. Production root responses were confirmed `private, no-cache, no-store`.

Local development had stale generated route/cache artifacts and slow filesystem writes. Its generated Turbopack cache was preserved under `.next/dev/cache/turbopack-seo-prior-*` and refreshed; the Calendar route responded normally afterward. No source data was removed. Public visual artifacts are under ignored `artifacts/seo/`. Temporary production verification servers were stopped; regular development remains on port 3000.

For a local **production-mode** authenticated browser check only, the temporary server must have a valid non-localhost `BETTER_AUTH_URL` (the app intentionally rejects localhost in production). `MSJOURNAL_TEST_AUTH_ORIGIN` lets the fixture send that configured Origin to the local test endpoint. This is not a deployment setting, does not bypass origin validation, and is unnecessary for normal development-mode tests. Use disposable accounts and the development database only.


## Book companion extension

The Book Companion milestone adds public `/book` and four current `/book/[slug]` HTML pages to the sitemap, with unique canonical/sharing metadata. The non-root noindex header explicitly exempts book HTML. `/book/downloads/**` remains noindex, and `/worksheets/**` plus worksheet APIs and completed prints remain authenticated/non-indexable/private. This supersedes the earlier homepage-only coverage above. See [the companion guide](book-companion.md). No Google account actions or deployment happened automatically.

The simplified edition publishes only its four descriptive worksheet slugs in the sitemap. Known prior-edition public slugs render noindex retirement pages, preserving meaningful navigation without redirecting unrelated worksheets. Saved entries and revision-print routes retain their existing privacy controls.
