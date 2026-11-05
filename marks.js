import { StandardFonts, degrees, rgb } from './vendor/pdf-lib.esm.min.js';
import { displaySize, toPage } from './stamps.js';
import { textSizeOn } from './pages-model.js';

// A mark is something put on a page after the fact: a picture (a signature, a stamp) or a line of text. Its place is given as
// fractions of the page as it is displayed, from its top left corner: x, y, and for a picture w and h; a text has a `size`
// as a fraction of the width of the page. `turn` is how far it was turned with its page, clockwise: 0, 90, 180 or 270.
export const TEXT_RISE = 0.8;
const INK = rgb(0.06, 0.06, 0.1);

export const imageMark = (png, x, y, w, h) => ({ kind: 'image', png, x, y, w, h, turn: 0 });
export const textMark = (text, x, y, size) => ({ kind: 'text', text, x, y, size, turn: 0 });

// Where the bottom left corner of a picture goes in its box, once turned, as fractions of the box.
const TURNED_CORNER = { 0: [0, 0], 90: [0, 1], 180: [1, 1], 270: [1, 0] };

// Draws the marks on a page of the output document. `cache` keeps what was already embedded, so that a signature put on
// twenty pages is stored once.
export async function drawMarks(output, page, marks, cache) {
  if (!marks.length) return;
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
      const boxWidth = mark.w * shown.width;
      const boxHeight = mark.h * shown.height;
      const [right, up] = TURNED_CORNER[mark.turn];
      const corner = toPage(rotation, width, height, mark.x * shown.width + right * boxWidth, shown.height - (mark.y + mark.h) * shown.height + up * boxHeight);
      const sideways = mark.turn % 180 !== 0;
      page.drawImage(image, { x: corner.x, y: corner.y, width: sideways ? boxHeight : boxWidth, height: sideways ? boxWidth : boxHeight, rotate: degrees(rotation - mark.turn) });
    } else {
      cache.font ??= await output.embedFont(StandardFonts.Helvetica);
      const size = textSizeOn(mark, shown.width, shown.height);
      const radians = (mark.turn * Math.PI) / 180;
      const start = toPage(rotation, width, height, mark.x * shown.width - size * TEXT_RISE * Math.sin(radians), shown.height - mark.y * shown.height - size * TEXT_RISE * Math.cos(radians));
      page.drawText(mark.text, { x: start.x, y: start.y, size, font: cache.font, color: INK, rotate: degrees(rotation - mark.turn) });
    }
  }
}

export const newCache = () => ({ images: new Map(), font: null });
