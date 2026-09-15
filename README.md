# Louder Than Words

A shared repository of independent websites deployed together at [louderthanwords.fyi](https://louderthanwords.fyi/).

Each collaborator owns a complete site:

```text
sites/
└── AntiWorkProTwerk/  →  louderthanwords.fyi/AntiWorkProTwerk/
```

Sites may use different designs, dependencies, and code. The root `portal/` is the directory of everyone’s sites.

## Work on your site

Requirements: Node.js 22.12+ (Node.js 24 recommended) and Git.

```sh
git clone https://github.com/AntiWorkProTwerk/louderThanWords.git
cd louderThanWords
npm ci
git switch -c your-name/short-description
```

Run one site locally by its workspace package name:

```sh
npm run dev --workspace @louder-than-words/antiworkprotwerk
```

The shortcut `npm run dev` currently opens the AntiWorkProTwerk site. Check the complete deployment before pushing:

```sh
npm run check
npm run preview
```

`npm run preview` runs the assembled site through the local Cloudflare Worker. Open the URL Wrangler prints and include your site path, such as `/AntiWorkProTwerk/`.

## Add a teammate’s site

1. Copy an existing folder under `sites/` and rename it to the teammate’s GitHub username.
2. Give its `package.json` a unique package name.
3. Make its build output and Vite base path match its public path.
4. Add it to the site list in `portal/index.html`.
5. Add `/sites/GitHubUsername/ @GitHubUsername` to `.github/CODEOWNERS`.

Every site must build into `dist/GitHubUsername/`. Never commit `dist/`; the combined build creates it automatically.

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
