import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, PDFName } from './vendor/pdf-lib.esm.min.js';
import { compressPdf, formatSize, jpegComponents, jpegImages } from './compress.js';

// A JPEG that is only the markers a reader needs to know its size and color components, plus filler for the scan.
function fakeJpeg(width, height, components, filler) {
  const frame = [0xff, 0xc0, 0, 8 + 3 * components, 8, height >> 8, height & 255, width >> 8, width & 255, components];
  for (let i = 0; i < components; i++) frame.push(i + 1, 0x11, 0);
  return new Uint8Array([0xff, 0xd8, ...frame, 0xff, 0xda, 0, 2, ...new Array(filler).fill(7), 0xff, 0xd9]);
}

async function pdfWith(images) {
  const document = await PDFDocument.create();
  for (const bytes of images) {
    const image = await document.embedJpg(bytes);
    document.addPage([200, 200]).drawImage(image, { x: 0, y: 0, width: 100, height: 100 });
  }
  return document.save();
}

test('jpegComponents reads gray, color and CMYK, and 0 for what is not a JPEG', () => {
  assert.equal(jpegComponents(fakeJpeg(10, 10, 1, 4)), 1);
  assert.equal(jpegComponents(fakeJpeg(10, 10, 3, 4)), 3);
  assert.equal(jpegComponents(fakeJpeg(10, 10, 4, 4)), 4);
  assert.equal(jpegComponents(new Uint8Array([1, 2, 3])), 0);
});

test('jpegImages lists the color and gray JPEG images, and leaves the CMYK ones', async () => {
  const document = await PDFDocument.load(await pdfWith([fakeJpeg(40, 30, 3, 100), fakeJpeg(20, 20, 1, 100), fakeJpeg(20, 20, 4, 100)]));
  assert.deepEqual(jpegImages(document).map((image) => [image.width, image.height]), [[40, 30], [20, 20]]);
});

test('light changes no image; balanced and strong replace the ones the encoder makes much smaller, and only those', async () => {
  const big = fakeJpeg(800, 600, 3, 20000);
  const small = fakeJpeg(50, 50, 3, 300);
  const source = await pdfWith([big, small]);
  const calls = [];
  const encode = async (request) => {
    calls.push([request.width, request.maxSide, request.quality]);
    return request.width === 800 ? { bytes: fakeJpeg(400, 300, 3, 2000), width: 400, height: 300 } : { bytes: request.bytes, width: request.width, height: request.height };
  };

  assert.deepEqual(calls, []);
  const light = await compressPdf(source, 'light', encode);
  assert.deepEqual(calls, []);
  assert.equal((await PDFDocument.load(light)).getPageCount(), 2);

  const balanced = await compressPdf(source, 'balanced', encode);
  assert.deepEqual(calls, [[800, 1800, 0.7], [50, 1800, 0.7]]);
  assert.ok(balanced.length < source.length * 0.5, `${balanced.length} against ${source.length}`);
  const images = jpegImages(await PDFDocument.load(balanced));
  assert.deepEqual(images.map((image) => [image.width, image.height]), [[400, 300], [50, 50]]);
  assert.equal(String(images[0].stream.dict.get(PDFName.of('ColorSpace'))), '/DeviceRGB');
  assert.equal(images[0].stream.contents.length, fakeJpeg(400, 300, 3, 2000).length);

  const reports = [];
  await compressPdf(source, 'strong', async () => null, (done, total) => reports.push([done, total]));
  assert.deepEqual(reports, [[0, 2], [1, 2], [2, 2]]);
});

test('formatSize writes bytes, kilobytes and megabytes', () => {
  assert.deepEqual([512, 2048, 150 * 1024, 3 * 1048576, 25 * 1048576].map(formatSize), ['512 B', '2.0 KB', '150 KB', '3.00 MB', '25.0 MB']);
});
