import adapterStatic from '@sveltejs/adapter-static';
import adapterCloudflare from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { siteForDirectory } from '../../scripts/site-registry.mjs';

const cloudflare = process.env.LTW_DEPLOY_TARGET === 'cloudflare';
const site = siteForDirectory(fileURLToPath(new URL('.', import.meta.url)));
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
    prerender: { entries: ['/'] },
  },
};
