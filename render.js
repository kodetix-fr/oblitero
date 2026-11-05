import * as pdfjs from './vendor/pdfjs/pdf.min.mjs';
import { multiply, runBox } from './find.js';
import { readingText } from './reading-order.js';
import { TEXT_RISE } from './marks.js';
import { textSizeOn } from './pages-model.js';
import { t } from './i18n.js';

const resource = (path) => new URL(`vendor/pdfjs/${path}`, import.meta.url).href;
const MAX_SIDE = 8000;
const BURN_SCALE = 2;

pdfjs.GlobalWorkerOptions.workerSrc = resource('pdf.worker.min.mjs');

const tasks = new WeakMap();
let worker = null;

export async function openRender(bytes) {
  worker ??= new pdfjs.PDFWorker();
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    worker,
    isEvalSupported: false,
    cMapUrl: resource('cmaps/'),
    cMapPacked: true,
    standardFontDataUrl: resource('standard_fonts/'),
    wasmUrl: resource('wasm/'),
    iccUrl: resource('iccs/'),
  });
  const doc = await task.promise;
  tasks.set(doc, task);
  return doc;
}

export function closeRender(doc) {
  return tasks.get(doc)?.destroy();
}

function viewportOf(page, scale, rotation) {
  return page.getViewport({ scale, rotation: (page.rotate + rotation) % 360 });
}

export async function pageSize(doc, index, rotation) {
  const { width, height } = viewportOf(await doc.getPage(index + 1), 1, rotation);
  return { width, height };
}

export async function renderPage(doc, index, rotation, canvas, scale) {
  const page = await doc.getPage(index + 1);
  const viewport = viewportOf(page, scale, rotation);
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvas, viewport, background: '#ffffff' }).promise;
}

// The size of a page as it is displayed, in points: its rotation applied.
export async function entrySize(doc, entry) {
  if (entry.blank) return entry.rotation % 180 ? { width: entry.blank.height, height: entry.blank.width } : entry.blank;
  return pageSize(doc, entry.source, entry.rotation);
}

// The indexes of the pages where the top-level entries of the outline of a file begin.
export async function outlineStarts(doc) {
  const starts = new Set();
  for (const { dest } of (await doc.getOutline()) ?? []) {
    try {
      const target = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
      if (target) starts.add(typeof target[0] === 'number' ? target[0] : await doc.getPageIndex(target[0]));
    } catch {
      continue;
    }
  }
  return starts;
}

const bitmaps = new WeakMap();

// The pictures and the lines of text put on a page, drawn on its canvas as they will be in the PDF.
async function paintMarks(canvas, marks) {
  const context = canvas.getContext('2d');
  for (const mark of marks) {
    const radians = (mark.turn * Math.PI) / 180;
    context.save();
    if (mark.kind === 'image') {
      if (!bitmaps.has(mark.png)) bitmaps.set(mark.png, await createImageBitmap(new Blob([mark.png], { type: 'image/png' })));
      const boxWidth = mark.w * canvas.width;
      const boxHeight = mark.h * canvas.height;
      const [width, height] = mark.turn % 180 ? [boxHeight, boxWidth] : [boxWidth, boxHeight];
      context.translate(mark.x * canvas.width + boxWidth / 2, mark.y * canvas.height + boxHeight / 2);
      context.rotate(radians);
      context.drawImage(bitmaps.get(mark.png), -width / 2, -height / 2, width, height);
    } else {
      const size = textSizeOn(mark, canvas.width, canvas.height);
      context.fillStyle = '#0f0f1a';
      context.font = `${size}px Helvetica, Arial, sans-serif`;
      context.textBaseline = 'alphabetic';
      context.translate(mark.x * canvas.width, mark.y * canvas.height);
      context.rotate(radians);
      context.fillText(mark.text, 0, size * TEXT_RISE);
    }
    context.restore();
  }
}

