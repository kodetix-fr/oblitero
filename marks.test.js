import test from 'node:test';
import assert from 'node:assert/strict';
import { crc32, deflateSync } from 'node:zlib';
import { PDFDocument, PDFName, degrees } from './vendor/pdf-lib.esm.min.js';
import { buildPdf } from './export.js';
import { drawMarks, imageMark, newCache, textMark } from './marks.js';
import { blankPage, createPages, rotateMark } from './pages-model.js';

function png(width, height) {
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 4, 0)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const head = Buffer.alloc(4);
    head.writeUInt32BE(data.length);
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc32(body));
    return Buffer.concat([head, body, tail]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

const stream = (page) => Buffer.from(page.node.Contents().toString());
const noBurn = () => {
  throw new Error('no page should be burnt');
};

test('drawMarks writes nothing without marks, and embeds one picture for the pages that share it', async () => {
  const document = await PDFDocument.create();
  for (const size of [300, 400, 500]) document.addPage([size, size]);
  const cache = newCache();
  const signature = png(8, 4);
  await drawMarks(document, document.getPage(0), [], cache);
  assert.equal(document.getPage(0).node.Contents(), undefined);
  for (const index of [0, 1, 2]) await drawMarks(document, document.getPage(index), [imageMark(signature, 0.5, 0.8, 0.3, 0.1), textMark('Signed 2026-11-01', 0.1, 0.1, 0.03)], cache);
  assert.equal(cache.images.size, 1);
  const saved = await PDFDocument.load(await document.save({ useObjectStreams: false }));
  const images = saved.context.enumerateIndirectObjects().filter(([, object]) => String(object.dict?.get(PDFName.of('Subtype'))) === '/Image');
  assert.equal(images.length, 2, 'one picture and its transparency mask, stored once for three pages');
});

test('marks go through the export, on copied, blank and rotated pages', async () => {
  const source = await PDFDocument.create();
  source.addPage([300, 300]);
  const entries = createPages(1);
  const marks = [textMark('HELLO', 0.1, 0.1, 0.05)];
  const output = await PDFDocument.load(
    await buildPdf(
      [await source.save()],
      [{ ...entries[0], marks }, { ...entries[0], id: 5, rotation: 90, marks }, { ...blankPage(9, 200, 100), marks: [imageMark(png(4, 4), 0.1, 0.1, 0.2, 0.2)] }],
      noBurn,
    ),
  );
  assert.equal(output.getPageCount(), 3);
  for (const page of output.getPages()) assert.ok(page.node.Contents(), 'a page has no content');
  assert.equal(output.getPage(1).getRotation().angle, 90);
});

test('a text mark on a turned page is drawn turned with it', async () => {
  const document = await PDFDocument.create();
  const upright = document.addPage([300, 200]);
  const turned = document.addPage([300, 200]);
  turned.setRotation(degrees(90));
  const cache = newCache();
  await drawMarks(document, upright, [textMark('X', 0.5, 0.5, 0.1)], cache);
  await drawMarks(document, turned, [textMark('X', 0.5, 0.5, 0.1)], cache);
  assert.notEqual(stream(upright).toString(), stream(turned).toString());
});

test('a picture turned with its page keeps its size and its place on the page', async () => {
  const document = await PDFDocument.create();
  const page = document.addPage([200, 400]);
  const calls = [];
  page.drawImage = (_, options) => calls.push(options);
  await drawMarks(document, page, [rotateMark(imageMark(png(4, 4), 0.1, 0.2, 0.5, 0.1), 90)], newCache());
  const [{ x, y, width, height, rotate }] = calls;
  assert.deepEqual({ width, height, angle: rotate.angle }, { width: 200, height: 20, angle: -90 });
  assert.deepEqual({ x: Math.round(x), y: Math.round(y) }, { x: 140, y: 360 });
});

test('a text turned with its page keeps its size in points', async () => {
  const document = await PDFDocument.create();
  const page = document.addPage([200, 400]);
  const calls = [];
  page.drawText = (_, options) => calls.push(options);
  await drawMarks(document, page, [rotateMark(textMark('X', 0.1, 0.2, 0.05), 90)], newCache());
  assert.equal(calls[0].size, 0.05 * 400);
  assert.equal(calls[0].rotate.angle, -90);
});
