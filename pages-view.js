import { openInfo } from './pdf-info.js';
import { buildPdf } from './export.js';
import { LEVELS, compressPdf, formatSize } from './compress.js';
import { MARGINS, PAGE_SIZES, imagesToPdf } from './images.js';
import { readPhoto, recode } from './photo.js';
import { initCompare } from './compare-view.js';
import { initFiles } from './files-view.js';
import { buildZip } from './zip.js';
import { burnPage, closeRender, entryImage, inkOf, openRender, pageRuns, pageSize, renderPage, textOf } from './render.js';
import { blankPage, createPages, cutEvery, duplicate, insertEntries, parseRange, exportParts, keepCuts, movePages, partsOf, place, rangeIds, removePages, rotatePages, runsOf, showAll, toggleCuts, toggleHidden, visible } from './pages-model.js';
import { createHistory } from './history.js';
import { plural, t } from './i18n.js';
import { openRedactor } from './redact-view.js';
import { applyStamps } from './stamps.js';
import { initFind } from './find-view.js';
import { initSign } from './sign-view.js';
import { initProperties } from './properties-view.js';
import { initForm } from './form-view.js';
import { fillForm } from './forms.js';
import { DEFAULT_PROPERTIES, applyProperties } from './properties.js';
import { placeMark } from './place-view.js';
import { imageMark, textMark } from './marks.js';
import { initStamps } from './stamp-view.js';
import { byId, copyCanvas, icon, nearestEntry, setI18n, sortable } from './dom.js';
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
  const stage = panel.querySelector('.stage');
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
  const fileList = byId('file-list');
  let applied = { size: 'fit', margin: 'none' };
  const photoSettings = byId('photo-settings');
  const sizeSelect = byId('images-size');
  const marginSelect = byId('images-margin');
  const levelsGroup = byId('compress-levels');
  const viewRadios = /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('input[name="view"]'));
  const controls = {
    addFiles: byId('add-files'),
    fillForm: byId('fill-form'),
    clearAll: byId('clear-all'),
    compare: byId('compare-open'),
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
  let view = 'pages';
  let compression = 'none';
  const comparer = initCompare();
  const choices = (select, prefix, ids) =>
    select.replaceChildren(
      ...ids.map((value) => {
        const option = Object.assign(document.createElement('option'), { value });
        setI18n(option, `${prefix}${value}`);
        return option;
      }),
    );
  choices(sizeSelect, 'photo.size.', PAGE_SIZES);
  choices(marginSelect, 'photo.margin.', MARGINS.map(([id]) => id));
  marginSelect.value = 'none';
  const stampDialog = initStamps();
  const finder = initFind();
  const signer = initSign();
  const propertiesDialog = initProperties();
  const formDialog = initForm();
  let properties = { ...DEFAULT_PROPERTIES };
  let nextMark = 0;
  const documents = [];
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

  // A status is a text or a function that writes it, so that it can be written again in another language.
  let statusText = () => '';
  const showStatus = () => {
    const text = statusText();
    status.textContent = text;
    note.textContent = text;
  };
  const setStatus = (text) => {
    statusText = typeof text === 'function' ? text : () => text;
    showStatus();
  };
  const say = (key, vars) => setStatus(() => t(key, vars));
  const urls = new WeakMap();
  const markUrl = (png) => {
    if (!urls.has(png)) urls.set(png, URL.createObjectURL(new Blob([png], { type: 'image/png' })));
    return urls.get(png);
  };
  const thumbKey = (page) => `${generation}:${page.id}:${page.rotation}`;
  const pagesOf = (count) => plural(count, 'count.page.one', 'count.page.other');
  const redactionsOf = (count) => plural(count, 'count.redaction.one', 'count.redaction.other');
  const nameOf = (page) => (page.file === null ? t('page.blank') : documents[page.file].name);
  const used = () => documents.filter((_, file) => pages.some((page) => page.file === file));
  let tagged = new Set();

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
    toggle.setAttribute('aria-label', [t('page.n', { n: index + 1 }), page.blank ? t('card.blank') : '', count ? redactionsOf(count) : '', page.hidden ? t('card.hidden') : ''].filter(Boolean).join(t('list-gap')));
    toggle.setAttribute('aria-pressed', String(selected.has(page.id)));

    const check = document.createElement('span');
    check.className = 'check';
    check.append(icon('check'));
    toggle.append(check);
    toggle.title = nameOf(page);
    if (tagged.has(page.id)) toggle.append(Object.assign(document.createElement('span'), { className: 'run-tag', textContent: nameOf(page) }));
    if (count) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = t('card.redacted', { n: count });
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
      cut.title = t(has ? 'cut.remove' : 'cut.add');
      cut.setAttribute('aria-label', t(has ? 'cut.remove-aria' : 'cut.add-aria', { n: index + 1 }));
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
    const runs = runsOf(pages);
    tagged = runs.length > 1 ? new Set(runs.map((run) => run.pages[0].id)) : new Set();
    grid.replaceChildren(...pages.map((page, index) => card(page, index, index === pages.length - 1, partOf.get(page.id), parts.length > 1)));
    if (view === 'files') renderFiles(runs);
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
    panel.toggleAttribute('data-empty', empty);
    panel.toggleAttribute('data-fresh', empty && !history.canUndo);
    controls.undo.disabled = !history.canUndo;
    controls.redo.disabled = !history.canRedo;
    controls.selectAll.disabled = empty;
    controls.selectNone.disabled = none;
    for (const key of ['rotateLeft', 'rotateRight', 'earlier', 'later', 'hide']) controls[key].disabled = none;
    controls.downloadSelected.disabled = chosen.every((page) => page.hidden);
    controls.cut.disabled = none || pages.length < 2;
    controls.redact.disabled = chosen.length !== 1 || chosen[0].hidden || !!chosen[0].blank;
    controls.duplicate.disabled = none;
    controls.addFiles.disabled = false;
    controls.clearAll.disabled = empty;
    controls.addBlank.disabled = empty;
    controls.compare.hidden = compression === 'none';
    controls.compare.disabled = shown === 0;
    photoSettings.hidden = !used().some((document) => document.photo);
    controls.selectOdd.disabled = empty;
    controls.selectEven.disabled = empty;
    controls.hideBlank.disabled = empty;
    controls.extractText.disabled = shown === 0;
    controls.stamps.disabled = shown === 0;
    controls.find.disabled = shown === 0;
    controls.sign.disabled = shown === 0;
    controls.properties.disabled = empty;
    const fillable = used().some((document) => document.fields.length);
    controls.fillForm.disabled = !fillable;
    controls.fillForm.title = t(fillable ? 'app.fill-form.title' : 'form.none-title');
    controls.addText.disabled = shown === 0;
    controls.clearMarks.disabled = false;
    controls.clearMarks.hidden = !pages.some((page) => page.marks?.length);
    controls.exportImages.disabled = shown === 0;
    controls.downloadAll.disabled = shown === 0;
    hideLabel.textContent = t(allHidden ? 'hide.show' : 'hide.label');
    hideIcon.setAttribute('href', allHidden ? '#i-eye' : '#i-eye-off');
    controls.hide.title = t(allHidden ? 'hide.show-title' : 'app.hide.title');
    controls.showHidden.hidden = hidden === 0;
    showHiddenLabel.textContent = t('show-hidden', { n: hidden });
    controls.cutEvery.disabled = pages.length < 2;
    controls.clearCuts.disabled = false;
    controls.showHidden.disabled = false;
    controls.clearCuts.hidden = cuts.size === 0;
    controls.downloadParts.disabled = parts < 2;
    partsLabel.textContent = parts < 2 ? t('parts.zip') : t('parts.zip-n', { n: parts });
    const names = used();
    const title = names.length > 1 ? plural(names.length - 1, 'name.more-one', 'name.more-other', { name: names[0].name }) : (names[0]?.name ?? '');
    name.textContent = title;
    name.title = title;
    summary.textContent = [
      none ? pagesOf(pages.length) : t('summary.selected', { n: selected.size, total: pages.length }),
      hidden ? t('summary.hidden', { n: hidden }) : '',
      stamps.numbers ? t('summary.numbered') : '',
      stamps.watermark ? t('summary.watermark') : '',
      JSON.stringify(properties) === JSON.stringify(DEFAULT_PROPERTIES) ? '' : t('summary.properties'),
      parts > 1 ? t('summary.parts', { n: parts }) : '',
    ]
      .filter(Boolean)
      .join(' · ');
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

  const photoLayout = () => ({ size: sizeSelect.value, margin: MARGINS.find(([value]) => value === marginSelect.value)[1] });
  const isPdf = (bytes) => new TextDecoder('latin1').decode(bytes.subarray(0, 1024)).includes('%PDF-');

  // A PDF is a file of its own; a photo becomes a file of one page, laid out as the Photos settings say.
  async function load(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (isPdf(bytes)) {
      const { count, fields } = await openInfo(bytes);
      return { name: file.name, bytes, doc: await openRender(bytes), count, fields, values: {} };
    }
    const photo = await readPhoto(file);
    const pdf = await imagesToPdf([photo], photoLayout());
    return { name: file.name, bytes: pdf, doc: await openRender(pdf), count: 1, fields: [], values: {}, photo };
  }

  // The pages of PDF files and photos go into the document, before or after the page `targetId` (at the end without one).
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
    setStatus(unreadable.length ? () => t('status.cannot-read', { names: unreadable.join(', ') }) : '');
    if (added.length === 0) return;
    const first = pages.length === 0;
    selected = first ? new Set() : new Set(added.map((page) => page.id));
    commit({ pages: insertEntries(pages, added, targetId, after) });
  }

  // Photos are laid out again when the settings change; their redactions and marks would no longer fit the new page.
  const layoutPhotos = () =>
    run('status.laying-out', async () => {
      const photos = documents.filter((document) => document.photo);
      if (photos.length === 0) return '';
      if (pages.some((page) => documents[page.file]?.photo && (page.redactions.length || page.marks.length))) {
        sizeSelect.value = applied.size;
        marginSelect.value = applied.margin;
        return () => t('status.photos-locked');
      }
      applied = { size: sizeSelect.value, margin: marginSelect.value };
      for (const document of photos) {
        const old = document.doc;
        document.bytes = await imagesToPdf([document.photo], photoLayout());
        document.doc = await openRender(document.bytes);
        closeRender(old);
      }
      generation += 1;
      thumbs.clear();
      history.clear();
      render();
      return '';
    });

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

  // Files dropped on the grid go next to the page nearest to the pointer; elsewhere they go at the end.
  function drop(files, event) {
    if (pages.length === 0 || view !== 'pages') return insert(files);
    const hit = nearestEntry(grid, 'li', (element) => Number(element.dataset.id), event, 'x');
    return insert(files, hit?.id ?? null, hit?.after ?? true);
  }

  function selectPositions(positions) {
    selected = new Set(positions.map((position) => pages[position]?.id).filter((id) => id !== undefined));
    refresh();
  }

  async function hideBlankPages() {
    await run('status.blank-looking', async () => {
      const blank = new Set();
      for (const [index, page] of pages.entries()) {
        if (index % 8 === 0) {
          say('status.blank-at', { n: index + 1, total: pages.length });
          await new Promise((resolve) => setTimeout(resolve));
        }
        if (page.hidden) continue;
        if (page.blank || (page.redactions.length === 0 && (await inkOf(documents[page.file].doc, page.source)) < BLANK_INK)) blank.add(page.id);
      }
      if (blank.size) commit({ pages: toggleHidden(pages, blank) });
      return blank.size ? () => plural(blank.size, 'status.hid-blank-one', 'status.hid-blank-other') : () => t('status.no-blank');
    });
  }

  async function exportImages() {
    const type = byId('export-format').value;
    const dpi = Number(byId('export-dpi').value);
    const extension = type === 'image/png' ? 'png' : 'jpg';
    await run('status.drawing', async () => {
      const chosen = selected.size ? visible(pages).filter((page) => selected.has(page.id)) : visible(pages);
      const files = [];
      for (const page of chosen) {
        say('status.drawing-at', { n: files.length + 1, total: chosen.length });
        const blob = await entryImage(page.file === null ? null : documents[page.file].doc, page, dpi, type);
        files.push({ name: `${stem()}-page-${String(pages.indexOf(page) + 1).padStart(3, '0')}.${extension}`, blob });
      }
      if (files.length === 1) download(files[0].blob, files[0].name);
      else download(await buildZip(files), `${stem()}-images.zip`);
    });
  }

  async function extractText() {
    await run('status.reading-text', async () => {
      const chosen = selected.size ? visible(pages).filter((page) => selected.has(page.id)) : visible(pages);
      const parts = [];
      for (const page of chosen) {
        const number = pages.indexOf(page) + 1;
        let text = '';
        if (page.redactions.length) text = t('text.redacted');
        else if (!page.blank) text = await textOf(documents[page.file].doc, page.source);
        parts.push(`${t('text.page', { n: number })}\n${text}`);
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
    if (event.button !== 0 || view !== 'pages' || panel.hasAttribute('data-empty')) return;
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
    if (view !== 'pages' || panel.hasAttribute('data-fresh') || document.querySelector('dialog[open]')) return;
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

  const stem = () => {
    const lead = pages.find((page) => page.file !== null && !page.hidden) ?? pages.find((page) => page.file !== null);
    return (lead ? documents[lead.file].name : 'document').replace(/\.[^.]+$/, '');
  };
  const build = async (entries) => {
    const redacted = entries.filter((entry) => entry.redactions.length > 0).length;
    let drawn = 0;
    const burn = (entry) => {
      say('status.redacting', { n: ++drawn, total: redacted });
      return burnPage(documents[entry.file].doc, entry);
    };
    return buildPdf(documents.map((document) => document.bytes), entries, burn, async (output) => {
      await applyStamps(output, stamps);
      applyProperties(output, properties);
    });
  };
  const squeeze = (bytes) => compressPdf(bytes, compression, recode, (done, total) => total && say('status.compressing', { n: done + 1, total }));
  let saved = { before: 0, after: 0 };
  const asPdf = async (entries) => {
    const bytes = await build(entries);
    let result = bytes;
    if (compression !== 'none') {
      const smaller = await squeeze(bytes);
      if (smaller.length < bytes.length) result = smaller;
    }
    saved.before += bytes.length;
    saved.after += result.length;
    return new Blob([result], { type: 'application/pdf' });
  };
  const savedText = () => {
    if (compression === 'none' || saved.after >= saved.before) return '';
    const { before, after } = saved;
    return () => t('status.compressed', { before: formatSize(before), after: formatSize(after) });
  };

  async function run(label, work) {
    for (const control of Object.values(controls)) control.disabled = true;
    saved = { before: 0, after: 0 };
    say(label);
    try {
      setStatus((await work()) ?? '');
    } catch (error) {
      say('status.failed', { message: error.message });
    } finally {
      refresh();
    }
  }

  fileInput.addEventListener('change', async () => {
    const target = view === 'pages' ? lastSelected() : null;
    await insert(Array.from(fileInput.files), target?.id ?? null, true);
    fileInput.value = '';
  });
  for (const id of ['add-files', 'choose-pages']) byId(id).addEventListener('click', () => fileInput.click());
  controls.clearAll.addEventListener('click', () => commit({ pages: [], cuts: new Set() }));
  for (const radio of viewRadios) radio.addEventListener('change', () => radio.checked && setView(radio.value));
  sizeSelect.addEventListener('change', layoutPhotos);
  marginSelect.addEventListener('change', layoutPhotos);
  controls.addBlank.addEventListener('click', addBlank);
  controls.duplicate.addEventListener('click', duplicateSelected);
  controls.hideBlank.addEventListener('click', hideBlankPages);
  controls.extractText.addEventListener('click', extractText);
  const exportDialog = byId('export-dialog');
  controls.exportImages.addEventListener('click', () => {
    const count = selected.size ? visible(pages).filter((page) => selected.has(page.id)).length : visible(pages).length;
    byId('export-note').textContent = t(count > 1 ? 'export.note-zip' : 'export.note', { pages: pagesOf(count) });
    exportDialog.showModal();
  });
  byId('export-cancel').addEventListener('click', () => exportDialog.close());
  byId('export-go').addEventListener('click', () => {
    exportDialog.close();
    exportImages();
  });
  async function putMark(draft, noticeKey) {
    const target = lastSelected() ?? visible(pages)[0];
    if (!target) return;
    const placed = await placeMark({ doc: target.blank ? null : documents[target.file].doc, entry: target, draft, number: pages.indexOf(target) + 1, selectedCount: selected.size });
    if (!placed) return;
    const reach = placed.scope === 'all' ? new Set(visible(pages).map((page) => page.id)) : placed.scope === 'selection' ? new Set(selected) : new Set([target.id]);
    const { mark } = placed;
    const made = (id) => (mark.kind === 'image' ? imageMark(id, mark.png, mark.x, mark.y, mark.w, mark.h) : textMark(id, mark.text.trim(), mark.x, mark.y, mark.size));
    commit({ pages: pages.map((page) => (reach.has(page.id) ? { ...page, marks: [...(page.marks ?? []), made(nextMark++)] } : page)) });
    setStatus(() => t(noticeKey, { pages: pagesOf(reach.size) }));
  }
  controls.properties.addEventListener('click', async () => {
    const result = await propertiesDialog.open(used().map((document) => ({ name: document.name, bytes: document.original ?? document.bytes })), properties);
    if (result) {
      properties = result;
      refresh();
    }
  });
  // The values go into a copy of the file with the fields flattened; the first bytes are kept, so the form can be filled again.
  const applyForms = (result) =>
    run('status.filling', async () => {
      let changedAny = false;
      for (const [index, values] of result) {
        const document = documents[index];
        const changed = Object.fromEntries(document.fields.filter((field) => Object.hasOwn(values, field.name) && values[field.name] !== field.value).map((field) => [field.name, values[field.name]]));
        if (JSON.stringify(changed) === JSON.stringify(document.values)) continue;
        document.values = changed;
        document.original ??= document.bytes;
        const bytes = Object.keys(changed).length ? await fillForm(document.original, changed) : document.original;
        const old = document.doc;
        document.bytes = bytes;
        document.doc = await openRender(bytes);
        closeRender(old);
        changedAny = true;
      }
      if (changedAny) {
        generation += 1;
        thumbs.clear();
        render();
      }
      return () => t('status.form-updated');
    });
  controls.fillForm.addEventListener('click', async () => {
    const files = used()
      .filter((document) => document.fields.length)
      .map((document) => ({ index: documents.indexOf(document), name: document.name, fields: document.fields, values: document.values }));
    const result = await formDialog.edit(files);
    if (result) await applyForms(result);
  });
  controls.sign.addEventListener('click', async () => {
    const signature = await signer.create();
    if (signature) await putMark({ kind: 'image', png: signature.png, aspect: signature.aspect }, 'status.signature-placed');
  });
  controls.addText.addEventListener('click', () => putMark({ kind: 'text', text: t('place.default-text'), size: 0.025 }, 'status.text-placed'));
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
    setStatus(() => t('status.found-added', { rectangles: plural(count, 'count.rectangle.one', 'count.rectangle.other'), pages: pagesOf(added.size) }));
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
    if (positions === null) say('status.bad-range');
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
      say('status.cannot-open-page', { message: error.message });
    }
  });
  controls.downloadAll.addEventListener('click', () =>
    run('status.preparing', async () => {
      download(await asPdf(visible(pages)), `${stem()}-edited.pdf`);
      return savedText();
    }),
  );
  controls.downloadSelected.addEventListener('click', () =>
    run('status.preparing', async () => {
      download(await asPdf(visible(pages).filter((page) => selected.has(page.id))), `${stem()}-pages.pdf`);
      return savedText();
    }),
  );
  controls.downloadParts.addEventListener('click', () =>
    run('status.splitting', async () => {
      const parts = exportParts(pages, cuts);
      const files = [];
      for (const part of parts) {
        say('status.splitting-at', { n: files.length + 1, total: parts.length });
        files.push({ name: `${stem()}-${String(files.length + 1).padStart(3, '0')}.pdf`, blob: await asPdf(part) });
      }
      download(await buildZip(files), `${stem()}-split.zip`);
      return savedText();
    }),
  );
  controls.compare.addEventListener('click', () =>
    run('status.preview', async () => {
      const parts = exportParts(pages, cuts);
      const bytes = await build(parts[0]);
      await comparer.open(bytes, await squeeze(bytes), parts.length > 1 ? t('compare.first-part', { level: t(`level.${compression}`) }) : t(`level.${compression}`));
    }),
  );

  levelsGroup.replaceChildren(
    ...['none', ...LEVELS.map(([id]) => id)].map((id) => {
      const label = document.createElement('label');
      const radio = Object.assign(document.createElement('input'), { type: 'radio', name: 'compression', value: id, checked: id === compression });
      radio.addEventListener('change', () => {
        compression = id;
        setI18n(byId('compress-describe'), `level.${id}-desc`);
        refresh();
      });
      const text = document.createElement('span');
      setI18n(text, `level.${id}`);
      label.append(radio, text);
      return label;
    }),
  );
  setI18n(byId('compress-describe'), 'level.none-desc');

  // ---------- files: one row for each run of pages that come from the same file ----------

  const runKey = (run) => run.pages[0].id;
  function runThumb(page) {
    const canvas = document.createElement('canvas');
    if (page.blank) {
      canvas.width = 40;
      canvas.height = 52;
    } else {
      renderPage(documents[page.file].doc, page.source, page.rotation, canvas, 0.35 * devicePixelRatio).catch(() => {});
    }
    return canvas;
  }
  const runInfo = (run) => {
    const hiddenCount = run.pages.filter((page) => page.hidden).length;
    return {
      id: runKey(run),
      name: run.file === null ? t('page.blank') : documents[run.file].name,
      detail: [pagesOf(run.pages.length), run.file !== null && documents[run.file].photo ? t('files.photo') : '', hiddenCount ? t('summary.hidden', { n: hiddenCount }) : ''].filter(Boolean).join(t('list-gap')),
      hidden: hiddenCount === run.pages.length,
      thumb: () => runThumb(run.pages[0]),
    };
  };
  const idsOf = (key) => new Set((runsOf(pages).find((run) => runKey(run) === key)?.pages ?? []).map((page) => page.id));

  const files = initFiles({
    onMove: (keys, targetKey, after) => {
      const runs = runsOf(pages);
      const moving = new Set(runs.filter((run) => keys.has(runKey(run))).flatMap((run) => run.pages.map((page) => page.id)));
      const target = runs.find((run) => runKey(run) === targetKey);
      if (target) commit({ pages: place(pages, moving, (after ? target.pages.at(-1) : target.pages[0]).id, after) });
    },
    onStep: (key, step) => {
      const runs = runsOf(pages);
      const neighbor = runs[runs.findIndex((run) => runKey(run) === key) + step];
      if (neighbor) commit({ pages: place(pages, idsOf(key), (step < 0 ? neighbor.pages[0] : neighbor.pages.at(-1)).id, step > 0) });
    },
    onToggle: (key) => commit({ pages: toggleHidden(pages, idsOf(key)) }),
    onRemove: (key) => commit({ pages: removePages(pages, idsOf(key)) }),
    onOpen: (key) => {
      selected = idsOf(key);
      setView('pages');
      const [first] = selected;
      cards.get(first)?.scrollIntoView({ block: 'center' });
      cards.get(first)?.focus();
    },
  });
  function renderFiles(runs = runsOf(pages)) {
    files.render(runs.map(runInfo));
  }
  function setView(next) {
    view = next;
    panel.dataset.view = next;
    grid.hidden = next !== 'pages';
    fileList.hidden = next !== 'files';
    for (const radio of viewRadios) radio.checked = radio.value === next;
    if (next === 'files') renderFiles();
    refresh();
  }

  refresh();
  const retranslate = () => {
    render();
    showStatus();
  };
  return { drop, hasDocument: () => pages.length > 0, retranslate };
}
