import { LEVELS, compressPdf, formatSize } from './compress.js';
import { byId } from './dom.js';
import { download } from './download.js';
import { closeRender, openRender, pageSize, renderPage } from './render.js';

const COMPARE_WIDTH = 860;

// Redraws a JPEG at a smaller size and quality; the EXIF orientation is ignored, a PDF ignores it too.
async function encode({ bytes, maxSide, quality }) {
  await new Promise((resolve) => setTimeout(resolve));
  try {
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }), { imageOrientation: 'none' });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob ? { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height } : null;
  } catch {
    return null;
  }
}

export function initCompress() {
  const panel = byId('panel-compress');
  const input = byId('compress-file');
  const levels = byId('compress-levels');
  const downloadButton = byId('compress-download');
  const note = byId('compress-note');
  const status = byId('compress-status');

  let file = null;
  let level = 'balanced';
  let results = new Map();
  let token = 0;

  const compare = byId('compare');
  const stage = byId('compare-stage');
  const handle = byId('compare-handle');
  let beforeDoc = null;
  let comparePage = 0;
  let paintToken = 0;

  function setSplit(percent) {
    const split = Math.max(0, Math.min(100, percent));
    stage.style.setProperty('--split', `${split}%`);
    handle.setAttribute('aria-valuenow', String(Math.round(split)));
  }
  const followPointer = (event) => {
    const box = stage.getBoundingClientRect();
    setSplit(((event.clientX - box.left) / box.width) * 100);
  };
  stage.addEventListener('pointerdown', (event) => {
    stage.setPointerCapture(event.pointerId);
    followPointer(event);
    handle.focus();
  });
  stage.addEventListener('pointermove', (event) => stage.hasPointerCapture(event.pointerId) && followPointer(event));
  handle.addEventListener('keydown', (event) => {
    const now = Number(handle.getAttribute('aria-valuenow'));
    const target = { ArrowLeft: now - (event.shiftKey ? 20 : 5), ArrowRight: now + (event.shiftKey ? 20 : 5), Home: 0, End: 100 }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    setSplit(target);
  });

  async function closeCompare() {
    paintToken += 1;
    const doc = beforeDoc;
    beforeDoc = null;
    if (doc) closeRender(await doc);
  }

  async function paint() {
    const mine = ++paintToken;
    const result = results.get(level);
    compare.hidden = !file || !result;
    if (compare.hidden) return;
    byId('compare-before-size').textContent = formatSize(file.bytes.length);
    byId('compare-after-size').textContent = formatSize(result.length);
    let after = null;
    try {
      beforeDoc ??= openRender(file.bytes);
      after = await openRender(result);
      const before = await beforeDoc;
      if (mine !== paintToken) return;
      comparePage = Math.min(comparePage, before.numPages - 1);
      byId('compare-page').textContent = `Page ${comparePage + 1} of ${before.numPages}`;
      byId('compare-prev').disabled = comparePage === 0;
      byId('compare-next').disabled = comparePage === before.numPages - 1;
      const scale = (COMPARE_WIDTH * devicePixelRatio) / (await pageSize(before, comparePage, 0)).width;
      const canvases = [document.createElement('canvas'), document.createElement('canvas')];
      await Promise.all([renderPage(before, comparePage, 0, canvases[0], scale), renderPage(after, comparePage, 0, canvases[1], scale)]);
      if (mine === paintToken) byId('compare-pages').replaceChildren(...canvases);
    } catch {
      if (mine === paintToken) compare.hidden = true;
    } finally {
      if (after) closeRender(after);
    }
  }
  for (const [id, step] of /** @type {Array<[string, number]>} */ ([['compare-prev', -1], ['compare-next', 1]])) {
    byId(id).addEventListener('click', () => {
      comparePage += step;
      paint();
    });
  }

  const setStatus = (text) => {
    status.textContent = text;
    note.textContent = text;
  };

  levels.replaceChildren(
    ...LEVELS.map(([id, text]) => {
      const label = document.createElement('label');
      const radio = Object.assign(document.createElement('input'), { type: 'radio', name: 'compress-level', value: id, checked: id === level });
      radio.addEventListener('change', () => {
        level = id;
        show();
      });
      label.append(radio, Object.assign(document.createElement('span'), { textContent: String(text) }));
      return label;
    }),
  );

  function show() {
    const result = results.get(level);
    byId('compress-describe').textContent = String(LEVELS.find(([id]) => id === level)[2]);
    const text = byId('compress-result');
    const bar = byId('compress-bar');
    downloadButton.disabled = true;
    if (!file) return;
    if (!result) {
      text.textContent = 'Working on it...';
      bar.style.width = '100%';
      paint();
      run(level);
      return;
    }
    paint();
    const saved = 1 - result.length / file.bytes.length;
    bar.style.width = `${Math.max(2, Math.min(100, (result.length / file.bytes.length) * 100))}%`;
    if (result.length < file.bytes.length) {
      text.replaceChildren(`${formatSize(file.bytes.length)} to `, Object.assign(document.createElement('strong'), { textContent: formatSize(result.length) }), `, ${Math.round(saved * 100)} % smaller.`);
      downloadButton.disabled = false;
    } else {
      text.textContent = 'No saving at this level: the file is already compact. Try a stronger one.';
    }
  }

  async function run(chosen) {
    const mine = token;
    const bytes = file.bytes;
    try {
      const result = await compressPdf(bytes, chosen, encode, (done, total) => {
        if (mine === token && level === chosen && total) byId('compress-result').textContent = `Re-encoding the images: ${done} of ${total}...`;
      });
      if (mine !== token) return;
      results.set(chosen, result);
      if (level === chosen) show();
    } catch (error) {
      if (mine === token) {
        results.set(chosen, bytes);
        setStatus(`Cannot compress this file: ${error.message}`);
        byId('compress-result').textContent = '';
      }
    }
  }

  async function open(chosen) {
    if (!chosen) return;
    const bytes = new Uint8Array(await chosen.arrayBuffer());
    if (new TextDecoder('latin1').decode(bytes.subarray(0, 1024)).indexOf('%PDF-') < 0) {
      setStatus(`Cannot read ${chosen.name}: not a PDF.`);
      return;
    }
    token += 1;
    await closeCompare();
    file = { name: chosen.name, bytes };
    results = new Map();
    comparePage = 0;
    setSplit(50);
    setStatus('');
    panel.removeAttribute('data-empty');
    byId('compress-name').textContent = chosen.name;
    byId('compress-name').title = chosen.name;
    byId('compress-size').textContent = formatSize(bytes.length);
    show();
  }

  input.addEventListener('change', async () => {
    await open(input.files[0]);
    input.value = '';
  });
  for (const id of ['open-compress', 'choose-compress']) byId(id).addEventListener('click', () => input.click());
  downloadButton.addEventListener('click', () => {
    const result = results.get(level);
    if (result) download(new Blob([result], { type: 'application/pdf' }), `${file.name.replace(/\.pdf$/i, '')}-compressed.pdf`);
  });

  return { open };
}
