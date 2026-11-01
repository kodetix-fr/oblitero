import { StandardFonts, degrees, rgb } from './vendor/pdf-lib.esm.min.js';
import { toPage } from './stamps.js';

// A mark is something put on a page after the fact: a picture (a signature, a stamp) or a line of text. Its place is given as
// fractions of the page as it is displayed, from its top left corner: x, y, and for a picture w and h; a text has a `size`
// as a fraction of the width of the page.
export const TEXT_RISE = 0.8;
const INK = rgb(0.06, 0.06, 0.1);

export const imageMark = (id, png, x, y, w, h) => ({ id, kind: 'image', png, x, y, w, h });
export const textMark = (id, text, x, y, size) => ({ id, kind: 'text', text, x, y, size });

export function displaySize(page) {
  const { width, height } = page.getSize();
  return page.getRotation().angle % 180 === 0 ? { width, height } : { width: height, height: width };
}

// Draws the marks on a page of the output document. `cache` keeps what was already embedded, so that a signature put on
// twenty pages is stored once.
export async function drawMarks(output, page, marks, cache) {
  if (!marks?.length) return;
  const rotation = page.getRotation().angle;
  const { width, height } = page.getSize();
  const shown = displaySize(page);
  for (const mark of marks) {
    if (mark.kind === 'image') {
      let image = cache.images.get(mark.png);
      if (!image) {
        image = await output.embedPng(mark.png);
        cache.images.set(mark.png, image);
      }
      const corner = toPage(rotation, width, height, mark.x * shown.width, shown.height - (mark.y + mark.h) * shown.height);
      page.drawImage(image, { x: corner.x, y: corner.y, width: mark.w * shown.width, height: mark.h * shown.height, rotate: degrees(rotation) });
    } else {
      cache.font ??= await output.embedFont(StandardFonts.Helvetica);
      const size = mark.size * shown.width;
      const start = toPage(rotation, width, height, mark.x * shown.width, shown.height - mark.y * shown.height - size * TEXT_RISE);
      page.drawText(mark.text, { x: start.x, y: start.y, size, font: cache.font, color: INK, rotate: degrees(rotation) });
    }
  }
}

export const newCache = () => ({ images: new Map(), font: null });
