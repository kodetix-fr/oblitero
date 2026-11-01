import { PDFDocument } from './vendor/pdf-lib.esm.min.js';

export const PAGE_SIZES = [
  ['fit', 'Fit to the image'],
  ['a4', 'A4'],
  ['letter', 'Letter'],
];
export const MARGINS = [
  ['none', 'No margin', 0],
  ['small', 'Small margin', 18],
  ['large', 'Large margin', 36],
];
const SIZES = { a4: [595.28, 841.89], letter: [612, 792] };
const PX_TO_PT = 0.75;

export function kindOf(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  return 'other';
}

// The EXIF orientation of a JPEG (1 when there is none): a phone photo is often stored sideways with a flag.
export function jpegOrientation(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 2;
  while (at + 4 <= bytes.length && view.getUint8(at) === 0xff) {
    const marker = view.getUint8(at + 1);
    const length = view.getUint16(at + 2);
    if (marker === 0xe1 && length >= 16 && view.getUint32(at + 4) === 0x45786966) {
      const base = at + 10;
      const little = view.getUint16(base) === 0x4949;
      const directory = base + view.getUint32(base + 4, little);
      if (directory + 2 > bytes.length) return 1;
      const entries = view.getUint16(directory, little);
      for (let i = 0; i < entries; i++) {
        const entry = directory + 2 + i * 12;
        if (entry + 12 > bytes.length) break;
        if (view.getUint16(entry, little) === 0x0112) return view.getUint16(entry + 8, little);
      }
      return 1;
    }
    if (marker === 0xda) break;
    at += 2 + length;
  }
  return 1;
}

// Where an image of `width` by `height` pixels goes on its page: the page size in points and the rectangle of the picture.
export function layout(size, margin, width, height) {
  const naturalWidth = width * PX_TO_PT;
  const naturalHeight = height * PX_TO_PT;
  if (size === 'fit') {
    return { page: [naturalWidth + 2 * margin, naturalHeight + 2 * margin], x: margin, y: margin, width: naturalWidth, height: naturalHeight };
  }
  const [shortSide, longSide] = SIZES[size];
  const landscape = width > height;
  const page = landscape ? [longSide, shortSide] : [shortSide, longSide];
  const room = [page[0] - 2 * margin, page[1] - 2 * margin];
  const scale = Math.min(room[0] / naturalWidth, room[1] / naturalHeight, Infinity);
  const drawn = [naturalWidth * scale, naturalHeight * scale];
  return { page, x: (page[0] - drawn[0]) / 2, y: (page[1] - drawn[1]) / 2, width: drawn[0], height: drawn[1] };
}

// `items`: { bytes, width, height } in order. Every image is a JPEG or a PNG here: `prepare(item)` (the browser) turns
// anything else, and a JPEG that is stored sideways, into one of the two.
export async function imagesToPdf(items, { size, margin }) {
  const document = await PDFDocument.create();
  document.setProducer('Oblitero');
  document.setCreator('Oblitero');
  for (const item of items) {
    const image = item.kind === 'png' ? await document.embedPng(item.bytes) : await document.embedJpg(item.bytes);
    const place = layout(size, margin, image.width, image.height);
    document.addPage(place.page).drawImage(image, { x: place.x, y: place.y, width: place.width, height: place.height });
  }
  return document.save();
}
