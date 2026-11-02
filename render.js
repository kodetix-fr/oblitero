import * as pdfjs from './vendor/pdfjs/pdf.min.mjs';
import { multiply, runBox } from './find.js';
import { t } from './i18n.js';

const resource = (path) => new URL(`vendor/pdfjs/${path}`, import.meta.url).href;
const MAX_SIDE = 8000;
const BURN_SCALE = 2;

pdfjs.GlobalWorkerOptions.workerSrc = resource('pdf.worker.min.mjs');

const tasks = new WeakMap();

export async function openRender(bytes) {
  const task = pdfjs.getDocument({
    data: bytes.slice(),
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
  if (entry.blank) return entry.rotation % 180 ? { width: entry.blank.height, height: entry.blank.width } : { width: entry.blank.width, height: entry.blank.height };
  return pageSize(doc, entry.source, entry.rotation);
}

const bitmaps = new WeakMap();

// The pictures and the lines of text put on a page, drawn on its canvas as they will be in the PDF.
async function paintMarks(canvas, marks) {
  const context = canvas.getContext('2d');
  for (const mark of marks ?? []) {
    if (mark.kind === 'image') {
      if (!bitmaps.has(mark.png)) bitmaps.set(mark.png, await createImageBitmap(new Blob([mark.png], { type: 'image/png' })));
      context.drawImage(bitmaps.get(mark.png), mark.x * canvas.width, mark.y * canvas.height, mark.w * canvas.width, mark.h * canvas.height);
    } else {
      const size = mark.size * canvas.width;
      context.fillStyle = '#0f0f1a';
      context.font = `${size}px Helvetica, Arial, sans-serif`;
      context.textBaseline = 'alphabetic';
      context.fillText(mark.text, mark.x * canvas.width, mark.y * canvas.height + size * 0.8);
    }
  }
}

// A page as it will be downloaded, drawn at `scale`: its rotation applied, a blank page white, the rectangles painted black.
// The rectangles grow to whole pixels outward, so no sliver of what they cover stays visible at their edges.
export async function paintEntry(doc, entry, scale, withMarks = false) {
  const canvas = document.createElement('canvas');
  if (entry.blank) {
    const turned = entry.rotation % 180 !== 0;
    canvas.width = Math.ceil((turned ? entry.blank.height : entry.blank.width) * scale);
    canvas.height = Math.ceil((turned ? entry.blank.width : entry.blank.height) * scale);
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
  const size = entry.blank ? { width: entry.blank.width, height: entry.blank.height } : await pageSize(doc, entry.source, entry.rotation);
  const scale = Math.min(dpi / 72, MAX_SIDE / Math.max(size.width, size.height));
  return toBlob(await paintEntry(doc, entry, scale, true), type, 0.92);
}

// The share of a page that is not white, drawn small: it tells a blank page from one that holds something.
export async function inkOf(doc, index) {
  const canvas = document.createElement('canvas');
  await renderPage(doc, index, 0, canvas, 0.3);
  const { data } = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
  let ink = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] < 600) ink++;
  return ink / (canvas.width * canvas.height);
}

export async function textOf(doc, index) {
  const page = await doc.getPage(index + 1);
  const { items } = await page.getTextContent();
  return items.map((item) => item.str + (item.hasEOL ? '\n' : '')).join('').replace(/[ \t]+\n/g, '\n').trim();
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