// A page as it will be downloaded, drawn at `scale`: its rotation applied, a blank page white, the rectangles painted black.
// The rectangles grow to whole pixels outward, so no sliver of what they cover stays visible at their edges.
export async function paintEntry(doc, entry, scale, withMarks = false) {
  const canvas = document.createElement('canvas');
  if (entry.blank) {
    const { width, height } = await entrySize(doc, entry);
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    await renderPage(doc, entry.source, entry.rotation, canvas, scale);
  }
  const context = canvas.getContext('2d');
  context.fillStyle = '#000000';
  for (const { x, y, w, h } of entry.redactions) {
    const left = Math.floor(x * canvas.width);
    const top = Math.floor(y * canvas.height);
    context.fillRect(left, top, Math.ceil((x + w) * canvas.width) - left, Math.ceil((y + h) * canvas.height) - top);
  }
  if (withMarks) await paintMarks(canvas, entry.marks);
  return canvas;
}

const toBlob = async (canvas, type, quality) => {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  if (!blob) throw new Error(t('error.page-large'));
  return blob;
};

export async function burnPage(doc, entry) {
  const { width, height } = await pageSize(doc, entry.source, entry.rotation);
  const canvas = await paintEntry(doc, entry, Math.min(BURN_SCALE, MAX_SIDE / Math.max(width, height)));
  return { bytes: new Uint8Array(await (await toBlob(canvas, 'image/jpeg', 0.92)).arrayBuffer()), width, height };
}

// A page as a PNG or JPEG file at `dpi`, lowered when the page would not fit in a canvas.
export async function entryImage(doc, entry, dpi, type) {
  const size = await entrySize(doc, entry);
  const scale = Math.min(dpi / 72, MAX_SIDE / Math.max(size.width, size.height));
  return toBlob(await paintEntry(doc, entry, scale, true), type, 0.92);
}

// The share of a page that is not white, drawn small: it tells a blank page from one that holds something. Also a thumbnail
// `thumbWidth` pixels wide, to show which page it is.
export async function inkOf(doc, index, thumbWidth = 72) {
  const canvas = document.createElement('canvas');
  await renderPage(doc, index, 0, canvas, 0.3);
  const { data } = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
  let ink = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] < 600) ink++;
  const thumb = document.createElement('canvas');
  thumb.width = thumbWidth;
  thumb.height = Math.max(1, Math.round((canvas.height * thumbWidth) / canvas.width));
  thumb.getContext('2d').drawImage(canvas, 0, 0, thumb.width, thumb.height);
  return { ink: ink / (canvas.width * canvas.height), thumb };
}

// The text of a page in reading order: from the position of each run, not from the order the file draws them in.
export async function textOf(doc, index) {
  const page = await doc.getPage(index + 1);
  const viewport = viewportOf(page, 1, 0);
  const { items } = await page.getTextContent();
  return readingText(
    items
      .filter((item) => 'str' in item)
      .map((item) => {
        const m = multiply(viewport.transform, item.transform);
        return { text: item.str, x: m[4], y: m[5], width: item.width * viewport.scale, height: Math.hypot(m[2], m[3]) || item.height * viewport.scale };
      }),
  );
}

// The text of a page as it is displayed, and the box of each text run on it, so that a match in the text can be covered.
export async function pageRuns(doc, entry) {
  const page = await doc.getPage(entry.source + 1);
  const viewport = viewportOf(page, 1, entry.rotation);
  const { items } = await page.getTextContent();
  const runs = [];
  let text = '';
  for (const item of items) {
    if (!item.str) {
      if (item.hasEOL) text += '\n';
      continue;
    }
    if (text && !/\s$/.test(text) && !/^\s/.test(item.str)) text += ' ';
    const box = runBox(multiply(viewport.transform, item.transform), item.width * viewport.scale, viewport.width, viewport.height);
    runs.push({ start: text.length, end: text.length + item.str.length, box });
    text += item.str;
    if (item.hasEOL) text += '\n';
  }
  return { text, runs };
}
