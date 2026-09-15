import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { registry, getSite } from './site-registry.mjs';
const args = process.argv.slice(2),
  username = args[0] && !args[0].startsWith('-') ? args.shift() : registry.defaultSite;
const site = getSite(username);
let pkg;
try {
  pkg = JSON.parse(readFileSync(join(site.directory, 'package.json'), 'utf8'));
} catch {
  throw new Error(`The registered site ${username} has not been added to this checkout yet.`);
}
execFileSync(
  process.execPath,
  [process.env.npm_execpath, 'run', 'dev', '--workspace', pkg.name, '--', ...args],
  { stdio: 'inherit' },
);
