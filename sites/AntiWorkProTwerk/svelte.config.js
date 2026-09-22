import adapterStatic from '@sveltejs/adapter-static';
import adapterCloudflare from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { siteForDirectory } from '../../scripts/site-registry.mjs';

const cloudflare = process.env.LTW_DEPLOY_TARGET === 'cloudflare';
const site = siteForDirectory(fileURLToPath(new URL('.', import.meta.url)));
const evidenceEntries = ['/said-vs-did/', '/said-vs-did/methodology/'];
// Catalog links are disclosed on demand; static output must not depend on open UI.
const recordRoutes = fileURLToPath(new URL('./src/routes/records/', import.meta.url));
const recordEntries = readdirSync(recordRoutes, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && !entry.name.startsWith('[') && existsSync(join(recordRoutes, entry.name, '+page.svelte')))
  .map(entry => `/records/${entry.name}/`);
const evidenceRoot = join(site.directory, 'public/data/said-did');
if (existsSync(join(evidenceRoot, 'manifest.json'))) {
  const manifest = JSON.parse(readFileSync(join(evidenceRoot, 'manifest.json'), 'utf8'));
  const index = JSON.parse(
    readFileSync(join(evidenceRoot, 'releases', manifest.release, 'index.json'), 'utf8'),
  );
  for (const item of index.items) evidenceEntries.push(`/said-vs-did/comparisons/${item.id}/`);
  for (const person of index.people) evidenceEntries.push(`/said-vs-did/members/${person.id}/`);
  for (const measure of index.measures)
    evidenceEntries.push(`/said-vs-did/measures/${measure.id}/`);
}
export default {
  preprocess: vitePreprocess(),
  kit: {
    // The shared repository Worker serves the same API handler as SvelteKit dev.
    // Static builds intentionally omit server routes; they are not public files.
    adapter: cloudflare
      ? adapterCloudflare({ config: '.svelte-kit/wrangler.json' })
      : adapterStatic({ pages: site.outputDirectory, assets: site.outputDirectory, strict: false }),
    files: { assets: 'public' },
    paths: { base: process.env.NODE_ENV === 'production' ? site.basePath : '' },
    prerender: { entries: ['/', ...recordEntries, ...evidenceEntries] },
  },
};
