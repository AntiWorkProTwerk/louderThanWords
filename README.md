# Louder Than Words

A shared repository of independent websites deployed together at [louderthanwords.fyi](https://louderthanwords.fyi/).

Each collaborator owns a complete site. [sites.config.json](sites.config.json) is the single registry of usernames, the default development site, and the shared domain:

```text
sites/
└── <username>/  →  louderthanwords.fyi/<username>/
```

Sites may use different designs, dependencies, and code. The build generates the root portal from the registry. Registered sites without a folder show “Coming soon”; no placeholder app is created inside a coworker’s folder.

## Work on your site

Requirements: Node.js 22.12+ (Node.js 24 recommended) and Git.

```sh
git clone <repository-url>
cd louderThanWords
npm ci
git switch -c your-name/short-description
```

Run the default site, or choose any registered username:

```sh
npm run dev
npm run dev -- <username>
```

The default comes from `sites.config.json`. Extra Vite options can follow the username. Check the complete deployment before pushing:

```sh
npm run check
npm run preview
```

`npm run preview` runs the assembled site through the local Cloudflare Worker. Open the URL Wrangler prints and include `/<username>/`.

## Add a teammate’s site

1. Copy an existing folder under `sites/` and rename it to the teammate’s GitHub username.
2. Give its `package.json` a unique package name.
3. Register the username in `sites.config.json` if it is not already listed.
4. Make its build output and base path match its registered public path. Node-based configs can import `siteForDirectory` from `scripts/site-registry.mjs` to derive both from their own directory.
5. Run `npm run sites:sync` to regenerate `CODEOWNERS` and the Worker handler imports. Builds and preview startup also refresh handler imports.

Every site must build into `dist/GitHubUsername/`. Never commit `dist/`; the combined build creates it automatically.

## Optional backend for any site

Every registered site gets the same `/<username>/api/*` routing. To add a backend, create `sites/<username>/server.ts` (or `server.js`) exporting:

```ts
export async function handleApi(request: Request, env: Record<string, unknown>, path: string) {
  return Response.json({ path });
}
```

Run `npm run sites:sync` and restart the shared preview when adding a new entry file. Existing handlers hot reload. A site without an entry keeps its static pages and returns a JSON 404 for API requests. Coworkers do not need to modify `worker/index.js` or adopt SvelteKit.

Worker secrets and bindings are isolated by site: prefix their names with the uppercase username (replace hyphens with underscores), followed by `__`. For example, `<USERNAME>__SUPABASE_URL` is delivered to that site's handler as `SUPABASE_URL`. Unprefixed secrets and other sites' secrets are not forwarded. A site-local dev server can use unprefixed variables in its own ignored `.env` file.

The existing shared `/api/civic/cache` endpoint is preserved separately and continues using the root `DB` binding. It is not a private account API and must not store private or premium data.

An optional `<USERNAME>__DATA` R2 bucket binding serves that site's `/data/*` and `/tiles/*` paths, including HTTP range requests. Without it, the shipped static dataset is used. Public dataset files are cacheable; account handlers must return `Cache-Control: private, no-store`. The shared worker runs before assets so configured R2 releases can supersede bundled data without rebuilding the frontend.

Keep backend migrations, credentials, and dependencies in the owning site. The first site's `docs/implementation.md` describes the civic explorer integrations and acceptance checks.

## Pull requests and ownership

1. Work only on a feature branch—not `main`.
2. Run `npm run check` and push the branch.
3. Open a pull request into `main`.
4. Open the Cloudflare preview URL posted on the pull request. The preview contains every site at its normal path.
5. Get at least one approval and any required site-owner approval.
6. Merge the pull request. Cloudflare then builds and deploys `main` to production.

`main` is protected. GitHub requires a pull request, one approving review, successful GitHub and Cloudflare checks, and resolved conversations. New commits dismiss earlier approvals. These rules also apply to repository administrators.

Git cannot stop someone from editing another person’s folder on their feature branch. Once teammates are added, each site should list both its owner and a backup reviewer in `CODEOWNERS`; required code-owner reviews can then prevent that change from merging without an authorized site reviewer. Two owners are necessary because GitHub does not allow a pull request author to approve their own work.

## Automatic deployment

Cloudflare Workers Builds uses:

- Production branch: `main`
- Build command: `npm run build`
- Production deploy command: `npx wrangler deploy`
- Non-production deploy command: `npx wrangler versions upload`
- Path: `/`

Every non-production branch is uploaded as an isolated preview version. Merging to `main` promotes the combined build to production.

## Manual deployment

Automatic deployment is the normal workflow. Manual deployment requires access to the Cloudflare account and `npx wrangler login`.

```sh
npm run deploy:preview  # current feature branch only
npm run deploy          # main only; guarded by the script
```

Never share Cloudflare tokens or commit credentials to the repository.
