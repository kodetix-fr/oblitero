import { PDFDocument, StandardFonts, concatTransformationMatrix, degrees, drawObject, popGraphicsState, pushGraphicsState, rgb, setGraphicsState } from './vendor/pdf-lib.esm.min.js';
import { Failure } from './i18n.js';
import { parseRange } from './pages-model.js';

export const POSITIONS = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'];
export const NO_STAMPS = Object.freeze({ numbers: null, header: null, footer: null, watermark: null, letterhead: null, bates: null, stamp: null, range: '' });
// The sample is what is drawn: the standard font only holds Latin characters, so "Page" is not translated.
export const FORMATS = [
  ['number', '3'],
  ['of', '3 / 12'],
  ['page', 'Page 3'],
];
const MARGIN = 28;
const MAX_TILES = 400;
const INK = rgb(0.15, 0.15, 0.15);

// The text of a header or a footer, with {page} and {pages} replaced by the number of the page and the number of pages.
export const bandText = (template, number, total) => template.replaceAll('{page}', String(number)).replaceAll('{pages}', String(total));

// A Bates number: the prefix, the number of the page in the whole set with `digits` digits at least, and the suffix.
export const batesText = ({ prefix, suffix, first, digits }, index) => `${prefix}${String(first + index).padStart(digits, '0')}${suffix}`;

const STAMP_INK = rgb(0.75, 0.1, 0.1);

export function label(format, number, total) {
  if (format === 'of') return `${number} / ${total}`;
  if (format === 'page') return `Page ${number}`;
  return String(number);
}

// A point given as the page is displayed (origin at the bottom left), in the space of the page as it is stored.
export function toPage(rotation, width, height, x, y) {
  switch (((rotation % 360) + 360) % 360) {
    case 90:
      return { x: width - y, y: x };
    case 180:
      return { x: width - x, y: height - y };
    case 270:
      return { x: y, y: height - x };
    default:
      return { x, y };
  }
}

// The bottom left corner of a text box of `textWidth` by `size`, in the corner or the middle of an edge of the displayed page.
export function anchor(position, displayWidth, displayHeight, textWidth, size) {
  const [row, column] = position.split('-');
  const x = column === 'left' ? MARGIN : column === 'right' ? displayWidth - MARGIN - textWidth : (displayWidth - textWidth) / 2;
  const y = row === 'top' ? displayHeight - MARGIN - size : MARGIN;
  return { x, y };
}

function drawTextAt(page, font, text, size, x, y, angle, options = {}) {
  const rotation = page.getRotation().angle;
  const { width, height } = page.getSize();
  const point = toPage(rotation, width, height, x, y);
  page.drawText(text, { x: point.x, y: point.y, size, font, color: INK, rotate: degrees(rotation + angle), ...options });
}

function drawImageAt(page, image, width, height, x, y, angle, opacity) {
  const rotation = page.getRotation().angle;
  const size = page.getSize();
  const point = toPage(rotation, size.width, size.height, x, y);
  page.drawImage(image, { x: point.x, y: point.y, width, height, rotate: degrees(rotation + angle), opacity });
}

// The bottom left corner of a box of `width` by `height`, turned by `angle` degrees around its center (centerX, centerY).
export function cornerOf(centerX, centerY, width, height, angle) {
  const radians = (angle * Math.PI) / 180;
  return { x: centerX - ((width / 2) * Math.cos(radians) - (height / 2) * Math.sin(radians)), y: centerY - ((width / 2) * Math.sin(radians) + (height / 2) * Math.cos(radians)) };
}

