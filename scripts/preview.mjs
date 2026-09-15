import { execFileSync } from 'node:child_process';
import { syncSiteHandlers } from './sync-sites.mjs';
syncSiteHandlers();
execFileSync(
  process.execPath,
  [process.env.npm_execpath, 'exec', '--', 'wrangler', 'dev', ...process.argv.slice(2)],
  { stdio: 'inherit' },
);
