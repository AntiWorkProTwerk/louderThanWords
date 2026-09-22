import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { catalogGroups, catalogViews, searchCatalog } from '../src/lib/civic/catalog';

test('every catalog card has a real route and a valid unique topic identity', async () => {
  assert.equal(new Set(catalogViews.map((v) => v.id)).size, catalogViews.length);
  assert.equal(new Set(catalogViews.map((v) => v.path)).size, catalogViews.length);
  assert.equal(catalogViews.length, 21);
  for (const view of catalogViews) {
    assert.ok(catalogGroups.some((g) => g.id === view.group && g.id !== 'all'));
    assert.match(view.path, /^\/(?:records\/[a-z-]+|said-vs-did)\/$/);
    await access(new URL(`../src/routes${view.path}+page.svelte`, import.meta.url));
    assert.ok(view.source && view.question);
  }
});
test('catalog search matches topics and sources without suggesting unavailable products', () => {
  assert.ok(searchCatalog('water').some((v) => v.id === 'water'));
  assert.deepEqual(
    searchCatalog('sec company').map((v) => v.id),
    ['connections', 'shared-investors', 'major-stakes', 'insiders'],
  );
  assert.equal(searchCatalog('no possible match').length, 0);
  assert.ok(searchCatalog('', 'money').every((v) => v.group === 'money'));
  assert.equal(searchCatalog('NIH')[0].id, 'research');
  assert.equal(searchCatalog('health').length, 3);
  assert.equal(searchCatalog('money').length, 4);
  assert.equal(catalogViews.find((v) => v.id === 'said-did')?.sample, true);
  assert.ok(!catalogViews.some((v) => v.id === 'fund-votes'));
});

test('every catalog destination is explicitly prerendered even when its disclosure is closed', async () => {
  const { default: config } = await import('../svelte.config.js');
  const entries = config.kit.prerender.entries;
  for (const view of catalogViews) assert.ok(entries.includes(view.path), `${view.path} must not rely on a visible navigation link`);
  assert.equal(new Set(entries).size, entries.length);
});
