import test from 'node:test';
import assert from 'node:assert/strict';
import { crc32, deflateSync } from 'node:zlib';
import { PDFDocument } from './vendor/pdf-lib.esm.min.js';
import { imagesToPdf, jpegOrientation, kindOf, layout } from './images.js';

function png(width, height) {
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 200)]);
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
  header[9] = 2;
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

// A JPEG that is only a start marker, an EXIF block with an orientation tag, and the start of the scan.
function jpegWithOrientation(orientation, little = true) {
  const tiff = Buffer.alloc(8 + 2 + 12 + 4);
  tiff.write(little ? 'II' : 'MM', 0);
  const write16 = (value, at) => (little ? tiff.writeUInt16LE(value, at) : tiff.writeUInt16BE(value, at));
  const write32 = (value, at) => (little ? tiff.writeUInt32LE(value, at) : tiff.writeUInt32BE(value, at));
  write16(42, 2);
  write32(8, 4);
  write16(1, 8);
  write16(0x0112, 10);
  write16(3, 12);
  write32(1, 14);
  write16(orientation, 18);
  const body = Buffer.concat([Buffer.from('Exif\0\0'), tiff]);
  const length = Buffer.alloc(2);
  length.writeUInt16BE(body.length + 2);
  return new Uint8Array(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), length, body, Buffer.from([0xff, 0xda])]));
}

test('kindOf tells a JPEG, a PNG and anything else by the first bytes', () => {
  assert.equal(kindOf(new Uint8Array([0xff, 0xd8, 0xff])), 'jpg');
  assert.equal(kindOf(png(1, 1)), 'png');
  assert.equal(kindOf(new TextEncoder().encode('RIFFxxxxWEBP')), 'other');
});

test('jpegOrientation reads the EXIF flag in both byte orders, and 1 when there is none', () => {
  for (const orientation of [1, 3, 6, 8]) {
    assert.equal(jpegOrientation(jpegWithOrientation(orientation, true)), orientation);
    assert.equal(jpegOrientation(jpegWithOrientation(orientation, false)), orientation);
  }
  assert.equal(jpegOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2])), 1);
  assert.equal(jpegOrientation(new Uint8Array([0xff, 0xd8])), 1);
});

test('layout puts an image on a page that fits it, or fits it on an A4 or Letter page', () => {
  assert.deepEqual(layout('fit', 0, 400, 200), { page: [300, 150], x: 0, y: 0, width: 300, height: 150 });
  assert.deepEqual(layout('fit', 18, 400, 200).page, [336, 186]);
  const portrait = layout('a4', 0, 100, 200);
  assert.deepEqual(portrait.page, [595.28, 841.89]);
  assert.ok(portrait.height <= 841.89 + 1e-9 && portrait.width <= 595.28 + 1e-9);
  assert.ok(Math.abs(portrait.width / portrait.height - 0.5) < 1e-9);
  const landscape = layout('letter', 36, 300, 100);
  assert.deepEqual(landscape.page, [792, 612]);
  assert.ok(Math.abs(landscape.x - 36) < 1e-9 && Math.abs(landscape.width - 720) < 1e-9);
  assert.ok(Math.abs(landscape.y * 2 + landscape.height - 612) < 1e-9);
});

test('imagesToPdf makes one page per image, in order, sized by the settings', async () => {
  const output = await PDFDocument.load(
    await imagesToPdf(
      [
        { bytes: png(400, 200), kind: 'png' },
        { bytes: png(100, 300), kind: 'png' },
      ],
      { size: 'fit', margin: 0 },
    ),
  );
  assert.deepEqual(output.getPages().map((page) => [page.getWidth(), page.getHeight()]), [[300, 150], [75, 225]]);
  const a4 = await PDFDocument.load(await imagesToPdf([{ bytes: png(400, 200), kind: 'png' }], { size: 'a4', margin: 18 }));
  assert.deepEqual([a4.getPage(0).getWidth(), a4.getPage(0).getHeight()], [841.89, 595.28]);
});
