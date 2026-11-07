import test from 'node:test';
import assert from 'node:assert/strict';
import { adjustMatrix, contentMatrix, isAdjusted, pageBox, uprightMatrix } from './page-adjust.js';

const close = (actual, expected) => actual.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < 1e-9, `${actual} != ${expected}`));
const apply = (matrix, [x, y]) => [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]];

test('a page with no angle and no mirror is not changed', () => {
  assert.equal(isAdjusted({ angle: 0, flip: false }), false);
  assert.equal(adjustMatrix({ angle: 0, flip: false }, 100, 200), null);
});

test('the displayed page turns clockwise around its middle', () => {
  const matrix = adjustMatrix({ angle: 90, flip: false }, 100, 100);
  close(apply(matrix, [50, 50]), [50, 50]);
  close(apply(matrix, [0, 0]), [100, 0]);
  const five = adjustMatrix({ angle: 5, flip: false }, 300, 300);
  const top = apply(five, [150, 0]);
  assert.ok(top[0] > 150 + 12 && top[0] < 150 + 14);
});

test('the mirror is horizontal on the displayed page, whatever its quarter turns', () => {
  const box = { x: 0, y: 0, width: 100, height: 200 };
  close(contentMatrix({ angle: 0, flip: true }, box, 0), [-1, 0, 0, 1, 100, 0]);
  close(contentMatrix({ angle: 0, flip: true }, box, 90), [1, 0, 0, -1, 0, 200]);
  close(contentMatrix({ angle: 0, flip: true }, box, 180), [-1, 0, 0, 1, 100, 0]);
});

test('in the page coordinates, a clockwise turn keeps the crop box offset', () => {
  close(contentMatrix({ angle: 90, flip: false }, { x: 0, y: 0, width: 100, height: 100 }, 0), [0, -1, 1, 0, 0, 100]);
  const shifted = contentMatrix({ angle: 90, flip: false }, { x: 10, y: 20, width: 100, height: 100 }, 0);
  close(apply(shifted, [60, 70]), [60, 70]);
  close(apply(shifted, [10, 120]), [110, 120]);
});

test('a rectangle of the displayed page becomes a box of the page, whatever its quarter turns', () => {
  const box = { x: 10, y: 20, width: 100, height: 200 };
  assert.deepEqual(pageBox(box, 0, { x: 0, y: 0, w: 0.5, h: 0.25 }), { left: 10, bottom: 170, right: 60, top: 220 });
  // Turned clockwise, the displayed top left corner is the bottom left corner of the page.
  assert.deepEqual(pageBox(box, 90, { x: 0, y: 0, w: 0.5, h: 0.5 }), { left: 10, bottom: 20, right: 60, top: 120 });
});

test('content of a turned page is put upright on a page of its displayed size', () => {
  close(apply(uprightMatrix(90, 100, 200), [0, 200]), [200, 100]);
  close(apply(uprightMatrix(270, 100, 200), [0, 200]), [0, 0]);
  close(apply(uprightMatrix(180, 100, 200), [0, 0]), [100, 200]);
});
