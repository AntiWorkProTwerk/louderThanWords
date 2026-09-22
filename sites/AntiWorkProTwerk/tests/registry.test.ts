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

test('the existing shared civic cache proxies to the backend without a D1 binding', async (t) => {
  const forwarded: Request[] = [];
  t.mock.method(globalThis, 'fetch', async (request: Request) => {
    forwarded.push(request);
    return Response.json(request.method === 'GET' ? { hit: false } : { ok: true });
  });
  const url = `https://${registry.domain}/api/civic/cache?key=demo`;
  const get = await worker.fetch(new Request(url), {});
  assert.deepEqual(await get.json(), { hit: false });
  const payload = { key: 'demo', payload: { value: 1 } };
  const post = await worker.fetch(new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }), {});
  assert.deepEqual(await post.json(), { ok: true });
  assert.equal(forwarded.length, 2);
  for (const request of forwarded) {
    assert.equal(request.url, 'https://dukevibington-dev-louderthanwords.louder-than-words.workers.dev/api/civic/cache?key=demo');
  }
  assert.deepEqual(forwarded.map(request => request.method), ['GET', 'POST']);
  assert.deepEqual(await forwarded[1].json(), payload);
});

test('nested prerendered pages are served before the SPA fallback for every site', async () => {
  for (const site of sites) {
    const env = { ASSETS: { fetch: async (request: Request) => {
      const path = new URL(request.url).pathname;
      return path === `${site.basePath}/research/example/index.html`
        ? new Response('Prerendered evidence page')
        : path === `${site.basePath}/index.html` ? new Response('App shell') : new Response('missing', {status:404});
    } } };
    const response = await worker.fetch(new Request(`https://${registry.domain}${site.basePath}/research/example/`), env);
    assert.equal(await response.text(), 'Prerendered evidence page');
    const redirect = await worker.fetch(new Request(`https://${registry.domain}${site.basePath}/research/example?q=test`), env);
    assert.equal(redirect.status,308);
    assert.equal(redirect.headers.get('location'),`https://${registry.domain}${site.basePath}/research/example/?q=test`);
  }
});
