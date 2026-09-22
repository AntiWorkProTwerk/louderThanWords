import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextPlotPoint } from '../src/lib/civic/plot-navigation';

const points = [
  { code: 'TX', name: 'Texas', x: 2, y: 3 },
  { code: 'WA', name: 'Washington', x: -1, y: 4 },
  { code: 'CA', name: 'California', x: 2, y: 3 },
  { code: 'AL', name: 'Alabama', x: 0, y: -2 },
];

test('plot axis browsing is ordered, deterministic and reaches overlapping dots', () => {
  assert.equal(nextPlotPoint(points, 'WA', 'ArrowRight'), 'AL');
  assert.equal(nextPlotPoint(points, 'AL', 'ArrowRight'), 'CA');
  assert.equal(nextPlotPoint(points, 'CA', 'ArrowRight'), 'TX');
  assert.equal(nextPlotPoint(points, 'TX', 'ArrowLeft'), 'CA');
  assert.equal(nextPlotPoint(points, 'AL', 'ArrowUp'), 'CA');
  assert.equal(nextPlotPoint(points, 'CA', 'ArrowUp'), 'TX');
  assert.equal(nextPlotPoint(points, 'TX', 'ArrowUp'), 'WA');
  assert.equal(nextPlotPoint(points, 'WA', 'ArrowDown'), 'TX');
  assert.equal(nextPlotPoint(points, 'CA', 'Home'), 'AL');
  assert.equal(nextPlotPoint(points, 'CA', 'End'), 'WA');
  assert.deepEqual(
    points.map((p) => p.code),
    ['TX', 'WA', 'CA', 'AL'],
  );
});

test('plot navigation stops at bounds, excludes nonfinite pairs and leaves other keys native', () => {
  assert.equal(nextPlotPoint(points, 'TX', 'ArrowRight'), 'TX');
  assert.equal(nextPlotPoint(points, 'WA', 'ArrowLeft'), 'WA');
  assert.equal(nextPlotPoint(points, 'AL', 'ArrowDown'), 'AL');
  assert.equal(nextPlotPoint(points, 'WA', 'ArrowUp'), 'WA');
  assert.equal(nextPlotPoint(points, 'ZZ', 'ArrowRight'), 'WA');
  assert.equal(nextPlotPoint([], 'TX', 'ArrowRight'), null);
  assert.equal(nextPlotPoint(points, 'TX', 'Enter'), null);
  assert.equal(nextPlotPoint(points, 'TX', 'Tab'), null);
  assert.equal(
    nextPlotPoint([...points, { code: 'XX', name: 'Invalid', x: NaN, y: 0 }], 'TX', 'ArrowRight'),
    'TX',
  );
});