// The centers of a mark that is repeated across a page, in rows that are shifted by half a step; the steps leave room for the
// mark once it is turned, and grow when the page would hold more than `MAX_TILES` of them.
export function tileCenters(width, height, markWidth, markHeight, angle) {
  const radians = (angle * Math.PI) / 180;
  const boxWidth = Math.abs(markWidth * Math.cos(radians)) + Math.abs(markHeight * Math.sin(radians));
  const boxHeight = Math.abs(markWidth * Math.sin(radians)) + Math.abs(markHeight * Math.cos(radians));
  let stepX = Math.max(boxWidth * 1.5, 24);
  let stepY = Math.max(boxHeight * 2, 24);
  const crowd = Math.sqrt(((width / stepX + 1) * (height / stepY + 1)) / MAX_TILES);
  if (crowd > 1) {
    stepX *= crowd;
    stepY *= crowd;
  }
  const centers = [];
  for (let row = 0, y = stepY / 2; y < height + stepY / 2; row++, y += stepY) {
    for (let x = row % 2 ? 0 : stepX / 2; x < width + stepX / 2; x += stepX) centers.push([x, y]);
  }
  return centers;
}

export const displaySize = (page) => {
  const { width, height } = page.getSize();
  return page.getRotation().angle % 180 === 0 ? { width, height } : { width: height, height: width };
};

// Draws `sheet`, an embedded page, as large as the displayed page holds it, centered and upright, under the content of the page
// or over it.
export function drawSheet(page, sheet, under, opacity) {
  const rotation = page.getRotation().angle;
  const { width, height } = page.getSize();
  const box = displaySize(page);
  const scale = Math.min(box.width / sheet.width, box.height / sheet.height);
  const corner = toPage(rotation, width, height, (box.width - sheet.width * scale) / 2, (box.height - sheet.height * scale) / 2);
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.round(Math.cos(radians)) * scale;
  const sin = Math.round(Math.sin(radians)) * scale;
  const { context } = page.doc;
  const operators = [pushGraphicsState()];
  if (opacity < 1) operators.push(setGraphicsState(page.node.newExtGState('Sheet', context.obj({ ca: opacity, CA: opacity }))));
  operators.push(concatTransformationMatrix(cos, sin, -sin, cos, corner.x, corner.y), drawObject(page.node.newXObject('Sheet', sheet.ref)), popGraphicsState());
  page.node.normalize();
  if (under) page.node.Contents().insert(0, context.register(page.createContentStream(...operators)));
  else page.pushOperators(...operators);
}

// Throws when the standard font cannot draw a character of `text`.
export async function checkText(text) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  try {
    font.encodeText(text);
  } catch {
    throw new Failure('error.font');
  }
}

