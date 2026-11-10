import * as pdfjs from './vendor/pdfjs/pdf.min.mjs';
import { multiply, runBox } from './find.js';
import { readingText } from './reading-order.js';
import { HIGHLIGHT_OPACITY, TEXT_RISE, shapeParts } from './marks.js';
import { textSizeOn } from './pages-model.js';
import { adjustMatrix } from './page-adjust.js';
import { Failure } from './i18n.js';

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

// `adjusted` is the page of the document, when its angle, its mirror and its crop are to be drawn too.
export async function renderPage(doc, index, rotation, canvas, scale, adjusted = null) {
  const page = await doc.getPage(index + 1);
  const viewport = viewportOf(page, scale, rotation);
  const crop = adjusted?.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  canvas.width = Math.ceil(viewport.width * crop.w);
  canvas.height = Math.ceil(viewport.height * crop.h);
  const turn = (adjusted && adjustMatrix(adjusted, viewport.width, viewport.height)) ?? [1, 0, 0, 1, 0, 0];
  const transform = multiply([1, 0, 0, 1, -crop.x * viewport.width, -crop.y * viewport.height], turn);
  await page.render({ canvas, viewport, background: '#ffffff', transform }).promise;
}

// The size of a page as it is displayed, in points: its rotation and its crop applied.
export async function entrySize(doc, entry) {
  if (entry.blank) return entry.rotation % 180 ? { width: entry.blank.height, height: entry.blank.width } : entry.blank;
  const { width, height } = await pageSize(doc, entry.source, entry.rotation);
  return entry.crop ? { width: width * entry.crop.w, height: height * entry.crop.h } : { width, height };
}

// A part of a canvas, as fractions of it.
function cropCanvas(canvas, { x, y, w, h }) {
  const part = document.createElement('canvas');
  part.width = Math.max(1, Math.round(canvas.width * w));
  part.height = Math.max(1, Math.round(canvas.height * h));
  part.getContext('2d').drawImage(canvas, -Math.round(canvas.width * x), -Math.round(canvas.height * y));
  return part;
}

// The outline of a file as a tree of { title, page, items }, `page` being the index of the page an entry points to, or null
// when it points nowhere in the file.
export async function outlineTree(doc) {
  const pageOf = async (dest) => {
    try {
      const target = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
      if (!target) return null;
      return typeof target[0] === 'number' ? target[0] : await doc.getPageIndex(target[0]);
    } catch {
      return null;
    }
  };
  const walk = (items) => Promise.all(items.map(async (item) => ({ title: item.title, page: await pageOf(item.dest), items: await walk(item.items ?? []) })));
  return walk((await doc.getOutline()) ?? []);
}

// The indexes of the pages where the top-level entries of the outline of a file begin.
export async function outlineStarts(doc) {
  return new Set((await outlineTree(doc)).map((item) => item.page).filter((page) => page !== null));
}

const bitmaps = new WeakMap();

// A shape drawn on a canvas as it will be in the PDF.
export function paintShape(context, mark, width, height) {
  const { box, lines, thickness, color } = shapeParts(mark, width, height);
  const css = `rgb(${color.map((part) => Math.round(part * 255)).join(' ')})`;
  context.save();
  if (box && mark.shape === 'highlight') {
    context.globalAlpha = HIGHLIGHT_OPACITY;
    context.globalCompositeOperation = 'multiply';
    context.fillStyle = css;
    context.fillRect(...box);
  } else if (box) {
    context.strokeStyle = css;
    context.lineWidth = thickness;
    context.strokeRect(...box);
  }
  context.strokeStyle = css;
  context.lineWidth = thickness;
  context.lineCap = 'round';
  for (const [x1, y1, x2, y2] of lines) {
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.stroke();
  }
  context.restore();
}

// The pictures and the lines of text put on a page, drawn on its canvas as they will be in the PDF.
async function paintMarks(canvas, marks) {
  const context = canvas.getContext('2d');
  for (const mark of marks) {
    if (mark.kind === 'shape') {
      paintShape(context, mark, canvas.width, canvas.height);
      continue;
    }
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

// A page as it will be downloaded, drawn at `scale`: its rotation applied, a blank page white, the rectangles painted black,
// then cut to its crop. The rectangles grow to whole pixels outward, so no sliver of what they cover stays visible at their edges.
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
    await renderPage(doc, entry.source, entry.rotation, canvas, scale, { ...entry, crop: null });
  }
  const context = canvas.getContext('2d');
  context.fillStyle = '#000000';
  for (const { x, y, w, h } of entry.redactions) {
    const left = Math.floor(x * canvas.width);
    const top = Math.floor(y * canvas.height);
    context.fillRect(left, top, Math.ceil((x + w) * canvas.width) - left, Math.ceil((y + h) * canvas.height) - top);
  }
  if (withMarks) await paintMarks(canvas, entry.marks);
  return entry.crop ? cropCanvas(canvas, entry.crop) : canvas;
}

const toBlob = async (canvas, type, quality) => {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  if (!blob) throw new Failure('error.page-large');
  return blob;
};

// The picture that replaces a page in the output. A crop that removes what is outside cuts the picture, the marks drawn in it;
// otherwise the page is whole and the output crops it and draws the marks.
export async function burnPage(doc, entry) {
  const { width, height } = await pageSize(doc, entry.source, entry.rotation);
  const scale = Math.min(BURN_SCALE, MAX_SIDE / Math.max(width, height));
  const removed = entry.crop?.remove;
  const canvas = await paintEntry(doc, removed ? entry : { ...entry, crop: null }, scale, removed);
  const size = removed ? { width: width * entry.crop.w, height: height * entry.crop.h } : { width, height };
  return { bytes: new Uint8Array(await (await toBlob(canvas, 'image/jpeg', 0.92)).arrayBuffer()), ...size };
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
  const shown = multiply(adjustMatrix(entry, viewport.width, viewport.height) ?? [1, 0, 0, 1, 0, 0], viewport.transform);
  const { items } = await page.getTextContent();
  const runs = [];
  let text = '';
  for (const item of items) {
    if (!item.str) {
      if (item.hasEOL) text += '\n';
      continue;
    }
    if (text && !/\s$/.test(text) && !/^\s/.test(item.str)) text += ' ';
    const box = runBox(multiply(shown, item.transform), item.width * viewport.scale, viewport.width, viewport.height);
    runs.push({ start: text.length, end: text.length + item.str.length, box });
    text += item.str;
    if (item.hasEOL) text += '\n';
  }
  return { text, runs };
}
