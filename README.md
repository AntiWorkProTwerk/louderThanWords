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

## Cloudflare Pages setup

- Project: `louder-than-words`
- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: `/`

Connect this GitHub repository from **Cloudflare → Workers & Pages → Create → Pages → Connect to Git**. Enable all non-production branches for previews. After checking the Pages preview, add `louderthanwords.fyi` under the project's **Custom domains** tab.

The existing domain should not be moved until the Pages preview has been verified.
