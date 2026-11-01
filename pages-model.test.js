import test from 'node:test';
import assert from 'node:assert/strict';
import { createPages, movePages, rangeIds, removePages, rotatePages, rotateRect } from './pages-model.js';

const ids = (pages) => pages.map((page) => page.id);
const close = (actual, expected) => {
  for (const key of ['x', 'y', 'w', 'h']) assert.ok(Math.abs(actual[key] - expected[key]) < 1e-9, `${key}: ${actual[key]} vs ${expected[key]}`);
};

test('a quarter turn clockwise moves the top left corner to the top right', () => {
  close(rotateRect({ x: 0, y: 0, w: 0.2, h: 0.1 }, 90), { x: 0.9, y: 0, w: 0.1, h: 0.2 });
});

test('a quarter turn counterclockwise moves the top left corner to the bottom left', () => {
  close(rotateRect({ x: 0, y: 0, w: 0.2, h: 0.1 }, -90), { x: 0, y: 0.8, w: 0.1, h: 0.2 });
});

test('four quarter turns, or one turn and its opposite, give the rectangle back', () => {
  const rect = { x: 0.1, y: 0.3, w: 0.25, h: 0.05 };
  let turned = rect;
  for (let i = 0; i < 4; i++) turned = rotateRect(turned, 90);
  close(turned, rect);
  close(rotateRect(rotateRect(rect, 90), -90), rect);
});

test('rotatePages turns the selected pages and their rectangles only', () => {
  const rect = { x: 0, y: 0, w: 0.2, h: 0.1 };
  const pages = createPages(3).map((page) => ({ ...page, redactions: [rect] }));
  const turned = rotatePages(pages, new Set([1]), 90);
  assert.deepEqual(turned.map((page) => page.rotation), [0, 90, 0]);
  assert.equal(turned[0], pages[0]);
  close(turned[1].redactions[0], { x: 0.9, y: 0, w: 0.1, h: 0.2 });
  assert.deepEqual(rotatePages(turned, new Set([1]), -90)[1].rotation, 0);
  assert.deepEqual(rotatePages(pages, new Set([2]), -90)[2].rotation, 270);
});

test('removePages drops the selected pages', () => {
  assert.deepEqual(ids(removePages(createPages(4), new Set([0, 2]))), [1, 3]);
});

test('movePages moves a block as one and stops at the edges', () => {
  const pages = createPages(4);
  assert.deepEqual(ids(movePages(pages, new Set([2]), -1)), [0, 2, 1, 3]);
  assert.deepEqual(ids(movePages(pages, new Set([1, 2]), -1)), [1, 2, 0, 3]);
  assert.deepEqual(ids(movePages(pages, new Set([1, 2]), 1)), [0, 3, 1, 2]);
  assert.deepEqual(ids(movePages(pages, new Set([0, 1]), -1)), [0, 1, 2, 3]);
  assert.deepEqual(ids(movePages(pages, new Set([3]), 1)), [0, 1, 2, 3]);
  assert.deepEqual(ids(movePages(pages, new Set([0, 2]), 1)), [1, 0, 3, 2]);
});

test('rangeIds covers the pages between two ids, in either direction', () => {
  const pages = createPages(5);
  assert.deepEqual(rangeIds(pages, 1, 3), [1, 2, 3]);
  assert.deepEqual(rangeIds(pages, 3, 1), [1, 2, 3]);
  assert.deepEqual(rangeIds(pages, 2, 9), []);
});
