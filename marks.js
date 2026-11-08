import { BlendMode, StandardFonts, degrees, rgb } from './vendor/pdf-lib.esm.min.js';
import { displaySize, toPage } from './stamps.js';
import { textSizeOn } from './pages-model.js';

// A mark is something put on a page after the fact: a picture (a signature, a stamp) or a line of text. Its place is given as
// fractions of the page as it is displayed, from its top left corner: x, y, and for a picture w and h; a text has a `size`
// as a fraction of the width of the page. `turn` is how far it was turned with its page, clockwise: 0, 90, 180 or 270.
export const TEXT_RISE = 0.8;
const INK = rgb(0.06, 0.06, 0.1);

export const imageMark = (png, x, y, w, h) => ({ kind: 'image', png, x, y, w, h, turn: 0 });
export const textMark = (text, x, y, size) => ({ kind: 'text', text, x, y, size, turn: 0 });

// A shape is drawn from (x1, y1) to (x2, y2): a rectangle, an arrow that points to the second point, or a highlight, which is
// always yellow and lets the page show through.
export const SHAPES = ['rect', 'arrow', 'highlight'];
export const SHAPE_COLORS = { red: [0.83, 0.16, 0.16], blue: [0.1, 0.38, 0.85], black: [0.06, 0.06, 0.1] };
const HIGHLIGHT = [1, 0.85, 0.1];
export const HIGHLIGHT_OPACITY = 0.4;
export const shapeMark = (shape, x1, y1, x2, y2, color) => ({ kind: 'shape', shape, x1, y1, x2, y2, color, turn: 0 });

// The parts of a shape on a displayed page of `width` by `height`, from its top left corner: a box, or lines, the thickness of
// the strokes and the color.
export function shapeParts(mark, width, height) {
  const [x1, y1, x2, y2] = [mark.x1 * width, mark.y1 * height, mark.x2 * width, mark.y2 * height];
  const thickness = Math.max(1, Math.min(width, height) * 0.004);
  const color = mark.shape === 'highlight' ? HIGHLIGHT : SHAPE_COLORS[mark.color] ?? SHAPE_COLORS.red;
  if (mark.shape !== 'arrow') return { box: [Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)], lines: [], thickness, color };
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = Math.min(thickness * 6, Math.hypot(x2 - x1, y2 - y1) / 2);
  const wing = (side) => [x2, y2, x2 - head * Math.cos(angle + side * 0.45), y2 - head * Math.sin(angle + side * 0.45)];
  return { box: null, lines: [[x1, y1, x2, y2], wing(1), wing(-1)], thickness, color };
}

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
    } else if (mark.kind === 'shape') {
      // Points of the displayed page, from its top left corner, in the space of the page.
      const at = (x, y) => toPage(rotation, width, height, x, shown.height - y);
      const { box, lines, thickness, color } = shapeParts(mark, shown.width, shown.height);
      if (box) {
        const [a, b] = [at(box[0], box[1]), at(box[0] + box[2], box[1] + box[3])];
        const frame = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
        if (mark.shape === 'highlight') page.drawRectangle({ ...frame, color: rgb(...color), opacity: HIGHLIGHT_OPACITY, blendMode: BlendMode.Multiply });
        else page.drawRectangle({ ...frame, borderColor: rgb(...color), borderWidth: thickness });
      }
      for (const [x1, y1, x2, y2] of lines) page.drawLine({ start: at(x1, y1), end: at(x2, y2), thickness, color: rgb(...color), lineCap: 1 });
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
