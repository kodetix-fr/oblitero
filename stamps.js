import { PDFDocument, StandardFonts, degrees, rgb } from './vendor/pdf-lib.esm.min.js';
import { t } from './i18n.js';
import { parseRange } from './pages-model.js';

export const POSITIONS = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'];
// The sample is what is drawn: the standard font only holds Latin characters, so "Page" is not translated.
export const ALIGNS = ['left', 'center', 'right'];
export const NO_STAMPS = Object.freeze({ numbers: null, header: null, footer: null, watermark: null, range: '' });
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

const displaySize = (page) => {
  const { width, height } = page.getSize();
  return page.getRotation().angle % 180 === 0 ? { width, height } : { width: height, height: width };
};

// Throws when the standard font cannot draw a character of `text`.
export async function checkText(text) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  try {
    font.encodeText(text);
  } catch {
    throw new Error(t('error.font'));
  }
}

// settings: { numbers: null | { position, format, first, size, skipFirst }, header: null | { text, align, size }, footer: the same,
// watermark: null | { text, size, opacity, angle }, range: '' for every page, or a list of pages such as 2-5, 8 }
export async function applyStamps(output, settings) {
  if (!settings.numbers && !settings.header && !settings.footer && !settings.watermark) return;
  const font = await output.embedFont(StandardFonts.Helvetica);
  const pages = output.getPages();
  const chosen = settings.range ? parseRange(settings.range, pages.length) : null;
  const reaches = (index) => !chosen || chosen.includes(index);
  if (settings.numbers) {
    const { position, format, first, size, skipFirst } = settings.numbers;
    pages.forEach((page, index) => {
      if ((skipFirst && index === 0) || !reaches(index)) return;
      const text = label(format, first + index, first + pages.length - 1);
      const box = displaySize(page);
      const at = anchor(position, box.width, box.height, font.widthOfTextAtSize(text, size), size);
      drawTextAt(page, font, text, size, at.x, at.y, 0);
    });
  }
  for (const [band, edge] of [[settings.header, 'top'], [settings.footer, 'bottom']]) {
    if (!band) continue;
    pages.forEach((page, index) => {
      if (!reaches(index)) return;
      const text = bandText(band.text, index + 1, pages.length);
      const box = displaySize(page);
      const at = anchor(`${edge}-${band.align}`, box.width, box.height, font.widthOfTextAtSize(text, band.size), band.size);
      drawTextAt(page, font, text, band.size, at.x, at.y, 0);
    });
  }
  if (settings.watermark) {
    const mark = settings.watermark;
    const { angle, opacity } = mark;
    const image = mark.kind === 'image' ? await (mark.image.kind === 'png' ? output.embedPng(mark.image.bytes) : output.embedJpg(mark.image.bytes)) : null;
    for (const [index, page] of pages.entries()) {
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
