import { countPages } from './merge.js';
import { buildPdf } from './export.js';
import { buildZip } from './zip.js';
import { burnPage, closeRender, entryImage, inkOf, openRender, pageRuns, pageSize, renderPage, textOf } from './render.js';
import { blankPage, createPages, cutEvery, duplicate, insertEntries, parseRange, exportParts, keepCuts, movePages, partsOf, place, rangeIds, rotatePages, showAll, toggleCuts, toggleHidden, visible } from './pages-model.js';
import { createHistory } from './history.js';
import { openRedactor } from './redact-view.js';
import { applyStamps } from './stamps.js';
import { initFind } from './find-view.js';
import { initSign } from './sign-view.js';
import { initProperties } from './properties-view.js';
import { DEFAULT_PROPERTIES, applyProperties } from './properties.js';
import { placeMark } from './place-view.js';
import { imageMark, textMark } from './marks.js';
import { initStamps } from './stamp-view.js';
import { byId, copyCanvas, icon, nearestEntry, sortable } from './dom.js';
import { download } from './download.js';

const THUMB_WIDTH = 150;
const THUMB_HEIGHT = 220;
const THUMB_QUALITY = 1.75;
const BLANK_INK = 0.0003;
const A4 = { width: 595.28, height: 841.89 };
const TONES = 7;
const MARQUEE_THRESHOLD = 4;

