import * as pdfjs from './vendor/pdfjs/pdf.min.mjs';

const resource = (path) => new URL(`vendor/pdfjs/${path}`, import.meta.url).href;
const MAX_SIDE = 8000;
const BURN_SCALE = 2;

pdfjs.GlobalWorkerOptions.workerSrc = resource('pdf.worker.min.mjs');

export function openRender(bytes) {
  return pdfjs.getDocument({
    data: bytes.slice(),
    isEvalSupported: false,
    cMapUrl: resource('cmaps/'),
    cMapPacked: true,
    standardFontDataUrl: resource('standard_fonts/'),
    wasmUrl: resource('wasm/'),
    iccUrl: resource('iccs/'),
  }).promise;
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

// The rectangles grow to whole pixels outward, so no sliver of what they cover stays visible at their edges.
export async function burnPage(doc, entry) {
  const { width, height } = await pageSize(doc, entry.source, entry.rotation);
  const canvas = document.createElement('canvas');
  await renderPage(doc, entry.source, entry.rotation, canvas, Math.min(BURN_SCALE, MAX_SIDE / Math.max(width, height)));
  const context = canvas.getContext('2d');
  context.fillStyle = '#000000';
  for (const { x, y, w, h } of entry.redactions) {
    const left = Math.floor(x * canvas.width);
    const top = Math.floor(y * canvas.height);
    context.fillRect(left, top, Math.ceil((x + w) * canvas.width) - left, Math.ceil((y + h) * canvas.height) - top);
  }
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  if (!blob) throw new Error('The page is too large to redact.');
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
}
