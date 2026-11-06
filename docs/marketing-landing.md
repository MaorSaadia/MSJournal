# Premium public landing page

The signed-out homepage uses charcoal/emerald styling, a matching light theme, a server-rendered hero and four current product captures. Existing theme preferences, authentication destinations, metadata, structured data and signed-in Dashboard behavior remain intact.

## Product assets

`public/marketing/` contains 22 optimized WebP images: four gallery screens, each with full/mobile compositions in light/dark themes, plus six complete feature thumbnails (Calendar, Trade Review and Prop Accounts in both themes). The repeated Dashboard feature was replaced by Calendar; Dashboard remains the initial top-gallery preview. Only the selected gallery variant is rendered. The initial Dashboard picture is eager/high priority. Other full captures load on selection or intent; feature thumbnails load lazily. Full-size viewers follow the active theme too.

The shared native-picture component follows OS appearance during SSR/no-JavaScript rendering, then the app's resolved saved/manual theme after hydration. It selects one viewport/theme asset rather than loading duplicate hidden images. Screenshot frames and controls also follow the page theme. Light images are fresh captures of the actual light application, including a locally generated light chart; no CSS inversion or image recoloring is used.

All screens come from the actual application, using one disposable account named **Demo Trader**, a fictional **Evergreen Evaluation**, 22 mixed winning/losing trades, recorded fees, a configured starting balance and custom evaluation rules. Trade notes are saved through the normal review API. The chart image is an original local SVG converted to PNG and supplied through capture-only screenshot request interception; no chart vendor, private screenshot or object storage is involved. No runtime mock data or public demo endpoint was added.

Every showcase/feature area identifies the figures as illustrative. Existing artifacts were composition references, not published screenshots. Raw captures and QA images live in ignored `artifacts/marketing/`. Image processing strips source metadata. Disposable users and their associated records are removed with the existing guarded fixture cleanup.

To intentionally regenerate images against the local development server, with disposable signup available:

```powershell
$env:MSJOURNAL_BROWSER_ORIGIN='http://localhost:3000'
$env:MSJOURNAL_CAPTURE_MARKETING='true'
node node_modules/@playwright/test/cli.js test browser-tests/marketing-capture.spec.ts --workers=1
node node_modules/tsx/dist/cli.mjs scripts/marketing-feature-images.ts
```

The capture scenario skips without its explicit flag. Do not change production authentication settings to run it. Inspect all regenerated images before publishing: current labels, consistent amounts, both gains/losses, visible notes and no personal details or development overlays.

## Interaction and rendering

The main copy remains a server component. Small client islands handle entrance/section motion, bounded desktop scroll depth, native mobile disclosure navigation, accessible preview tabs and a Radix screenshot dialog. Arrow keys/Home/End select tabs; Escape closes the dialog or navigation; the screenshot dialog returns focus to its opener. No autoplay, infinite effects, video, scroll locking or animated financial figures were introduced. Ordinary modal focus trapping/scroll containment uses the existing dialog component.

Motion uses the installed Motion package, runs once for entrances/reveals and is disabled for reduced motion. Preview depth also turns off below 900px and for coarse pointers. Animation cleanup restores final readable content. All primary copy and the first product preview are useful without JavaScript; the native mobile menu remains operable.

Anonymous `/` rendering now returns Landing directly from the existing workspace layout, before its private page loading boundary. This prevents a no-JavaScript visitor from remaining on a streamed Dashboard fallback. Authoritative session checks, signed-in cache/shell placement, proxy header handling and all private-route protection are unchanged.

## Checks and delivery

Focused browser checks cover four preview tabs, delayed full-image loading, keyboard viewer/focus return, mobile disclosure, both themes at 1440/390 widths, no horizontal overflow, reduced/normal motion, no-JavaScript content, existing SEO metadata and signed-in Dashboard/account-isolation behavior. Scoped lint and TypeScript are the source gates. Visual artifacts are ignored. No full suite, schema migration, new dependency, production build or deployment is required by this change.

Local cold Turbopack compilation stalled during capture on the slow filesystem. The local verification server was restarted with `next dev --webpack --port 3000`; capture then completed. The app's normal npm scripts were not changed.

Completed verification: five focused marketing/SEO browser scenarios passed, the explicit asset-capture scenario passed and cleaned up its disposable account, all three SEO unit tests passed, and scoped ESLint/TypeScript passed. Desktop and mobile layouts were visually inspected in both themes. A final feature-framing refinement was rechecked with the focused preview scenario. No production build, full suite or deployment was run.

The feature section was refined into three alternating editorial rows. Copy and screenshots have separate layouts, complete image proportions, consistent framed previews and optional full-size viewers. There are no forced heights, offset screenshots or cropped screenshots in these rows. The gallery retains its tighter mobile compositions. Preview controls are disabled until their client handlers are ready, while the initial image and copy remain readable without JavaScript. Focused browser checks verify natural image ratios, viewer focus return, both themes and responsive layouts.

Theme verification: the focused theme scenario checks all four gallery screens, all three features, enlarged views and mobile sources using the actual Appearance control. The refreshed capture scenario created both themes from one disposable account and cleaned it up. Scoped lint/TypeScript and the landing interaction/no-JavaScript checks are retained.
