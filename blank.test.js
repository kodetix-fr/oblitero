import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_POSITION, MAX_INK, MIN_INK, POSITIONS, blankIds, thresholdAt } from './blank.js';

test('the thresholds grow with the slider, from the smallest to the largest', () => {
  assert.equal(thresholdAt(0), MIN_INK);
  assert.ok(Math.abs(thresholdAt(POSITIONS) - MAX_INK) < 1e-12);
  const values = Array.from({ length: POSITIONS + 1 }, (_, position) => thresholdAt(position));
  assert.ok(values.every((value, i) => i === 0 || value > values[i - 1]));
  assert.ok(Math.abs(thresholdAt(50) - 0.001) < 1e-9, 'half way is a tenth of a percent');
});

test('the default position is a threshold of about three hundredths of a percent', () => {
  assert.ok(Math.abs(thresholdAt(DEFAULT_POSITION) - 0.0003) < 0.00001);
});

test('blankIds keeps the pages with less ink than the threshold, so an empty page is always blank', () => {
  const items = [{ id: 1, ink: 0 }, { id: 2, ink: 0.0001 }, { id: 3, ink: 0.0007 }, { id: 4, ink: 0.04 }];
  assert.deepEqual([...blankIds(items, thresholdAt(0))], [1]);
  assert.deepEqual([...blankIds(items, thresholdAt(DEFAULT_POSITION))], [1, 2]);
  assert.deepEqual([...blankIds(items, thresholdAt(60))], [1, 2, 3]);
  assert.deepEqual([...blankIds(items, thresholdAt(POSITIONS))], [1, 2, 3, 4]);
  assert.deepEqual([...blankIds([], 1)], []);
});
