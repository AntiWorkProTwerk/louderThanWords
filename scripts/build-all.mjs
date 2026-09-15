import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { availableSites, sites as registeredSites } from './site-registry.mjs';
import { syncSiteHandlers, renderPortal, renderHeaders } from './sync-sites.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist');
const sitesDirectory = join(root, 'sites');
const npmCli = process.env.npm_execpath;

if (!npmCli) throw new Error('Run this build through npm so the npm executable can be located.');
syncSiteHandlers();

mkdirSync(dist, { recursive: true });
// Keep the asset root in place: a running preview can hold it open on Windows.
// Clear generated contents so removed pages and old bundles do not survive a build.
for (const entry of readdirSync(dist)) {
  rmSync(join(dist, entry), { recursive: true, force: true, maxRetries: 3 });
}
cpSync(join(root, 'portal'), dist, { recursive: true });
writeFileSync(join(dist, 'index.html'), renderPortal());
writeFileSync(join(dist, '_headers'), renderHeaders());

const unregistered = readdirSync(sitesDirectory, { withFileTypes: true }).filter(
  (entry) => entry.isDirectory() && !registeredSites.some((site) => site.username === entry.name),
);
if (unregistered.length)
  throw new Error(
    `Add these site folders to sites.config.json: ${unregistered.map((entry) => entry.name).join(', ')}`,
  );
const sites = availableSites().map((site) => {
  const packageJson = JSON.parse(readFileSync(join(site.directory, 'package.json'), 'utf8'));
  return { folder: site.username, packageName: packageJson.name };
});

for (const site of sites) {
  console.log(`\nBuilding /${site.folder}/`);
  execFileSync(process.execPath, [npmCli, 'run', 'build', '--workspace', site.packageName], {
    cwd: root,
    stdio: 'inherit',
  });
}

console.log(`\nBuilt ${sites.length} independent site${sites.length === 1 ? '' : 's'}.`);
