import { PDFDocument, StandardFonts, degrees, rgb } from './vendor/pdf-lib.esm.min.js';
import { t } from './i18n.js';

export const POSITIONS = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'];
// The sample is what is drawn: the standard font only holds Latin characters, so "Page" is not translated.
export const FORMATS = [
  ['number', '3'],
  ['of', '3 / 12'],
  ['page', 'Page 3'],
];
const MARGIN = 28;
const INK = rgb(0.15, 0.15, 0.15);

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

// settings: { numbers: null | { position, format, first, size, skipFirst }, watermark: null | { text, size, opacity, angle } }
export async function applyStamps(output, settings) {
  if (!settings.numbers && !settings.watermark) return;
  const font = await output.embedFont(StandardFonts.Helvetica);
  const pages = output.getPages();
  if (settings.numbers) {
    const { position, format, first, size, skipFirst } = settings.numbers;
    pages.forEach((page, index) => {
      if (skipFirst && index === 0) return;
      const text = label(format, first + index, first + pages.length - 1);
      const box = displaySize(page);
      const at = anchor(position, box.width, box.height, font.widthOfTextAtSize(text, size), size);
      drawTextAt(page, font, text, size, at.x, at.y, 0);
    });
  }
  if (settings.watermark) {
    const { text, size, opacity, angle } = settings.watermark;
    const radians = (angle * Math.PI) / 180;
    const half = font.widthOfTextAtSize(text, size) / 2;
    const rise = size * 0.3;
    for (const page of pages) {
      const box = displaySize(page);
      const x = box.width / 2 - (half * Math.cos(radians) - rise * Math.sin(radians));
      const y = box.height / 2 - (half * Math.sin(radians) + rise * Math.cos(radians));
      drawTextAt(page, font, text, size, x, y, angle, { opacity, color: rgb(0.45, 0.45, 0.45) });
    }
  }
}
