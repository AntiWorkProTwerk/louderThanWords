**Yes—choose the architecture for the subscription service now. I would still use SvelteKit + TypeScript + MapLibre, but build it as a full-stack application that can initially be deployed statically—not as a disposable static prototype.**

SvelteKit supports static pages, server-rendered pages, backend endpoints, and client-side navigation in the same application. Its Cloudflare adapter supports deployment to both Workers and Pages. Adding accounts and subscriptions does not require replacing the frontend. ([Svelte][1])

The important design goal is:

> **Keep the interface lightweight and immediate, while moving data collection, expensive calculations, and access control behind it.**

## The stack I would choose for your actual product

| Area                         | My choice                                     | Role                                                       |
| ---------------------------- | --------------------------------------------- | ---------------------------------------------------------- |
| Application                  | **SvelteKit + TypeScript**                    | Website, application navigation, and backend endpoints     |
| Design and animation         | **Custom CSS + Bits UI + Svelte transitions** | Your visual style, accessible controls, animated panels    |
| Map                          | **MapLibre GL JS**                            | Geographic rendering and interaction                       |
| Interactive data fetching    | **TanStack Svelte Query**                     | Cache and manage data used throughout the explorer         |
| Production hosting           | **Cloudflare Workers + Static Assets**        | Serve static content and run the application’s backend     |
| Database and accounts        | **Supabase: PostgreSQL + Auth**               | Political records, accounts, saved items, preferences      |
| Geographic queries           | **PostGIS**, when needed                      | Query districts, boundaries, and locations                 |
| Files and published datasets | **Cloudflare R2**                             | Geographic tiles, prepared data files, raw source archives |
| Subscriptions                | **Stripe Checkout + Billing**                 | Subscription purchasing and lifecycle                      |
| Background processing        | **Trigger.dev**                               | Scheduled collection and transformation jobs               |

This is my recommendation for the combined requirements—not a claim that a framework benchmark has established a universal winner.

**The frontend choice stays the same between prototype and production. The data source and backend capabilities grow behind it.**

## 1. SvelteKit is not a compromise for the temporary static version

I would use three different rendering strategies within the same application:

**Public entry pages:** deliver useful HTML immediately, either generated ahead of time or rendered on the server.

**The interactive explorer:** once loaded, keep the map and application layout alive while selections, filters, and panels change.

**Account and subscription functionality:** use authenticated server endpoints for operations that require permissions.

SvelteKit explicitly supports mixing these strategies by route. It also reuses existing layouts and page components during client navigation, which is useful for preserving the map, sidebar scroll positions, and interface state. ([Svelte][1])

For your design, I would structure the explorer approximately like this:

```text
Persistent explorer layout
│
├── MapLibre instance — stays mounted
├── Actions/navigation — stays mounted
├── Selected state and filters
└── Detail panel
     ├── Politicians
     ├── Voting history
     ├── Donations
     └── Related bills
```

Opening a politician should **not** reconstruct the map, reload its geographic data, or reset the camera.

Adding a database later does not change that design.

## 2. The biggest performance decision: do not make every visitor trigger expensive calculations

Your eventual product should have **two separate processes**:

```text
DATA PREPARATION — happens independently of visitors

Sources → collection jobs → validation → database
                                            │
                                    prepare summaries
                                            │
                                   publish data and tiles


USER EXPERIENCE — serves already-prepared information

Browser → CDN → public data and map assets
       └→ authenticated API → private/premium/user data
```

For example, a visitor opening a politician’s profile should not cause the server to fetch their voting history from an outside source and calculate every statistic from scratch.

I would calculate commonly displayed summaries during processing and store the results. PostgreSQL supports materialized views—stored query results—for this sort of tradeoff: faster reads in exchange for explicitly refreshing the results. Ordinary summary tables are another implementation option. ([PostgreSQL][2])

**The database holds the underlying records. The browser receives a small, display-ready result.**

That is how I would design for many users without making every additional user repeat the same expensive work.

### Separate public, premium, and personal data

| Data                                          | Delivery approach I would use                                 |
| --------------------------------------------- | ------------------------------------------------------------- |
| Public geography and public summaries         | Versioned files or cacheable responses through the CDN        |
| Subscriber-only information                   | Authenticated endpoint that checks access before returning it |
| Saved politicians, preferences, private notes | User-specific API responses and database authorization        |

Do not turn the entire public map experience into an authenticated request just because the visitor has an account.

