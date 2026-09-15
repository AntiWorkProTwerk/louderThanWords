import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const registry = JSON.parse(readFileSync(join(root, 'sites.config.json'), 'utf8'));
const seen = new Set();
for (const site of registry.sites) {
  if (
    !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})$/.test(site.username) ||
    seen.has(site.username.toLowerCase())
  )
    throw new Error('Site usernames must be unique, valid GitHub usernames.');
  seen.add(site.username.toLowerCase());
}
if (!registry.sites.some((site) => site.username === registry.defaultSite))
  throw new Error('The default site must be registered.');
export const sites = registry.sites.map((site) => ({
  ...site,
  directory: join(root, 'sites', site.username),
  basePath: `/${site.username}`,
  outputDirectory: join(root, 'dist', site.username),
  envPrefix: `${site.username.toUpperCase().replaceAll('-', '_')}__`,
}));
export const availableSites = () =>
  sites.filter((site) => existsSync(join(site.directory, 'package.json')));
export function getSite(username) {
  const site = sites.find((site) => site.username === username);
  if (!site) throw new Error(`Unregistered site: ${username}`);
  return site;
}
export function siteForDirectory(directory) {
  return getSite(basename(resolve(directory)));
}
