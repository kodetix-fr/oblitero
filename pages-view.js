import { countPages } from './merge.js';
import { buildPdf } from './export.js';
import { buildZip } from './zip.js';
import { burnPage, openRender, pageSize, renderPage } from './render.js';
import { createPages, movePages, rangeIds, removePages, rotatePages } from './pages-model.js';
import { openRedactor } from './redact-view.js';
import { byId } from './dom.js';
import { download } from './download.js';

const THUMB_WIDTH = 150;

export function initPages() {
  const fileInput = byId('pages-file');
  const tools = byId('pages-tools');
  const grid = byId('grid');
  const status = byId('pages-status');
  const controls = {
    selectAll: byId('select-all'),
    selectNone: byId('select-none'),
    rotateLeft: byId('rotate-left'),
    rotateRight: byId('rotate-right'),
    earlier: byId('move-earlier'),
    later: byId('move-later'),
    remove: byId('delete'),
    redact: byId('redact'),
    downloadAll: byId('download-all'),
    downloadSelected: byId('download-selected'),
    split: byId('split'),
  };
  const splitSize = byId('split-size');

  let source = null;
  let pages = [];
  let selected = new Set();
  let anchor = null;
  let generation = 0;
  let renders = Promise.resolve();
  const thumbs = new Map();
  const cards = new Map();

  const setStatus = (text) => {
    status.textContent = text;
  };

  const observer = new IntersectionObserver((records) => {
    for (const record of records) {
      if (!record.isIntersecting) continue;
      observer.unobserve(record.target);
      const thumb = thumbs.get(/** @type {HTMLElement} */ (record.target).dataset.key);
      if (thumb && thumb.state === 'idle') {
        thumb.state = 'queued';
        const current = generation;
        renders = renders.then(() => drawThumb(thumb, current));
      }
    }
  });

  async function drawThumb(thumb, current) {
    if (current !== generation) return;
    try {
      const { width } = await pageSize(source.doc, thumb.source, thumb.rotation);
      await renderPage(source.doc, thumb.source, thumb.rotation, thumb.canvas, (THUMB_WIDTH * devicePixelRatio) / width);
      thumb.state = 'done';
    } catch {
      thumb.state = 'failed';
    }
  }

  function thumbOf(page) {
    const key = `${generation}:${page.source}:${page.rotation}`;
    let thumb = thumbs.get(key);
    if (!thumb) {
      const canvas = document.createElement('canvas');
      canvas.dataset.key = key;
      thumb = { canvas, source: page.source, rotation: page.rotation, state: 'idle' };
      thumbs.set(key, thumb);
    }
    observer.observe(thumb.canvas);
    return thumb.canvas;
  }

  function card(page, index) {
    const item = document.createElement('li');
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'card';
    const count = page.redactions.length;
    toggle.setAttribute('aria-label', `Page ${index + 1}${count ? `, ${count} redaction${count === 1 ? '' : 's'}` : ''}`);
    toggle.setAttribute('aria-pressed', String(selected.has(page.id)));

    const thumb = document.createElement('span');
    thumb.className = 'thumb';
    thumb.append(thumbOf(page));
    for (const { x, y, w, h } of page.redactions) {
      const box = document.createElement('span');
      box.className = 'box';
      Object.assign(box.style, { left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` });
      thumb.append(box);
    }
    const label = document.createElement('span');
    label.textContent = String(index + 1);
    toggle.append(thumb, label);
    toggle.addEventListener('click', (event) => choose(page.id, event.shiftKey));
    item.append(toggle);
    cards.set(page.id, toggle);
    return item;
  }

  function render() {
    cards.clear();
    grid.replaceChildren(...pages.map(card));
    refresh();
  }

  function refresh() {
    for (const [id, element] of cards) element.setAttribute('aria-pressed', String(selected.has(id)));
    const none = selected.size === 0;
    const empty = pages.length === 0;
    controls.selectAll.disabled = empty;
    controls.selectNone.disabled = none;
    for (const name of ['rotateLeft', 'rotateRight', 'earlier', 'later', 'remove', 'downloadSelected']) controls[name].disabled = none;
    controls.redact.disabled = selected.size !== 1;
    controls.downloadAll.disabled = empty;
    controls.split.disabled = empty;
  }

  function choose(id, extend) {
    if (extend && anchor !== null) {
      for (const other of rangeIds(pages, anchor, id)) selected.add(other);
    } else {
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      anchor = id;
    }
    refresh();
  }

  function change(next) {
    pages = next;
    selected = new Set([...selected].filter((id) => pages.some((page) => page.id === id)));
    render();
  }

  async function open(file) {
    if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const count = await countPages(bytes);
      const doc = await openRender(bytes);
      source?.doc.destroy();
      generation += 1;
      thumbs.clear();
      source = { name: file.name, bytes, doc };
      selected = new Set();
      anchor = null;
      pages = createPages(count);
      tools.hidden = false;
      setStatus('');
      render();
    } catch {
      setStatus(`Cannot read ${file.name}: not a PDF, encrypted or damaged.`);
    }
  }

  const stem = () => source.name.replace(/\.pdf$/i, '');
  const asPdf = async (entries) =>
    new Blob([await buildPdf(source.bytes, entries, (entry) => burnPage(source.doc, entry))], { type: 'application/pdf' });

  async function run(label, work) {
    for (const control of Object.values(controls)) control.disabled = true;
    setStatus(label);
    try {
      await work();
      setStatus('');
    } catch (error) {
      setStatus(`Failed: ${error.message}`);
    } finally {
      refresh();
    }
  }

  fileInput.addEventListener('change', async () => {
    await open(fileInput.files[0]);
    fileInput.value = '';
  });
  controls.selectAll.addEventListener('click', () => {
    selected = new Set(pages.map((page) => page.id));
    refresh();
  });
  controls.selectNone.addEventListener('click', () => {
    selected = new Set();
    refresh();
  });
  controls.rotateLeft.addEventListener('click', () => change(rotatePages(pages, selected, -90)));
  controls.rotateRight.addEventListener('click', () => change(rotatePages(pages, selected, 90)));
  controls.earlier.addEventListener('click', () => change(movePages(pages, selected, -1)));
  controls.later.addEventListener('click', () => change(movePages(pages, selected, 1)));
  controls.remove.addEventListener('click', () => change(removePages(pages, selected)));
  controls.redact.addEventListener('click', async () => {
    const [id] = selected;
    try {
      const rectangles = await openRedactor(source.doc, pages.find((page) => page.id === id));
      if (rectangles) change(pages.map((page) => (page.id === id ? { ...page, redactions: rectangles } : page)));
    } catch (error) {
      setStatus(`Cannot open the page: ${error.message}`);
    }
  });
  controls.downloadAll.addEventListener('click', () =>
    run('Preparing the PDF...', async () => download(await asPdf(pages), `${stem()}-edited.pdf`)),
  );
  controls.downloadSelected.addEventListener('click', () =>
    run('Preparing the PDF...', async () => download(await asPdf(pages.filter((page) => selected.has(page.id))), `${stem()}-pages.pdf`)),
  );
  controls.split.addEventListener('click', () =>
    run('Splitting...', async () => {
      const size = Math.max(1, Math.floor(Number(splitSize.value)) || 1);
      const files = [];
      for (let start = 0; start < pages.length; start += size) {
        setStatus(`Splitting: part ${files.length + 1} of ${Math.ceil(pages.length / size)}...`);
        files.push({ name: `${stem()}-${String(files.length + 1).padStart(3, '0')}.pdf`, blob: await asPdf(pages.slice(start, start + size)) });
      }
      download(await buildZip(files), `${stem()}-split.zip`);
    }),
  );

  return { open };
}
