import test from 'node:test';
import assert from 'node:assert/strict';
import { inkBounds, whiteToTransparent } from './signature.js';

const image = (width, height, paint) => {
  const data = new Uint8ClampedArray(width * height * 4);
  paint((x, y, rgba) => data.set(rgba, (y * width + x) * 4));
  return { data, width, height };
};

test('inkBounds is the box of the pixels that are not transparent', () => {
  const picture = image(10, 8, (put) => {
    put(3, 2, [0, 0, 0, 255]);
    put(6, 5, [0, 0, 0, 200]);
    put(9, 7, [0, 0, 0, 3]);
  });
  assert.deepEqual(inkBounds(picture), { left: 3, top: 2, right: 7, bottom: 6 });
  assert.equal(inkBounds(image(4, 4, () => {})), null);
});

test('whiteToTransparent clears the paper, keeps the ink, and softens what is in between', () => {
  const picture = image(3, 1, (put) => {
    put(0, 0, [255, 255, 255, 255]);
    put(1, 0, [20, 20, 120, 255]);
    put(2, 0, [202, 202, 202, 255]);
  });
  whiteToTransparent(picture);
  assert.equal(picture.data[3], 0);
  assert.equal(picture.data[7], 255);
  assert.ok(picture.data[11] > 0 && picture.data[11] < 255);
  assert.deepEqual([...picture.data.slice(4, 7)], [20, 20, 120]);
});

test('a pixel that was already transparent stays transparent', () => {
  const picture = image(1, 1, (put) => put(0, 0, [0, 0, 0, 0]));
  whiteToTransparent(picture);
  assert.equal(picture.data[3], 0);
});
