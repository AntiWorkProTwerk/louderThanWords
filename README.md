# Louder Than Words

The collaborative source for [louderthanwords.fyi](https://louderthanwords.fyi/).

## Work locally

Requirements: Node.js 24+ and Git.

```sh
npm install
npm run dev
```

Vite prints a local URL, normally `http://localhost:5173`. Changes update in the browser as you edit.

## Team workflow

1. Create a branch: `git switch -c feature/short-description`
2. Make and test the change: `npm run check`
3. Push the branch: `git push -u origin HEAD`
4. Open a pull request on GitHub.
5. Review the Cloudflare preview URL on the pull request.
6. Merge after approval. `main` is the production branch.

Friends should be added under **Repository settings → Collaborators**. They can then work on branches in this repository, which allows Cloudflare to create PR previews. Cloudflare does not create automatic preview URLs for PRs from forks.

## Deploy from a computer

Log into the correct Cloudflare account once:

```sh
npx wrangler login
```

Deploy the current branch to a temporary preview URL:

```sh
npm run deploy:preview
```

Deploy to production (intended for `main` only):

```sh
npm run deploy
```

The deployment script builds the site first and uploads only `dist/`.

## Cloudflare Workers setup

- Project: `louderthanwords`
- Production branch: `main`
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Non-production branch deploy command: `npx wrangler versions upload`
- Path: `/`

Connect this GitHub repository from **Cloudflare → Workers & Pages → Create application → Import a repository**. Keep **Builds for non-production branches** enabled. Cloudflare creates a preview version and comments with its URL on pull requests. After checking the preview, add `louderthanwords.fyi` under the Worker's **Domains & Routes** settings.

The existing domain should not be moved until the Worker preview has been verified.
