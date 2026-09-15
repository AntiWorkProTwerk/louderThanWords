import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registry, sites } from '../../../scripts/site-registry.mjs';
import { renderCodeowners, renderPortal } from '../../../scripts/sync-sites.mjs';
import worker from '../../../worker/index.js';
import { siteHandlers } from '../../../.generated/site-handlers.js';

test('the shared directory and ownership list include every registered teammate', () => {
  assert.equal(sites.length, 3);
  for (const site of sites) {
    assert.ok(renderPortal().includes(site.username));
    assert.ok(renderCodeowners().includes(`/sites/${site.username}/`));
  }
});
test('every site gets API routing with isolated credentials', async () => {
  for (const site of sites) {
    const original = siteHandlers[site.username];
    siteHandlers[site.username] = async (
      _request: Request,
      env: Record<string, string>,
      path: string,
    ) => Response.json({ env, path });
    try {
      const response = await worker.fetch(
        new Request(`https://${registry.domain}${site.basePath}/api/test`),
        {
          [`${site.envPrefix}SECRET`]: 'own-secret',
          GLOBAL_SECRET: 'shared-secret',
          OTHER__SECRET: 'other-secret',
        },
      );
      const result = await response.json();
      assert.equal(result.env.SECRET, 'own-secret');
      assert.equal(result.path, 'test');
      assert.equal(result.env.GLOBAL_SECRET, undefined);
      assert.equal(result.env.OTHER__SECRET, undefined);
    } finally {
      if (original) siteHandlers[site.username] = original;
      else delete siteHandlers[site.username];
    }
  }
});
test('static assets are served directly and missing JSON stays a 404', async () => {
  const site = sites[0],
    env = {
      ASSETS: {
        fetch: async (request: Request) =>
          new Response(
            new URL(request.url).pathname.endsWith('/style.css') ? 'body{}' : 'missing',
            { status: new URL(request.url).pathname.endsWith('/style.css') ? 200 : 404 },
          ),
      },
    };
  const css = await worker.fetch(new Request(`https://${registry.domain}/style.css`), env);
  assert.equal(await css.text(), 'body{}');
  const missing = await worker.fetch(
    new Request(`https://${registry.domain}${site.basePath}/data/missing.json`),
    env,
  );
  assert.equal(missing.status, 404);
});

test('the existing shared civic cache remains available without a D1 binding', async () => {
  const url = `https://${registry.domain}/api/civic/cache?key=demo`;
  const get = await worker.fetch(new Request(url), {});
  assert.deepEqual(await get.json(), { hit: false });
  const post = await worker.fetch(new Request(url, { method: 'POST' }), {});
  assert.deepEqual(await post.json(), { ok: false, error: 'D1 not bound' });
});
