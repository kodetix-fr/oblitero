import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from './vendor/pdf-lib.esm.min.js';
import { openInfo } from './pdf-info.js';

async function makePdf(sizes) {
  const document = await PDFDocument.create();
  for (const size of sizes) document.addPage([size, size]);
  return document.save();
}

test('openInfo counts the pages, lists no field of a plain file, and rejects bytes that are not a PDF', async () => {
  assert.deepEqual(await openInfo(await makePdf([100, 100, 100])), { count: 3, fields: [] });
  await assert.rejects(openInfo(new Uint8Array([1, 2, 3])));
});
