import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMapBackground, type BackgroundState } from '../src/lib/civic/map-background';

function fixture() {
  const sources = new Map<string, any>([['states', { original: true }]]);
  const layers = new Map<string, any>([['state-fill', { original: true }]]);
  const listeners = new Map<string, Set<(event: any) => void>>();
  const removed: string[] = [],
    insertions: string[] = [];
  let loaded = false;
  const map = {
    getSource: (id: string) => sources.get(id),
    getLayer: (id: string) => layers.get(id),
    removeLayer: (id: string) => {
      removed.push(id);
      layers.delete(id);
    },
    removeSource: (id: string) => {
      removed.push(id);
      sources.delete(id);
    },
    addSource: (id: string, source: unknown) => {
      sources.set(id, source);
    },
    addLayer: (layer: any, before: string) => {
      layers.set(layer.id, layer);
      insertions.push(before);
    },
    setPaintProperty: (id: string, key: string, value: unknown) => {
      layers.get(id).paint[key] = value;
    },
    isSourceLoaded: () => loaded,
    on: (name: string, fn: (event: any) => void) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(fn);
    },
    off: (name: string, fn: (event: any) => void) => {
      listeners.get(name)?.delete(fn);
    },
  };
  return {
    map: map as unknown as Parameters<typeof loadMapBackground>[0],
    sources,
    layers,
    listeners,
    removed,
    insertions,
    loaded: () => {
      loaded = true;
    },
    emit: (name: string, event: unknown) => {
      for (const fn of listeners.get(name) ?? []) fn(event);
    },
  };
}

test('background uses the unchanged source URL and waits for its tiles without modifying states', () => {
  const f = fixture(),
    states: BackgroundState[] = [];
  const task = loadMapBackground(f.map, '/frozen/world.geojson', false, (state) =>
    states.push(state),
  );
  assert.equal(f.sources.get('world').data, '/frozen/world.geojson');
  assert.deepEqual(f.insertions, ['state-fill', 'state-fill']);
  assert.deepEqual(f.sources.get('states'), { original: true });
  assert.equal(f.layers.get('land').paint['fill-opacity'], 0);
  assert.equal(f.layers.get('land').paint['fill-opacity-transition'].duration, 300);
  f.emit('sourcedata', { sourceId: 'world' });
  assert.deepEqual(states, ['loading']);
  f.loaded();
  f.emit('sourcedata', { sourceId: 'states' });
  assert.deepEqual(states, ['loading']);
  f.emit('sourcedata', { sourceId: 'world' });
  f.emit('sourcedata', { sourceId: 'world' });
  assert.deepEqual(states, ['loading', 'ready']);
  assert.equal(f.layers.get('land').paint['fill-opacity'], 1);
  assert.equal(f.layers.get('countries').paint['line-opacity'], 1);
  task.stop();
  assert.ok(f.sources.has('world'), 'loaded context stays on the retained map');
  assert.equal(f.listeners.get('sourcedata')!.size, 0);
  const next = loadMapBackground(f.map, '/next-release/world.geojson', true, () => {});
  assert.equal(f.sources.get('world').data, '/next-release/world.geojson');
  assert.deepEqual(f.removed, ['countries', 'land', 'world']);
  next.stop();
});

test('switching away cancels only unfinished background work and ignores stale callbacks', () => {
  const f = fixture(),
    states: BackgroundState[] = [];
  const task = loadMapBackground(f.map, '/old/world.geojson', true, (state) => states.push(state));
  const stale = [...f.listeners.get('sourcedata')!][0];
  assert.equal(f.layers.get('countries').paint['line-opacity-transition'].duration, 0);
  task.stop();
  task.stop();
  assert.deepEqual(f.removed, ['countries', 'land', 'world']);
  assert.ok(f.sources.has('states'));
  f.loaded();
  stale({ sourceId: 'world' });
  assert.deepEqual(states, ['loading', 'idle']);
  const next = loadMapBackground(f.map, '/new/world.geojson', true, (state) => states.push(state));
  assert.equal(f.sources.get('world').data, '/new/world.geojson');
  stale({ sourceId: 'world' });
  assert.equal(states.at(-1), 'loading');
  f.emit('sourcedata', { sourceId: 'world' });
  assert.equal(states.at(-1), 'ready');
  next.stop();
});

test('background failures are separate from state errors and support explicit retry', () => {
  const f = fixture(),
    states: BackgroundState[] = [];
  const task = loadMapBackground(f.map, '/frozen/world.geojson', false, (state) =>
    states.push(state),
  );
  f.emit('error', { sourceId: 'states', error: new Error('states') });
  assert.deepEqual(states, ['loading']);
  f.emit('error', { sourceId: 'world', error: new Error('world') });
  assert.deepEqual(states, ['loading', 'error']);
  task.stop();
  const retry = loadMapBackground(f.map, '/frozen/world.geojson', false, (state) =>
    states.push(state),
  );
  f.loaded();
  f.emit('sourcedata', { sourceId: 'world' });
  retry.stop();
  assert.deepEqual(states, ['loading', 'error', 'idle', 'loading', 'ready']);
});

test('a partially created background can be cleaned up without removing state evidence', () => {
  const f = fixture(),
    states: BackgroundState[] = [];
  f.map.addLayer = () => {
    throw new Error('Layer creation failed');
  };
  const task = loadMapBackground(f.map, '/frozen/world.geojson', false, (state) =>
    states.push(state),
  );
  assert.deepEqual(states, ['loading', 'error']);
  task.stop();
  assert.ok(!f.sources.has('world'));
  assert.ok(f.sources.has('states'));
  assert.ok(f.layers.has('state-fill'));
  assert.equal(f.listeners.get('error')!.size, 0);
});