export function initPages() {
  const panel = byId('panel-pages');
  const stage = byId('panel-pages').querySelector('.stage');
  const dialog = byId('redact-dialog');
  const fileInput = byId('pages-file');
  const grid = byId('grid');
  const status = byId('pages-status');
  const note = byId('pages-note');
  const name = byId('pages-name');
  const summary = byId('selection-summary');
  const partsLabel = byId('parts-label');
  const hideLabel = byId('hide-label');
  const hideIcon = byId('hide-icon');
  const showHiddenLabel = byId('show-hidden-label');
  const splitSize = byId('split-size');
  const rangeInput = byId('select-range');
  const zoom = byId('zoom');
  const insertInput = byId('insert-file');
  const controls = {
    insertPdf: byId('insert-pdf'),
    addBlank: byId('add-blank'),
    duplicate: byId('duplicate'),
    selectOdd: byId('select-odd'),
    selectEven: byId('select-even'),
    hideBlank: byId('hide-blank'),
    extractText: byId('extract-text'),
    stamps: byId('stamps'),
    find: byId('find'),
    sign: byId('sign'),
    properties: byId('properties'),
    addText: byId('add-text'),
    clearMarks: byId('clear-marks'),
    exportImages: byId('export-images'),
    undo: byId('undo'),
    redo: byId('redo'),
    selectAll: byId('select-all'),
    selectNone: byId('select-none'),
    rotateLeft: byId('rotate-left'),
    rotateRight: byId('rotate-right'),
    earlier: byId('move-earlier'),
    later: byId('move-later'),
    hide: byId('hide'),
    showHidden: byId('show-hidden'),
    cut: byId('cut'),
    redact: byId('redact'),
    downloadAll: byId('download-all'),
    downloadSelected: byId('download-selected'),
    cutEvery: byId('cut-every'),
    clearCuts: byId('clear-cuts'),
    downloadParts: byId('download-parts'),
  };

  let stamps = { numbers: null, watermark: null };
  const stampDialog = initStamps();
  const finder = initFind();
  const signer = initSign();
  const propertiesDialog = initProperties();
  let properties = { ...DEFAULT_PROPERTIES };
  let nextMark = 0;
  let documents = [];
  let nextId = 0;
  let pages = [];
  let cuts = new Set();
  let selected = new Set();
  let anchor = null;
  let focusId = null;
  let generation = 0;
  let renders = Promise.resolve();
  const history = createHistory();
  const drag = { source: null, group: new Set() };
  const thumbs = new Map();
  const items = new Map();
  const cards = new Map();

  const setStatus = (text) => {
    status.textContent = text;
    note.textContent = text;
  };
  const urls = new WeakMap();
  const markUrl = (png) => {
    if (!urls.has(png)) urls.set(png, URL.createObjectURL(new Blob([png], { type: 'image/png' })));
    return urls.get(png);
  };
  const thumbKey = (page) => `${generation}:${page.id}:${page.rotation}`;
  const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

  // ---------- thumbnails, drawn when they come into view ----------

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
      const turned = thumb.rotation % 180 !== 0;
      const size = thumb.blank
        ? { width: turned ? thumb.blank.height : thumb.blank.width, height: turned ? thumb.blank.width : thumb.blank.height }
        : await pageSize(documents[thumb.file].doc, thumb.source, thumb.rotation);
      const fit = Math.min(THUMB_WIDTH / size.width, THUMB_HEIGHT / size.height);
      thumb.canvas.style.setProperty('--fit', String((size.width * fit) / THUMB_WIDTH));
      thumb.canvas.parentElement?.style.setProperty('--fit', String((size.width * fit) / THUMB_WIDTH));
      if (thumb.blank) {
        thumb.canvas.width = Math.ceil(size.width * fit);
        thumb.canvas.height = Math.ceil(size.height * fit);
      } else {
        await renderPage(documents[thumb.file].doc, thumb.source, thumb.rotation, thumb.canvas, fit * THUMB_QUALITY * devicePixelRatio);
      }
      thumb.state = 'done';
    } catch {
      thumb.state = 'failed';
    }
  }

  function thumbOf(page) {
    const key = thumbKey(page);
    let thumb = thumbs.get(key);
    if (!thumb) {
      const canvas = document.createElement('canvas');
      canvas.dataset.key = key;
      thumb = { canvas, file: page.file, source: page.source, blank: page.blank, rotation: page.rotation, state: 'idle' };
      thumbs.set(key, thumb);
    }
    observer.observe(thumb.canvas);
    return thumb.canvas;
  }

  // ---------- the grid ----------

  function setFocus(id) {
    if (focusId === id) return;
    const previous = cards.get(focusId);
    if (previous) previous.tabIndex = -1;
    focusId = id;
    const next = cards.get(id);
    if (next) next.tabIndex = 0;
  }

  function card(page, index, last, part, parted) {
    const item = document.createElement('li');
    item.draggable = true;
    item.dataset.id = String(page.id);
    if (parted) {
      item.dataset.part = String(part);
      item.style.setProperty('--tone', String(((part * 360) / TONES) | 0));
    }
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'card';
    toggle.tabIndex = page.id === focusId ? 0 : -1;
    const count = page.redactions.length;
    toggle.setAttribute('aria-label', `Page ${index + 1}${page.blank ? ', blank' : ''}${count ? `, ${plural(count, 'redaction')}` : ''}${page.hidden ? ', hidden' : ''}`);
    toggle.setAttribute('aria-pressed', String(selected.has(page.id)));

    const check = document.createElement('span');
    check.className = 'check';
    check.append(icon('check'));
    toggle.append(check);
    if (count) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = `${count} redacted`;
      toggle.append(badge);
    }
    const thumb = document.createElement('span');
    thumb.className = 'thumb';
    thumb.append(thumbOf(page));
    for (const { x, y, w, h } of page.redactions) {
      const box = document.createElement('span');
      box.className = 'box';
      Object.assign(box.style, { left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` });
      thumb.append(box);
    }
    for (const mark of page.marks ?? []) {
      if (mark.kind === 'image') {
        const picture = Object.assign(document.createElement('img'), { className: 'mark-img', src: markUrl(mark.png), alt: '' });
        Object.assign(picture.style, { left: `${mark.x * 100}%`, top: `${mark.y * 100}%`, width: `${mark.w * 100}%`, height: `${mark.h * 100}%` });
        thumb.append(picture);
      } else {
        const text = Object.assign(document.createElement('span'), { className: 'mark-text', textContent: mark.text });
        Object.assign(text.style, { left: `${mark.x * 100}%`, top: `${mark.y * 100}%` });
        text.style.setProperty('--size', String(mark.size));
        thumb.append(text);
      }
    }
    thumb.style.setProperty('--fit', thumb.querySelector('canvas').style.getPropertyValue('--fit') || '1');
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = String(index + 1);
    toggle.append(thumb, label);
    if (page.hidden) {
      const mark = document.createElement('span');
      mark.className = 'hidden-mark';
      mark.append(icon('eye-off'));
      toggle.append(mark);
      item.dataset.hidden = '';
    }
    toggle.addEventListener('click', (event) => choose(page.id, event.shiftKey));
    toggle.addEventListener('focus', () => setFocus(page.id));
    item.append(toggle);

    if (!last) {
      const has = cuts.has(page.id);
      const cut = document.createElement('button');
      cut.type = 'button';
      cut.className = 'cut';
      cut.tabIndex = -1;
      cut.title = has ? 'Remove this cut' : 'Cut here';
      cut.setAttribute('aria-label', has ? `Remove the cut after page ${index + 1}` : `Cut after page ${index + 1}`);
      cut.setAttribute('aria-pressed', String(has));
      cut.append(icon('cut'));
      cut.addEventListener('click', () => commit({ cuts: toggleCuts(pages, cuts, new Set([page.id])) }));
      item.append(cut);
      if (has) item.dataset.cut = '';
    }
    items.set(page.id, item);
    cards.set(page.id, toggle);
    return item;
  }

  const measure = () => new Map([...items].map(([id, element]) => [id, element.getBoundingClientRect()]));

  // The cards that moved glide from their old place to the new one.
  function flip(before) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const [id, element] of items) {
      const old = before.get(id);
      if (!old) continue;
      const now = element.getBoundingClientRect();
      const dx = old.left - now.left;
      const dy = old.top - now.top;
      if (dx || dy) element.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  }

  function render(before = new Map()) {
    const hadFocus = grid.contains(document.activeElement);
    if (!pages.some((page) => page.id === focusId)) focusId = pages[0]?.id ?? null;
    cards.clear();
    items.clear();
    const parts = partsOf(pages, cuts);
    const partOf = new Map();
    parts.forEach((part, index) => part.forEach((page) => partOf.set(page.id, index)));
    grid.replaceChildren(...pages.map((page, index) => card(page, index, index === pages.length - 1, partOf.get(page.id), parts.length > 1)));
    refresh();
    flip(before);
    if (hadFocus) cards.get(focusId)?.focus();
  }

  function refresh() {
    for (const [id, element] of cards) element.setAttribute('aria-pressed', String(selected.has(id)));
    const none = selected.size === 0;
    const empty = pages.length === 0;
    const parts = exportParts(pages, cuts).length;
    const shown = visible(pages).length;
    const hidden = pages.length - shown;
    const chosen = pages.filter((page) => selected.has(page.id));
    const allHidden = chosen.length > 0 && chosen.every((page) => page.hidden);
    panel.toggleAttribute('data-empty', documents.length === 0);
    controls.undo.disabled = !history.canUndo;
    controls.redo.disabled = !history.canRedo;
    controls.selectAll.disabled = empty;
    controls.selectNone.disabled = none;
    for (const key of ['rotateLeft', 'rotateRight', 'earlier', 'later', 'hide']) controls[key].disabled = none;
    controls.downloadSelected.disabled = chosen.every((page) => page.hidden);
    controls.cut.disabled = none || pages.length < 2;
    controls.redact.disabled = chosen.length !== 1 || chosen[0].hidden || !!chosen[0].blank;
    controls.duplicate.disabled = none;
    controls.insertPdf.disabled = documents.length === 0;
    controls.addBlank.disabled = documents.length === 0;
    controls.selectOdd.disabled = empty;
    controls.selectEven.disabled = empty;
    controls.hideBlank.disabled = empty;
    controls.extractText.disabled = shown === 0;
    controls.stamps.disabled = shown === 0;
    controls.find.disabled = shown === 0;
    controls.sign.disabled = shown === 0;
    controls.properties.disabled = documents.length === 0;
    controls.addText.disabled = shown === 0;
    controls.clearMarks.disabled = false;
    controls.clearMarks.hidden = !pages.some((page) => page.marks?.length);
    controls.exportImages.disabled = shown === 0;
    controls.downloadAll.disabled = shown === 0;
    hideLabel.textContent = allHidden ? 'Show' : 'Hide';
    hideIcon.setAttribute('href', allHidden ? '#i-eye' : '#i-eye-off');
    controls.hide.title = allHidden ? 'Show the selected pages again (Del)' : 'Hide the selected pages from the result (Del)';
    controls.showHidden.hidden = hidden === 0;
    showHiddenLabel.textContent = `Show ${hidden} hidden`;
    controls.cutEvery.disabled = pages.length < 2;
    controls.clearCuts.disabled = false;
    controls.showHidden.disabled = false;
    controls.clearCuts.hidden = cuts.size === 0;
    controls.downloadParts.disabled = parts < 2;
    partsLabel.textContent = parts < 2 ? 'Download ZIP' : `Download ${parts} parts (ZIP)`;
    const title = documents.length > 1 ? `${documents[0].name} and ${documents.length - 1} more` : (documents[0]?.name ?? '');
    name.textContent = title;
    name.title = title;
    summary.textContent = `${none ? plural(pages.length, 'page') : `${selected.size} of ${pages.length} selected`}${hidden ? ` · ${hidden} hidden` : ''}${stamps.numbers ? ' · numbered' : ''}${stamps.watermark ? ' · watermark' : ''}${JSON.stringify(properties) === JSON.stringify(DEFAULT_PROPERTIES) ? '' : ' · properties'}${parts > 1 ? ` · ${parts} parts` : ''}`;
  }

  // ---------- state: every change goes through commit, so every change can be undone ----------

  function apply(state) {
    const before = measure();
    pages = state.pages;
    cuts = keepCuts(pages, state.cuts);
    selected = new Set([...selected].filter((id) => pages.some((page) => page.id === id)));
    render(before);
  }

  function commit(next) {
    const nextPages = next.pages ?? pages;
    const nextCuts = next.cuts ?? cuts;
    if (nextPages === pages && nextCuts === cuts) return;
    history.push({ pages, cuts });
    apply({ pages: nextPages, cuts: nextCuts });
  }

  function undo() {
    const state = history.undo({ pages, cuts });
    if (state) apply(state);
  }

  function redo() {
    const state = history.redo({ pages, cuts });
    if (state) apply(state);
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

  async function load(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const count = await countPages(bytes);
    return { name: file.name, bytes, doc: await openRender(bytes), count };
  }

  async function open(file) {
    if (!file) return;
    try {
      const document = await load(file);
      for (const old of documents) closeRender(old.doc);
      generation += 1;
      thumbs.clear();
      documents = [document];
      selected = new Set();
      anchor = null;
      pages = createPages(document.count, { file: 0, firstId: 0 });
      nextId = document.count;
      cuts = new Set();
      focusId = pages[0]?.id ?? null;
      history.clear();
      setStatus('');
      render();
    } catch {
      setStatus(`Cannot read ${file.name}: not a PDF, encrypted or damaged.`);
    }
  }

  // The pages of other PDF files go into the document, before or after the page `targetId` (at the end without one).
  async function insert(files, targetId = null, after = true) {
    const added = [];
    const unreadable = [];
    for (const file of files) {
      try {
        const document = await load(file);
        documents.push(document);
        added.push(...createPages(document.count, { file: documents.length - 1, firstId: nextId }));
        nextId += document.count;
      } catch {
        unreadable.push(file.name);
      }
    }
    setStatus(unreadable.length ? `Cannot read ${unreadable.join(', ')}: not a PDF, encrypted or damaged.` : '');
    if (added.length === 0) return;
    selected = new Set(added.map((page) => page.id));
    commit({ pages: insertEntries(pages, added, targetId, after) });
  }

  const lastSelected = () => [...pages].reverse().find((page) => selected.has(page.id));

  async function addBlank() {
    const reference = lastSelected() ?? pages.at(-1);
    let size = A4;
    if (reference?.blank) size = reference.rotation % 180 ? { width: reference.blank.height, height: reference.blank.width } : reference.blank;
    else if (reference) size = await pageSize(documents[reference.file].doc, reference.source, reference.rotation);
    const page = blankPage(nextId++, size.width, size.height);
    selected = new Set([page.id]);
    commit({ pages: insertEntries(pages, [page], reference?.id ?? null, true) });
  }

  function duplicateSelected() {
    const result = duplicate(pages, selected, nextId);
    nextId = result.nextId;
    commit({ pages: result.pages });
  }

  // A PDF dropped on the grid goes next to the page nearest to the pointer; without a document it is opened.
  function drop(files, event) {
    if (documents.length === 0) return open(files[0]);
    const hit = nearestEntry(grid, 'li', (element) => Number(element.dataset.id), event, 'x');
    return insert(files, hit?.id ?? null, hit?.after ?? true);
  }

  function selectPositions(positions) {
    selected = new Set(positions.map((position) => pages[position]?.id).filter((id) => id !== undefined));
    refresh();
  }

  async function hideBlankPages() {
    await run('Looking for blank pages...', async () => {
      const blank = new Set();
      for (const [index, page] of pages.entries()) {
        if (index % 8 === 0) {
          setStatus(`Looking at page ${index + 1} of ${pages.length}...`);
          await new Promise((resolve) => setTimeout(resolve));
        }
        if (page.hidden) continue;
        if (page.blank || (page.redactions.length === 0 && (await inkOf(documents[page.file].doc, page.source)) < BLANK_INK)) blank.add(page.id);
      }
      if (blank.size) commit({ pages: toggleHidden(pages, blank) });
      return blank.size ? `Hid ${plural(blank.size, 'blank page')}.` : 'No blank page found.';
    });
  }

  async function exportImages() {
    const type = byId('export-format').value;
    const dpi = Number(byId('export-dpi').value);
    const extension = type === 'image/png' ? 'png' : 'jpg';
    await run('Drawing the pages...', async () => {
      const chosen = selected.size ? visible(pages).filter((page) => selected.has(page.id)) : visible(pages);
      const files = [];
      for (const page of chosen) {
        setStatus(`Drawing page ${files.length + 1} of ${chosen.length}...`);
        const blob = await entryImage(page.file === null ? null : documents[page.file].doc, page, dpi, type);
        files.push({ name: `${stem()}-page-${String(pages.indexOf(page) + 1).padStart(3, '0')}.${extension}`, blob });
      }
      if (files.length === 1) download(files[0].blob, files[0].name);
      else download(await buildZip(files), `${stem()}-images.zip`);
    });
  }

  async function extractText() {
    await run('Reading the text...', async () => {
      const chosen = selected.size ? visible(pages).filter((page) => selected.has(page.id)) : visible(pages);
      const parts = [];
      for (const page of chosen) {
        const number = pages.indexOf(page) + 1;
        let text = '';
        if (page.redactions.length) text = '[redacted page]';
        else if (!page.blank) text = await textOf(documents[page.file].doc, page.source);
        parts.push(`--- Page ${number} ---\n${text}`);
      }
      download(new Blob([`${parts.join('\n\n')}\n`], { type: 'text/plain;charset=utf-8' }), `${stem()}.txt`);
    });
  }

  // ---------- gestures: drag a page, lasso, keyboard ----------

  function dragGhost(event, group) {
    const ghost = document.createElement('div');
    ghost.className = 'drag-image';
    pages
      .filter((page) => group.has(page.id))
      .slice(0, 3)
      .forEach((page, index) => {
        const picture = copyCanvas(thumbs.get(thumbKey(page))?.canvas) ?? document.createElement('canvas');
        Object.assign(picture.style, { left: `${index * 10}px`, top: `${index * 10}px`, zIndex: String(3 - index) });
        ghost.append(picture);
      });
    if (group.size > 1) {
      const count = document.createElement('span');
      count.className = 'drag-image-count';
      count.textContent = String(group.size);
      ghost.append(count);
    }
    document.body.append(ghost);
    event.dataTransfer.setDragImage(ghost, 30, 30);
    setTimeout(() => ghost.remove());
  }

  sortable(grid, {
    entry: 'li',
    idOf: (element) => Number(element.dataset.id),
    axis: 'x',
    state: drag,
    group: (id) => (selected.has(id) ? new Set(selected) : new Set([id])),
    ghost: dragGhost,
    onMove: (ids, target, after) => commit({ pages: place(pages, ids, target, after) }),
  });

  // A drag that starts on the background of the stage draws a rectangle; the pages it touches are selected
  // (Shift or Ctrl/Cmd keeps the current selection). A plain click on the background clears the selection.
  stage.addEventListener('pointerdown', (/** @type {PointerEvent} */ event) => {
    if (event.button !== 0 || panel.hasAttribute('data-empty')) return;
    if (/** @type {Element} */ (event.target).closest('.card, .cut, button, input')) return;
    event.preventDefault();
    const keep = event.shiftKey || event.metaKey || event.ctrlKey ? new Set(selected) : new Set();
    const start = { x: event.clientX, y: event.clientY };
    const band = document.createElement('div');
    band.className = 'marquee';
    document.body.append(band);
    stage.setPointerCapture(event.pointerId);
    const gesture = new AbortController();
    let moved = false;
    stage.addEventListener(
      'pointermove',
      (e) => {
        if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) < MARQUEE_THRESHOLD) return;
        moved = true;
        const left = Math.min(start.x, e.clientX);
        const top = Math.min(start.y, e.clientY);
        const right = Math.max(start.x, e.clientX);
        const bottom = Math.max(start.y, e.clientY);
        Object.assign(band.style, { left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${bottom - top}px` });
        selected = new Set(keep);
        for (const [id, element] of cards) {
          const box = element.getBoundingClientRect();
          if (box.left < right && box.right > left && box.top < bottom && box.bottom > top) selected.add(id);
        }
        refresh();
      },
      { signal: gesture.signal },
    );
    stage.addEventListener(
      'pointerup',
      () => {
        gesture.abort();
        band.remove();
        if (!moved && keep.size === 0) {
          selected = new Set();
          refresh();
        }
      },
      { signal: gesture.signal },
    );
  });

  const columnCount = () => {
    const entries = [...items.values()];
    return entries.length ? entries.filter((element) => element.offsetTop === entries[0].offsetTop).length : 1;
  };

  // Arrows move the focus from page to page (Shift extends the selection), Space or Enter select the focused one.
  grid.addEventListener('keydown', (event) => {
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    const index = pages.findIndex((page) => page.id === focusId);
    const columns = columnCount();
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }[event.key];
    let next;
    if (step !== undefined) next = index + step;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = pages.length - 1;
    else return;
    event.preventDefault();
    next = Math.min(pages.length - 1, Math.max(0, next));
    if (next === index) return;
    const id = pages[next].id;
    if (event.shiftKey) {
      if (anchor === null) anchor = focusId;
      for (const other of rangeIds(pages, anchor, id)) selected.add(other);
      refresh();
    }
    cards.get(id).focus();
  });

  const hideSelected = () => commit({ pages: toggleHidden(pages, selected) });
  const rotateSelected = (delta) => commit({ pages: rotatePages(pages, selected, delta) });
  const moveSelected = (step) => commit({ pages: movePages(pages, selected, step) });
  const cutSelected = () => commit({ cuts: toggleCuts(pages, cuts, selected) });

  document.addEventListener('keydown', (event) => {
    if (panel.hidden || panel.hasAttribute('data-empty') || dialog.open) return;
    if (/** @type {Element} */ (event.target).closest('input, textarea, select')) return;
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    const act = (handler) => {
      event.preventDefault();
      handler();
    };
    if (mod) {
      if (key === 'a') act(() => ((selected = new Set(pages.map((page) => page.id))), refresh()));
      else if (key === 'z') act(event.shiftKey ? redo : undo);
      else if (key === 'y') act(redo);
      return;
    }
    if (event.altKey) {
      if (selected.size && key === 'arrowleft') act(() => moveSelected(-1));
      else if (selected.size && key === 'arrowright') act(() => moveSelected(1));
      return;
    }
    if (key === 'escape' && selected.size) act(() => ((selected = new Set()), refresh()));
    else if ((key === 'delete' || key === 'backspace') && selected.size) act(hideSelected);
    else if (key === 'h' && selected.size) act(hideSelected);
    else if (key === 'r' && selected.size) act(() => rotateSelected(event.shiftKey ? -90 : 90));
    else if (key === 'c' && pages.length > 1) act(() => commit({ cuts: toggleCuts(pages, cuts, selected.size ? selected : new Set([focusId])) }));
  });

  // ---------- toolbar ----------

  const stem = () => documents[0].name.replace(/\.pdf$/i, '');
  const asPdf = async (entries) => {
    const redacted = entries.filter((entry) => entry.redactions.length > 0).length;
    let drawn = 0;
    const burn = (entry) => {
      setStatus(`Redacting page ${++drawn} of ${redacted}...`);
      return burnPage(documents[entry.file].doc, entry);
    };
    return new Blob([await buildPdf(documents.map((document) => document.bytes), entries, burn, async (output) => {
      await applyStamps(output, stamps);
      applyProperties(output, properties);
    })], { type: 'application/pdf' });
  };

  async function run(label, work) {
    for (const control of Object.values(controls)) control.disabled = true;
    setStatus(label);
    try {
      setStatus((await work()) ?? '');
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
  for (const id of ['open-pages', 'choose-pages']) byId(id).addEventListener('click', () => fileInput.click());
  insertInput.addEventListener('change', async () => {
    const target = lastSelected();
    await insert(Array.from(insertInput.files), target?.id ?? null, true);
    insertInput.value = '';
  });
  controls.insertPdf.addEventListener('click', () => insertInput.click());
  controls.addBlank.addEventListener('click', addBlank);
  controls.duplicate.addEventListener('click', duplicateSelected);
  controls.hideBlank.addEventListener('click', hideBlankPages);
  controls.extractText.addEventListener('click', extractText);
  const exportDialog = byId('export-dialog');
  controls.exportImages.addEventListener('click', () => {
    const count = selected.size ? visible(pages).filter((page) => selected.has(page.id)).length : visible(pages).length;
    byId('export-note').textContent = `${plural(count, 'page')} will be saved${count > 1 ? ' in a ZIP' : ''}. Hidden pages are left out, redactions are painted in, and a page too large for the browser is drawn at a lower resolution.`;
    exportDialog.showModal();
  });
  byId('export-cancel').addEventListener('click', () => exportDialog.close());
  byId('export-go').addEventListener('click', () => {
    exportDialog.close();
    exportImages();
  });
  async function putMark(draft, notice) {
    const target = lastSelected() ?? visible(pages)[0];
    if (!target) return;
    const placed = await placeMark({ doc: target.blank ? null : documents[target.file].doc, entry: target, draft, number: pages.indexOf(target) + 1, selectedCount: selected.size });
    if (!placed) return;
    const reach = placed.scope === 'all' ? new Set(visible(pages).map((page) => page.id)) : placed.scope === 'selection' ? new Set(selected) : new Set([target.id]);
    const { mark } = placed;
    const made = (id) => (mark.kind === 'image' ? imageMark(id, mark.png, mark.x, mark.y, mark.w, mark.h) : textMark(id, mark.text.trim(), mark.x, mark.y, mark.size));
    commit({ pages: pages.map((page) => (reach.has(page.id) ? { ...page, marks: [...(page.marks ?? []), made(nextMark++)] } : page)) });
    setStatus(`${notice} on ${plural(reach.size, 'page')}.`);
  }
  controls.properties.addEventListener('click', async () => {
    const result = await propertiesDialog.open(documents, properties);
    if (result) {
      properties = result;
      refresh();
    }
  });
  controls.sign.addEventListener('click', async () => {
    const signature = await signer.create();
    if (signature) await putMark({ kind: 'image', png: signature.png, aspect: signature.aspect }, 'Signature placed');
  });
  controls.addText.addEventListener('click', () => putMark({ kind: 'text', text: 'Text', size: 0.025 }, 'Text placed'));
  controls.clearMarks.addEventListener('click', () => {
    const reach = selected.size ? selected : new Set(pages.map((page) => page.id));
    commit({ pages: pages.map((page) => (reach.has(page.id) && page.marks?.length ? { ...page, marks: [] } : page)) });
  });
  controls.find.addEventListener('click', async () => {
    const candidates = visible(pages).filter((page) => !page.blank).map((page) => ({ page, number: pages.indexOf(page) + 1 }));
    const added = await finder.open(candidates, (page) => pageRuns(documents[page.file].doc, page));
    if (!added) return;
    const count = [...added.values()].reduce((sum, boxes) => sum + boxes.length, 0);
    commit({ pages: pages.map((page) => (added.has(page.id) ? { ...page, redactions: [...page.redactions, ...added.get(page.id)] } : page)) });
    setStatus(`Added ${plural(count, 'rectangle')} on ${plural(added.size, 'page')}. Open a page with Redact to check or adjust them.`);
  });
  controls.stamps.addEventListener('click', async () => {
    const result = await stampDialog.edit(stamps);
    if (result) {
      stamps = result;
      refresh();
    }
  });
  controls.selectOdd.addEventListener('click', () => selectPositions(pages.map((_, index) => index).filter((index) => index % 2 === 0)));
  controls.selectEven.addEventListener('click', () => selectPositions(pages.map((_, index) => index).filter((index) => index % 2 === 1)));
  rangeInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const positions = parseRange(rangeInput.value, pages.length);
    if (positions === null) setStatus('Not a list of pages. Try 1-3, 7, 10-');
    else {
      setStatus('');
      selectPositions(positions);
    }
  });
  zoom.addEventListener('input', () => grid.style.setProperty('--thumb-w', `${zoom.value}px`));
  controls.undo.addEventListener('click', undo);
  controls.redo.addEventListener('click', redo);
  controls.selectAll.addEventListener('click', () => {
    selected = new Set(pages.map((page) => page.id));
    refresh();
  });
  controls.selectNone.addEventListener('click', () => {
    selected = new Set();
    refresh();
  });
  controls.rotateLeft.addEventListener('click', () => rotateSelected(-90));
  controls.rotateRight.addEventListener('click', () => rotateSelected(90));
  controls.earlier.addEventListener('click', () => moveSelected(-1));
  controls.later.addEventListener('click', () => moveSelected(1));
  controls.hide.addEventListener('click', hideSelected);
  controls.showHidden.addEventListener('click', () => commit({ pages: showAll(pages) }));
  controls.cut.addEventListener('click', cutSelected);
  controls.cutEvery.addEventListener('click', () => commit({ cuts: cutEvery(pages, Math.max(1, Math.floor(Number(splitSize.value)) || 1)) }));
  controls.clearCuts.addEventListener('click', () => commit({ cuts: new Set() }));
  controls.redact.addEventListener('click', async () => {
    const [id] = selected;
    try {
      const page = pages.find((entry) => entry.id === id);
      const rectangles = await openRedactor(documents[page.file].doc, page);
      if (rectangles) commit({ pages: pages.map((page) => (page.id === id ? { ...page, redactions: rectangles } : page)) });
    } catch (error) {
      setStatus(`Cannot open the page: ${error.message}`);
    }
  });
  controls.downloadAll.addEventListener('click', () =>
    run('Preparing the PDF...', async () => download(await asPdf(visible(pages)), `${stem()}-edited.pdf`)),
  );
  controls.downloadSelected.addEventListener('click', () =>
    run('Preparing the PDF...', async () => download(await asPdf(visible(pages).filter((page) => selected.has(page.id))), `${stem()}-pages.pdf`)),
  );
  controls.downloadParts.addEventListener('click', () =>
    run('Splitting...', async () => {
      const parts = exportParts(pages, cuts);
      const files = [];
      for (const part of parts) {
        setStatus(`Splitting: part ${files.length + 1} of ${parts.length}...`);
        files.push({ name: `${stem()}-${String(files.length + 1).padStart(3, '0')}.pdf`, blob: await asPdf(part) });
      }
      download(await buildZip(files), `${stem()}-split.zip`);
    }),
  );

  refresh();
  return { open, drop, hasDocument: () => documents.length > 0 };
}