Equally, **do not publish premium data in a public JSON file and merely hide the button**. Access must be enforced where the data is delivered. Supabase’s row-level security can restrict database access to the appropriate users; that requires explicit policies and grants, not merely enabling authentication. ([Supabase][3])

Authenticated responses also need different caching rules. Supabase specifically warns that caching responses containing refreshed session cookies can expose one user’s session to another. Keep those responses out of shared caches. ([Supabase][4])

## 3. Updated data can still be delivered like static content

“Automatically updated” does **not** mean “must query the database on every request.”

My proposed publishing process would be:

```text
Job finishes successfully
        ↓
Write a new version of the affected dataset
        ↓
Validate it
        ↓
Publish the new version
        ↓
Update a small manifest identifying the latest version
```

An illustrative file layout:

```text
data/
  manifest.json
  releases/release-123/states/TX/summary.json
  releases/release-123/politicians/person-id.json
```

The versioned files can have long cache lifetimes because their contents never change. The small manifest gets a short cache lifetime or is revalidated. HTTP caching explicitly supports this immutable, versioned-resource pattern. ([MDN Web Docs][5])

I would also keep the current view on one consistent dataset version until a controlled refresh, rather than letting the map, cards, and totals accidentally show different releases.

**This means data jobs can publish new information without rebuilding and redeploying the entire website.**

For substantial geographic datasets, I would use prebuilt vector tiles, with PMTiles in R2 where appropriate. Protomaps documents R2 hosting and the necessary cross-origin/range-request configuration. ([Protomaps Docs][6])

Not everything should become a static file: arbitrary searches, personalized queries, and recently changed user data still belong behind the API.

## 4. How I would make switching between data feel immediate

This is where I would add **TanStack Svelte Query**, rather than using reactive variables as an improvised network cache. It has a supported Svelte integration and documented SvelteKit server-rendering integration. ([TanStack][7])

I would keep two kinds of state separate:

**Interface state:** selected politician, open panel, active tab, map selection. This stays in Svelte.

**Fetched data:** politician details, donation summaries, filtered results. This goes through the query layer.

My interaction design would be:

> Tap “Donations” → the tab responds immediately → show the cached matching result, or a stable loading placeholder → fetch anything missing without freezing the interface.

Important implementation requirements would include:

* Reuse recently fetched results, with freshness rules appropriate to each dataset.
* Preload likely next destinations, not every possible dataset.
* Cancel obsolete requests and prevent an old response from overwriting a newer selection.

SvelteKit supports preloading code and data on navigation intent, including hover and tap. I would use that selectively for likely destinations. ([Svelte][8])

I would also keep permission checks local to your backend’s subscription records. A normal tab switch should not require a fresh round trip to Stripe. Stripe’s subscription webhooks provide the events needed to maintain those records; handlers must verify signatures and tolerate duplicate or out-of-order delivery. ([Stripe Docs][9])

## 5. Scraping and transformation jobs should be a separate workload

For the production pipeline, I would use **Trigger.dev** to run scheduled jobs with retries and concurrency controls. Its documentation covers scheduled tasks and durable background execution. ([Trigger][10])

My proposed pipeline:

```text
Collect from API / bulk download / permitted scraping
                         ↓
Archive source response
                         ↓
Validate and normalize records
                         ↓
Insert or update PostgreSQL
                         ↓
Calculate affected summaries
                         ↓
Publish updated datasets
```

I would build these jobs with a few requirements from the beginning: safe reruns without duplicate records, incremental updates where possible, source-specific request limits, and validation before publication.

For this particular product, I would also preserve **source identifiers, source URLs, collection times, and transformation versions**. That gives you a way to explain a displayed number and investigate corrections.

**A failed collection job should leave the last valid published dataset available—not break the website.**

The job code can run manually on your machine initially. The scheduled production runner comes later; the collection and transformation logic does not need to be rewritten.

## 6. Map and animation performance remain a separate engineering problem

A scalable backend will not fix an overloaded phone GPU.

I would still start with **MapLibre alone**, using a deliberately simple map style and progressively more geographic detail as the user zooms. MapLibre’s performance guidance emphasizes reducing unnecessary properties, simplifying geometry, using vector tiles, clustering, and controlling detail by zoom level. ([MapLibre][11])

I would add deck.gl only when a particular visualization earns its complexity—not just because the eventual database is large.

For the website itself, **Bits UI supplies unstyled interactive components**, so you can build the bold design from your mockup without inheriting a generic dashboard appearance. Svelte supplies transitions such as fades, movement, and crossfades. ([Bits UI][12])