// settings: { numbers: null | { position, format, first, size, skipFirst }, header: null | { text, align, size }, footer: the same,
// watermark: null | { text, size, opacity, angle }, letterhead: null | { bytes, name, under, opacity },
// bates: null | { prefix, suffix, first, digits, position, size }, stamp: null | { kind, text, image, position, size, scale }, range: '' for every page, or a list of pages such as 2-5, 8 }
// place: { index, total } stamps a one-page output as that page of a longer document. `offset` is the number of pages that come
// before this output in the set it belongs to (the parts of a cut document), where the Bates numbers go on.
export async function applyStamps(output, settings, /** @type {{ index: number, total: number } | null} */ place = null, offset = 0) {
  if (!settings.numbers && !settings.header && !settings.footer && !settings.watermark && !settings.letterhead && !settings.bates && !settings.stamp) return;
  const font = await output.embedFont(StandardFonts.Helvetica);
  const pages = output.getPages();
  const total = place?.total ?? pages.length;
  const placed = pages.map((page, index) => [page, place?.index ?? index]);
  const chosen = settings.range ? parseRange(settings.range, total) : null;
  const reaches = (index) => !chosen || chosen.includes(index);
  if (settings.letterhead) {
    const [sheet] = await output.embedPdf(settings.letterhead.bytes, [0]);
    for (const [page, index] of placed) if (reaches(index)) drawSheet(page, sheet, settings.letterhead.under, settings.letterhead.opacity);
  }
  if (settings.numbers) {
    const { position, format, first, size, skipFirst } = settings.numbers;
    placed.forEach(([page, index]) => {
      if ((skipFirst && index === 0) || !reaches(index)) return;
      const text = label(format, first + index, first + total - 1);
      const box = displaySize(page);
      const at = anchor(position, box.width, box.height, font.widthOfTextAtSize(text, size), size);
      drawTextAt(page, font, text, size, at.x, at.y, 0);
    });
  }
  for (const [band, edge] of [[settings.header, 'top'], [settings.footer, 'bottom']]) {
    if (!band) continue;
    placed.forEach(([page, index]) => {
      if (!reaches(index)) return;
      const text = bandText(band.text, index + 1, total);
      const box = displaySize(page);
      const at = anchor(`${edge}-${band.align}`, box.width, box.height, font.widthOfTextAtSize(text, band.size), band.size);
      drawTextAt(page, font, text, band.size, at.x, at.y, 0);
    });
  }
  if (settings.bates) {
    const { position, size } = settings.bates;
    placed.forEach(([page, index]) => {
      if (!reaches(index)) return;
      const text = batesText(settings.bates, place ? index : offset + index);
      const box = displaySize(page);
      const at = anchor(position, box.width, box.height, font.widthOfTextAtSize(text, size), size);
      drawTextAt(page, font, text, size, at.x, at.y, 0);
    });
  }
  if (settings.stamp) {
    const mark = settings.stamp;
    const image = mark.kind === 'image' ? await (mark.image.kind === 'png' ? output.embedPng(mark.image.bytes) : output.embedJpg(mark.image.bytes)) : null;
    const pad = mark.size * 0.4;
    for (const [page, index] of placed) {
      if (!reaches(index)) continue;
      const box = displaySize(page);
      if (image) {
        const width = (box.width * mark.scale) / 100;
        const height = (width * image.height) / image.width;
        const at = anchor(mark.position, box.width, box.height, width, height);
        drawImageAt(page, image, width, height, at.x, at.y, 0, 1);
        continue;
      }
      const textWidth = font.widthOfTextAtSize(mark.text, mark.size);
      const at = anchor(mark.position, box.width, box.height, textWidth + 2 * pad, mark.size + 2 * pad);
      const rotation = page.getRotation().angle;
      const { width, height } = page.getSize();
      const corner = toPage(rotation, width, height, at.x, at.y);
      page.drawRectangle({ x: corner.x, y: corner.y, width: textWidth + 2 * pad, height: mark.size + 2 * pad, borderColor: STAMP_INK, borderWidth: Math.max(1, mark.size / 10), rotate: degrees(rotation) });
      drawTextAt(page, font, mark.text, mark.size, at.x + pad, at.y + pad + mark.size * 0.2, 0, { color: STAMP_INK });
    }
  }
  if (settings.watermark) {
    const mark = settings.watermark;
    const { angle, opacity } = mark;
    const image = mark.kind === 'image' ? await (mark.image.kind === 'png' ? output.embedPng(mark.image.bytes) : output.embedJpg(mark.image.bytes)) : null;
    for (const [page, index] of placed) {
      if (!reaches(index)) continue;
      const box = displaySize(page);
      const width = image ? (box.width * mark.scale) / 100 : font.widthOfTextAtSize(mark.text, mark.size);
      const height = image ? (width * image.height) / image.width : mark.size * 0.6;
      for (const [centerX, centerY] of mark.tile ? tileCenters(box.width, box.height, width, height, angle) : [[box.width / 2, box.height / 2]]) {
        const corner = cornerOf(centerX, centerY, width, height, angle);
        if (image) drawImageAt(page, image, width, height, corner.x, corner.y, angle, opacity);
        else drawTextAt(page, font, mark.text, mark.size, corner.x, corner.y, angle, { opacity, color: rgb(0.45, 0.45, 0.45) });
      }
    }
  }
}
