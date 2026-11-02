import { PDFDocument, PDFName, PDFNumber, PDFRawStream } from './vendor/pdf-lib.esm.min.js';
import { formatFixed, t } from './i18n.js';

// Light rewrites the file compactly. Balanced and Strong also re-encode the JPEG images at a lower size and quality.
/** @type {Array<[string, { maxSide: number, quality: number } | null]>} */
export const LEVELS = [
  ['light', null],
  ['balanced', { maxSide: 1800, quality: 0.7 }],
  ['strong', { maxSide: 1200, quality: 0.5 }],
];
const MIN_GAIN = 0.9;
const name = (value) => PDFName.of(value);

// The number of color components of a JPEG (1 gray, 3 color, 4 CMYK), read from its start-of-frame marker; 0 if unreadable.
export function jpegComponents(bytes) {
  let at = 2;
  while (at + 9 < bytes.length && bytes[at] === 0xff) {
    const marker = bytes[at + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return bytes[at + 9];
    if (marker === 0xda) break;
    at += 2 + ((bytes[at + 2] << 8) | bytes[at + 3]);
  }
  return 0;
}

// The images of the document that can be re-encoded: a single DCT filter, gray or color, no stencil, no color key, no Decode.
export function jpegImages(document) {
  const found = [];
  for (const [ref, stream] of document.context.enumerateIndirectObjects()) {
    if (!(stream instanceof PDFRawStream)) continue;
    const { dict } = stream;
    if (String(dict.get(name('Subtype'))) !== '/Image' || String(dict.get(name('Filter'))) !== '/DCTDecode') continue;
    if (dict.has(name('Decode')) || dict.has(name('Mask')) || String(dict.get(name('ImageMask'))) === 'true') continue;
    if (![1, 3].includes(jpegComponents(stream.contents))) continue;
    found.push({ ref, stream, width: dict.lookup(name('Width')).asNumber(), height: dict.lookup(name('Height')).asNumber() });
  }
  return found;
}

/**
 * `encode({ bytes, width, height, maxSide, quality })` returns { bytes, width, height } or null, and runs in the browser.
 * @param {Uint8Array} bytes
 * @param {string} level
 * @param {(request: any) => Promise<{ bytes: Uint8Array, width: number, height: number } | null>} encode
 * @param {(done: number, total: number) => void} [progress]
 */
export async function compressPdf(bytes, level, encode, progress = () => {}) {
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  const settings = /** @type {{ maxSide: number, quality: number } | null} */ (LEVELS.find(([id]) => id === level)[1]);
  if (settings) {
    const images = jpegImages(document);
    for (const [index, image] of images.entries()) {
      progress(index, images.length);
      const result = await encode({ bytes: image.stream.contents, width: image.width, height: image.height, ...settings });
      if (!result || result.bytes.length > image.stream.contents.length * MIN_GAIN) continue;
      const { dict } = image.stream;
      image.stream.contents = result.bytes;
      dict.set(name('Width'), PDFNumber.of(result.width));
      dict.set(name('Height'), PDFNumber.of(result.height));
      dict.set(name('ColorSpace'), name('DeviceRGB'));
      dict.set(name('BitsPerComponent'), PDFNumber.of(8));
    }
    progress(images.length, images.length);
  }
  return document.save({ useObjectStreams: true });
}

export function formatSize(bytes) {
  if (bytes < 1024) return t('size.b', { n: bytes });
  if (bytes < 1024 * 1024) return t('size.kb', { n: formatFixed(bytes / 1024, bytes < 10240 ? 1 : 0) });
  return t('size.mb', { n: formatFixed(bytes / 1048576, bytes < 10485760 ? 2 : 1) });
}