My animation rules would remain straightforward: favor `transform` and `opacity`, keep transitions interruptible, and avoid making users wait for an animation before they can act again. The first two properties are generally the best starting point for avoiding expensive layout and paint work. ([web.dev][13])

For mobile, I would retain the map-plus-bottom-sheet composition rather than shrink the desktop sidebars.

## 7. How to start without creating a rewrite later

| Build now                                       | Add when needed                             |
| ----------------------------------------------- | ------------------------------------------- |
| SvelteKit application and persistent map layout | Server endpoints and authenticated routes   |
| Async data-access functions reading static JSON | Implementations reading your API            |
| Stable IDs, shared data types, validation       | PostgreSQL schema and migrations            |
| Local collection/transformation scripts         | Scheduled production jobs                   |
| Small static geographic assets                  | Published tiles and R2 datasets             |
| Performance tests using representative data     | Real-user monitoring and backend load tests |

Do not scatter direct JSON imports through your UI components. Give components a stable way to request data—such as `getPolitician(id)`—and keep the underlying source replaceable.

For the eventual deployment, I would target **Cloudflare Workers with Static Assets and `adapter-cloudflare`**. Cloudflare documents this SvelteKit deployment directly. Your GitHub repository remains the source; the deployment target can change without replacing the application. ([Cloudflare Docs][14])

One backend detail matters: running code near the visitor is not automatically fastest when the database is far away. Measure the database-bound requests and use appropriate placement; Cloudflare supports placing Workers closer to backend services to reduce repeated network round trips. ([Cloudflare Docs][15])

## My final recommendation

**Use SvelteKit + MapLibre now, and grow it into a Cloudflare-hosted application with Supabase, R2, Stripe, and independently running data jobs.**

The central performance strategy is to **prepare expensive data ahead of time, deliver shared information through caches, preserve the running interface, and keep each interaction’s rendering work small**.

I would make release acceptance include real-phone map tests, rapid filter switching, repeated navigation, and memory stability—not just a loading score. Use the standard good Core Web Vitals thresholds—LCP ≤ 2.5 seconds, INP ≤ 200 milliseconds, CLS ≤ 0.1 at the 75th percentile—alongside a 60 fps interaction target on your chosen baseline devices. ([web.dev][16])

**This is one architecture for both stages. Accounts and subscriptions add backend capabilities; they should not force you to sacrifice the fast, fluid explorer you build first.**

[1]: https://svelte.dev/docs/kit/page-options "Page options • SvelteKit Docs"
[2]: https://www.postgresql.org/docs/current/rules-materializedviews.html "PostgreSQL: Documentation: 18: 39.3. Materialized Views"
[3]: https://supabase.com/docs/guides/database/postgres/row-level-security?utm_source=chatgpt.com "Row Level Security | Supabase Docs"
[4]: https://supabase.com/docs/guides/auth/server-side/advanced-guide "Advanced guide | Supabase Docs"
[5]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control "Cache-Control header - HTTP | MDN"
[6]: https://docs.protomaps.com/pmtiles/cloud-storage "Cloud Storage for PMTiles | Protomaps Docs"
[7]: https://tanstack.com/query/latest/docs/framework/svelte/overview "Overview | TanStack Query Svelte Docs"
[8]: https://svelte.dev/docs/kit/link-options?utm_source=chatgpt.com "Link options • SvelteKit Docs"
[9]: https://docs.stripe.com/billing/subscriptions/webhooks?utm_source=chatgpt.com "Using webhooks with subscriptions"
[10]: https://trigger.dev/docs/tasks/scheduled "Scheduled tasks (cron) - Trigger.dev"
[11]: https://maplibre.org/maplibre-gl-js/docs/guides/large-data/ "Optimising MapLibre Performance: Tips for Large GeoJSON Datasets - MapLibre GL JS"
[12]: https://bits-ui.com/docs/introduction "Introduction - Bits UI"
[13]: https://web.dev/articles/animations-guide "How to create high-performance CSS animations  |  Articles  |  web.dev"
[14]: https://developers.cloudflare.com/workers/framework-guides/web-apps/sveltekit/?utm_source=chatgpt.com "SvelteKit · Cloudflare Workers docs"
[15]: https://developers.cloudflare.com/workers/configuration/placement/ "Placement · Cloudflare Workers docs"
[16]: https://web.dev/articles/vitals "Web Vitals  |  Articles  |  web.dev"
