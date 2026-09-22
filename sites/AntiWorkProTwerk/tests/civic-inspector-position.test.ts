import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectorPosition } from '../src/lib/civic/inspector-position';

test('inspector anchors above a desktop toolbar and below a phone toolbar when there is room', () => {
  assert.deepEqual(inspectorPosition({ left: 20, top: 800, bottom: 844 }, 1672, 941), {
    left: 20,
    width: 330,
    top: null,
    bottom: 153,
    maxHeight: 650,
    side: 'above',
  });
  assert.deepEqual(inspectorPosition({ left: 20, top: 300, bottom: 344 }, 390, 844), {
    left: 20,
    width: 330,
    top: 356,
    bottom: null,
    maxHeight: 476,
    side: 'below',
  });
});

test('short viewports use a bounded panel instead of clipping header or action controls beside the anchor', () => {
  assert.deepEqual(inspectorPosition({ left: 270, top: 280, bottom: 324 }, 320, 568), {
    left: 12,
    width: 296,
    top: 12,
    bottom: null,
    maxHeight: 544,
    side: 'viewport',
  });
});

test('placement stays in the viewport for edge anchors and every measured screen size', () => {
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [800, 720],
    [1672, 941],
    [100, 100],
  ])
    for (const left of [-40, 0, width / 2, width + 40])
      for (const top of [-40, 0, height / 2, height + 40]) {
        const p = inspectorPosition({ left, top, bottom: top + 44 }, width, height);
        const y = p.top ?? height - p.bottom! - p.maxHeight;
        assert.ok(p.left >= 0 && p.left + p.width <= width);
        assert.ok(y >= 0 && y + p.maxHeight <= height);
        assert.ok(p.width > 0 && p.maxHeight > 0);
      }
});

test('invalid measurements are rejected, not converted into offscreen CSS', () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.throws(() => inspectorPosition({ left: value, top: 0, bottom: 44 }, 390, 844), /finite/);
    assert.throws(() => inspectorPosition({ left: 0, top: 0, bottom: 44 }, 390, value), /finite/);
  }
  assert.throws(() => inspectorPosition({ left: 0, top: 44, bottom: 0 }, 390, 844), /finite/);
  assert.throws(() => inspectorPosition({ left: 0, top: 0, bottom: 44 }, 0, 844), /finite/);
});
