# Louder Than Words

The collaborative source for [louderthanwords.fyi](https://louderthanwords.fyi/).

## Work locally

Requirements: Node.js 22.12+ (Node.js 24 recommended) and Git.

```sh
git clone https://github.com/AntiWorkProTwerk/louderThanWords.git
cd louderThanWords
npm ci
npm run dev
```

Vite prints a local URL, normally `http://localhost:5173`. Changes update in the browser as you edit.

## Team workflow

1. Update your local copy: `git switch main && git pull`
2. Create a branch: `git switch -c feature/short-description`
3. Make and test the change: `npm run check`
4. Commit it: `git add . && git commit -m "Describe the change"`
5. Push the branch: `git push -u origin HEAD`
6. Open a pull request into `main` on GitHub.
7. Review the Cloudflare preview URL posted on the pull request.
8. Merge after another person approves it. Merging to `main` deploys production.

Add friends under **Repository settings → Collaborators**. They should push branches to this repository instead of using forks so Cloudflare can build the branches and produce previews.

> **Important:** this is currently a private repository on a GitHub plan that does not enforce branch protection. Do not push directly to `main`; doing so bypasses review and triggers a production deployment. Making the repository public or upgrading the GitHub plan allows the owner to enforce pull requests, approvals, and passing checks.

## Deploy from a computer

Normal deployments are automatic: push a working branch for a preview, or merge its pull request to deploy production. A manual deployment is only needed for troubleshooting.

Manual deployment requires access to the Cloudflare account. Log into the correct account once:


```sh
npx wrangler login
```

Deploy the current branch to a temporary preview URL:

```sh
npm run deploy:preview
```

Deploy to production (the script refuses to do this outside `main`):

```sh
npm run deploy
```

The deployment script builds the site first and Wrangler uploads the generated `dist/` assets. Never share Cloudflare API tokens or commit them to the repository.

## Cloudflare Workers configuration

- Project: `louderthanwords`
- Production branch: `main`
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Non-production branch deploy command: `npx wrangler versions upload`
- Path: `/`

The Git integration builds every push. `main` uses the production deploy command; all other branches use the non-production command, which uploads a preview without promoting it to production. When a branch belongs to a pull request, Cloudflare comments on the pull request with its preview status and URL.

To change or verify these settings, open **Cloudflare → Workers & Pages → louderthanwords → Settings → Builds**. After checking the Worker preview, add `louderthanwords.fyi` under **Settings → Domains & Routes**.

The existing domain should not be moved until the Worker preview has been verified.
