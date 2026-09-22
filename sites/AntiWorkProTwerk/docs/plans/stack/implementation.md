# Civic explorer implementation

The reference design is preserved in commit `2f88438`. The active implementation follows `plans/responsive-stack.md` with dummy political data and real geographic boundaries. The public app does not require paid services or credentials.

## Implemented

- SvelteKit 2 / Svelte 5 / TypeScript; public HTML is prerendered. The explorer lives in the persistent root layout.
- MapLibre, with real US Census state boundaries and Natural Earth countries, local map workers, zoom/pan controls, Alaska/Hawaii views, and state selection. Map instance and camera survive panel navigation. A geographic SVG fallback and state selector remain available without WebGL.
- The original desktop actions/map/cards layout; on phones, a full map with an expandable bottom sheet and compact actions menu.
- Bits UI accessible detail dialogs, keyboard navigation, focus restoration, reduced-motion support, stable loading/error/empty states, and Svelte transitions.
- State, search, party filter, person, and panel in the URL; back/forward navigation. TanStack Svelte Query caches versioned records, prefetches a profile on intent, aborts obsolete requests, and shares fetched results across tabs.
- Validated data-access functions, stable IDs, immutable releases, provenance, atomic manifest promotion, and a controlled refresh when a new release is available. Public data never contains private notes or premium analysis.
- On-device saved representatives and notes in demo mode. When Supabase is configured, signed-in users use private account APIs and row-level security.
- Supabase migration for public records, sources, votes, donation summaries, saved items, preferences, subscription records, premium analysis, and precomputed statistics.
- Server-authenticated account, saved-item, preference, premium, Stripe Checkout, billing portal, and signature-verified webhook endpoints. Subscriber checks use local subscription records, not Stripe requests on tab changes. Webhook processing deduplicates events and rejects older state updates transactionally.
- Local deterministic data preparation, an allowlisted conditional-fetch collector, source archives, an R2/Supabase publishing function, and a scheduled Trigger.dev task with retries and concurrency one. Failed preparation does not promote the manifest.
- Shared deployment through the repository Worker and static assets, plus an optional `adapter-cloudflare` build. All shared paths and site handlers come from the root registry.

## Local commands

From this site directory:

```sh
npm run dev
npm run data:prepare
npm run check
npm test
npm run test:browser
npm run build:cloudflare
```

The browser checks expect the development server at `http://127.0.0.1:5173`. On Windows they use installed Edge; elsewhere install Chromium with `npx playwright install chromium`. `TEST_BASE_URL` and `PLAYWRIGHT_CHANNEL` can override these choices.

From the repository root, `npm run check` builds every present, registered site. `npm run preview` serves the assembled portal, assets, and APIs.

## Services that require configuration

No hosted account, payment, database, or scheduling setup has been performed automatically. The code is present; live integration acceptance requires these accounts and credentials:

1. Create a Supabase project and apply `supabase/migrations/001_civic_foundation.sql`. Add the site URL to Auth's redirect allowlist. Use `.env.example` for local keys; for the shared Worker use the username-prefixed secret names described in the root README.
2. In Stripe **test mode**, create a recurring price and configure a webhook at the site's `/api/billing/webhook`. Subscribe to checkout completion and customer subscription events. Set the Stripe secret key, webhook secret, price ID, and exact public app URL. Test Checkout, cancellation, portal access, renewal, expiration, and duplicate delivery before using live keys. Premium records must be inserted into the protected table; this demo does not invent paid content.
3. Bind an R2 bucket as `<USERNAME>__DATA` to serve published datasets. Configure the publishing credentials separately in the job environment. `ALLOW_DEMO_PUBLISH=true` is an explicit guard for remote publication of the bundled dummy records. Keep raw archives outside public `data/` and `tiles/` prefixes.
4. Create a Trigger.dev project, set `TRIGGER_PROJECT_ID`, supply the job's R2/Supabase credentials, and deploy its scheduled task. Do not enable the demo job against a production dataset.

The default static adapter omits SvelteKit API route files because the shared Worker runs the exact same handler through `server.ts`. Do not deploy the static output alone and expect accounts to work. The alternative Cloudflare adapter bundles SvelteKit's server routes into its own Worker.

## Explicitly deferred by the plan

PostGIS, district queries, PMTiles/vector tile publication, deck.gl, and real source-specific political ingestion are additions for when the data requires them. Current state-level geometry is small enough for local GeoJSON. The generic collector archives an approved source; each real source still needs a validated normalization mapping before it can replace the demo fixtures. Remote publishing is intended to run with concurrency one; overlapping publishers are not supported.

## Verification and performance acceptance

Automated coverage includes release determinism, failed publication, schema validation, data version checks, private API authorization, webhook signatures, actual PostgreSQL row-level security (PGlite), subscription replay/ordering, routing for all three registered sites, isolated site credentials, map persistence, rapid state changes, cache reuse, notes, and phone layout.

Browser tests use desktop Chromium/Edge, including phone-sized viewports. They are **not real-phone measurements**. Release acceptance still requires physical baseline devices and production field measurements: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 at p75, and a 60 fps interaction target. The MapLibre renderer is a large, lazily loaded chunk; its worker is bundled separately. Performance samples in `tests/browser/performance.spec.ts` are laboratory diagnostics, not guarantees of those field thresholds.

## Sources

- [SvelteKit static rendering](https://svelte.dev/docs/kit/adapter-static), [Cloudflare adapter](https://svelte.dev/docs/kit/adapter-cloudflare)
- [TanStack Svelte Query](https://tanstack.com/query/latest/docs/framework/svelte/overview), [Bits UI Dialog](https://bits-ui.com/docs/components/dialog)
- [MapLibre](https://maplibre.org/maplibre-gl-js/docs/), [US Atlas](https://github.com/topojson/us-atlas), [World Atlas](https://github.com/topojson/world-atlas)
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security), [Stripe webhook signatures](https://docs.stripe.com/webhooks/signature)
