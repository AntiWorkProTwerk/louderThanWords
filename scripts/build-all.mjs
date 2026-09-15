import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist');
const sitesDirectory = join(root, 'sites');
const npmCli = process.env.npm_execpath;

if (!npmCli) throw new Error('Run this build through npm so the npm executable can be located.');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(join(root, 'portal'), dist, { recursive: true });

const sites = readdirSync(sitesDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => {
    const packageJson = JSON.parse(readFileSync(join(sitesDirectory, entry.name, 'package.json'), 'utf8'));
    return { folder: entry.name, packageName: packageJson.name };
  });

for (const site of sites) {
  console.log(`\nBuilding /${site.folder}/`);
  execFileSync(process.execPath, [npmCli, 'run', 'build', '--workspace', site.packageName], {
    cwd: root,
    stdio: 'inherit',
  });
}

console.log(`\nBuilt ${sites.length} independent site${sites.length === 1 ? '' : 's'}.`);
