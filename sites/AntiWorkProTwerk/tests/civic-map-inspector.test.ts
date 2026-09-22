import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mapReadout,
  mapScopeFor,
  mapViewDataKeys,
  mappedStateCodes,
} from '../src/lib/civic/map-inspector';
import { catalogViews } from '../src/lib/civic/catalog';

test('map inspector labels every catalog source without inventing a universal measure', () => {
  for (const view of catalogViews) {
    assert.ok(mapViewDataKeys[view.id]);
    const scope = mapScopeFor(view.id, true);
    assert.equal(scope.title, view.title);
    assert.equal(scope.source, view.source);
  }
  assert.equal(mapScopeFor('said-did', true).sample, true);
  assert.equal(mapScopeFor('patterns', true).sample, false);
  assert.equal(mapScopeFor('rules', true).kind, 'context');
  assert.equal(mapScopeFor('charts', true).kind, 'context');
  assert.equal(mapScopeFor('charts', true, true).kind, 'metric');
  assert.equal(mapScopeFor('lobbying', true).measure, 'Collected filings, including amendments');
});
test('map inspector distinguishes absent counts, explicit zeros, metrics and unavailable collections', () => {
  const scope = mapScopeFor('water', true);
  assert.equal(mapReadout('TX', scope, {}, {}).value, 'No match');
  assert.equal(mapReadout('TX', scope, { TX: 0 }, {}).value, '0');
  assert.equal(mapReadout('TX', scope, { TX: 2400 }, {}).value, '2,400');
  assert.equal(mapReadout('TX', scope, { TX: -1 }, {}).value, 'No match');
  assert.equal(
    mapReadout('TX', mapScopeFor('water', false), { TX: 2400 }, {}).value,
    'Unavailable',
  );
  const metric = mapScopeFor('patterns', true);
  assert.equal(mapReadout('TX', metric, {}, {}).value, 'No value');
  assert.equal(
    mapReadout('TX', metric, {}, { TX: { value: 0, label: 'Zero annual change' } }).value,
    '0%',
  );
  assert.equal(
    mapReadout('TX', metric, {}, { TX: { value: 0, label: 'Zero annual change' } }).status,
    'Measured zero',
  );
  assert.equal(
    mapReadout('TX', metric, {}, { TX: { value: NaN, label: 'Bad value' } }).value,
    'No value',
  );
  const result = mapReadout(
    'TX',
    metric,
    {},
    { TX: { value: -1.234, label: 'Exact source meaning', display: '−1.23%', color: '#112233' } },
  );
  assert.equal(result.value, '−1.23%');
  assert.equal(result.detail, 'Exact source meaning');
  assert.equal(result.color, '#112233');
  assert.equal(mapReadout('TX', mapScopeFor('rules', true), { TX: 100 }, {}).value, 'Context only');
  assert.deepEqual(
    mappedStateCodes(
      { TX: 0, CA: 2, WA: -1 },
      { NY: { value: 0, label: 'Measured zero' }, NJ: { value: NaN, label: 'Unavailable' } },
    ),
    ['CA', 'NY'],
  );
});
