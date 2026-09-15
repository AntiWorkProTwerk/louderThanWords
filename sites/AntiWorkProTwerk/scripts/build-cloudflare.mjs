import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { siteForDirectory } from '../../../scripts/site-registry.mjs';
const site = siteForDirectory(process.cwd());
mkdirSync(join(site.directory, '.svelte-kit'), { recursive: true });
// Never let adapter-cloudflare discover the shared root Worker configuration:
// its output and entrypoint must stay inside this site's generated directory.
writeFileSync(
  join(site.directory, '.svelte-kit/wrangler.json'),
  JSON.stringify(
    {
      name: `ltw-${site.username.toLowerCase()}`,
      compatibility_date: '2026-09-14',
      compatibility_flags: ['nodejs_compat'],
      main: './cloudflare-worker/index.js',
      assets: { directory: './cloudflare-assets', binding: 'ASSETS' },
    },
    null,
    2,
  ),
);
process.env.LTW_DEPLOY_TARGET = 'cloudflare';
execFileSync(process.execPath, [process.env.npm_execpath, 'run', 'build'], {
  stdio: 'inherit',
  env: process.env,
});
