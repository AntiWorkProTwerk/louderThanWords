import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { localEvidencePlugin } from './scripts/said-did/local-api.ts';
import { fileURLToPath } from 'node:url';
import { registry, siteForDirectory } from '../../scripts/site-registry.mjs';
const site = siteForDirectory(fileURLToPath(new URL('.', import.meta.url)));
export default defineConfig({
  define: {
    'import.meta.env.PUBLIC_SITE_PATH': JSON.stringify(site.basePath),
    'import.meta.env.PUBLIC_SITE_DOMAIN': JSON.stringify(registry.domain),
  },
  plugins: [localEvidencePlugin(), sveltekit()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
});
