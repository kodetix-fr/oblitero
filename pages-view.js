import { openInfo } from './pdf-info.js';
import { buildPdf } from './export.js';
import { LEVELS, formatSize } from './compress.js';
import { createOutput } from './page-output.js';
import { pageCard } from './page-card.js';
import { createThumbs } from './page-thumbs.js';
import { initMarquee } from './page-marquee.js';
import { MARGINS, PAGE_SIZES, imagesToPdf } from './images.js';
import { readPhoto } from './photo.js';
import { initCompare } from './compare-view.js';
import { initPreview } from './preview-view.js';
import { initFiles } from './files-view.js';
import { buildZip } from './zip.js';
import { burnPage, closeRender, entryImage, entrySize, inkOf, openRender, outlineStarts, pageRuns, pageSize, paintEntry, renderPage, textOf } from './render.js';
import { blankPage, createPages, cutBefore, cutEvery, canAdjust, cutToFit, duplicate, insertEntries, interleavePages, parseRange, exportParts, keepCuts, movePages, partsOf, place, rangeIds, removePages, reversePages, rotatePages, setAngle, runsOf, showAll, toggleCuts, toggleFlip, toggleHidden, visible } from './pages-model.js';
import { createHistory } from './history.js';
import { pagesOf, plural, t } from './i18n.js';
import { clamp } from './math.js';
import { openRedactor } from './redact-view.js';
import { NO_STAMPS, applyStamps } from './stamps.js';
import { initFind } from './find-view.js';
import { initSign } from './sign-view.js';
import { initProperties } from './properties-view.js';
import { initForm } from './form-view.js';
import { initBlank } from './blank-view.js';
import { fillForm } from './forms.js';
import { DEFAULT_PROPERTIES } from './properties.js';
import { placeMark } from './place-view.js';
import { imageMark, textMark } from './marks.js';
import { initStamps } from './stamp-view.js';
import { byId, copyCanvas, nearestEntry, setI18n, sortable } from './dom.js';
import { download } from './download.js';

const A4 = { width: 595.28, height: 841.89 };
// The smaller of the two meanings of a megabyte, so that a part fits under either.
const MEGABYTE = 1_000_000;

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
  const resultSummary = byId('result-summary');
  const hideLabel = byId('hide-label');
  const hideIcon = byId('hide-icon');
  const showHiddenLabel = byId('show-hidden-label');
  const splitSize = byId('split-size');
  const splitMb = byId('split-mb');
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
    preview: byId('preview-open'),
    addBlank: byId('add-blank'),
    duplicate: byId('duplicate'),
    reverse: byId('reverse'),
    interleave: byId('interleave'),
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
    angle: /** @type {HTMLInputElement} */ (byId('angle')),
    flipH: byId('flip-h'),
    flipV: byId('flip-v'),
    earlier: byId('move-earlier'),
    later: byId('move-later'),
    hide: byId('hide'),
    showHidden: byId('show-hidden'),
    cut: byId('cut'),
    redact: byId('redact'),
    downloadAll: byId('download-all'),
    downloadSelected: byId('download-selected'),
    cutEvery: byId('cut-every'),
    cutChapters: byId('cut-chapters'),
    cutBlank: byId('cut-blank'),
    cutSize: byId('cut-size'),
    clearCuts: byId('clear-cuts'),
    downloadParts: byId('download-parts'),
    photoSize: sizeSelect,
    photoMargin: marginSelect,
  };

  let stamps = { ...NO_STAMPS };
  let busy = false;
  let view = 'pages';
  let compression = 'none';
  const comparer = initCompare();
  const previewer = initPreview();
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
  const blankDialog = initBlank();
  let properties = { ...DEFAULT_PROPERTIES };
  const documents = [];
  let nextId = 0;
  let pages = [];
  let cuts = new Set();
  let selected = new Set();
  let anchor = null;
  let focusId = null;
  const history = createHistory();
  const drag = { source: null, group: new Set() };
  const thumbnails = createThumbs((file) => documents[file].doc);
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
  const docOf = (page) => (page.file === null ? null : documents[page.file].doc);
  const nameOf = (page) => (page.file === null ? t('page.blank') : documents[page.file].name);
  const used = () => documents.filter((_, file) => pages.some((page) => page.file === file));
  let tagged = new Set();
  let toned = false;
  const toneOf = (file) => (210 + file * 137.5) % 360;

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
    const { item, toggle } = pageCard(
      {
        page,
        number: index + 1,
        name: nameOf(page),
        canvas: thumbnails.canvasOf(page),
        last,
        part: parted ? part : null,
        fileTone: toned && page.file !== null ? toneOf(page.file) : null,
        tagged: tagged.has(page.id),
        focused: page.id === focusId,
        pressed: selected.has(page.id),
        hasCut: cuts.has(page.id),
      },
      {
        onChoose: (extend) => choose(page.id, extend),
        onOpen: () => openLarge(page.id),
        onFocus: () => setFocus(page.id),
        onCut: () => commit({ cuts: toggleCuts(pages, cuts, new Set([page.id])) }),
      },
    );
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
    toned = new Set(pages.map((page) => page.file).filter((file) => file !== null)).size > 1;
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
    panel.toggleAttribute('data-selected', !none);
    panel.toggleAttribute('data-parted', parts > 1);
    controls.undo.disabled = !history.canUndo;
    controls.redo.disabled = !history.canRedo;
    controls.selectAll.disabled = empty;
    controls.selectNone.disabled = none;
    for (const key of ['rotateLeft', 'rotateRight', 'earlier', 'later', 'hide']) controls[key].disabled = none;
    controls.downloadSelected.disabled = chosen.every((page) => page.hidden);
    controls.cut.disabled = none || pages.length < 2;
    controls.redact.disabled = chosen.length !== 1 || chosen[0].hidden || !!chosen[0].blank;
    controls.redact.title = t(controls.redact.disabled ? 'redact.one-page-title' : 'app.redact.title');
    controls.duplicate.disabled = none;
    controls.reverse.disabled = chosen.length < 2;
    const adjustable = chosen.filter(canAdjust);
    for (const key of ['angle', 'flipH', 'flipV']) controls[key].disabled = adjustable.length === 0;
    const angles = new Set(adjustable.map((page) => page.angle));
    if (document.activeElement !== controls.angle) controls.angle.value = angles.size === 1 ? String([...angles][0]) : '';
    controls.interleave.disabled = new Set(chosen.map((page) => page.file)).size < 2;
    controls.addFiles.disabled = false;
    controls.clearAll.disabled = empty;
    controls.addBlank.disabled = empty;
    controls.compare.hidden = compression === 'none';
    controls.compare.disabled = shown === 0;
    controls.preview.disabled = shown === 0;
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
    controls.clearMarks.hidden = !pages.some((page) => page.marks.length);
    controls.exportImages.disabled = shown === 0;
    controls.downloadAll.disabled = shown === 0;
    hideLabel.textContent = t(allHidden ? 'hide.show' : 'hide.label');
    hideIcon.setAttribute('href', allHidden ? '#i-eye' : '#i-eye-off');
    controls.hide.title = t(allHidden ? 'hide.show-title' : 'app.hide.title');
    controls.showHidden.hidden = hidden === 0;
    showHiddenLabel.textContent = t('show-hidden', { n: hidden });
    for (const key of ['cutEvery', 'cutChapters', 'cutBlank']) controls[key].disabled = pages.length < 2;
    controls.cutSize.disabled = shown < 2;
    controls.photoSize.disabled = false;
    controls.photoMargin.disabled = false;
    controls.clearCuts.disabled = false;
    controls.showHidden.disabled = false;
    controls.clearCuts.hidden = cuts.size === 0;
    controls.downloadParts.disabled = parts < 2;
    partsLabel.textContent = parts < 2 ? t('parts.zip') : t('parts.zip-n', { n: parts });
    resultSummary.textContent = [pagesOf(shown), parts < 2 ? t('result.one-file') : t('result.files', { n: parts })].join(t('list-gap'));
    const names = used();
    const title = names.length > 1 ? plural(names.length - 1, 'name.more-one', 'name.more-other', { name: names[0].name }) : (names[0]?.name ?? '');
    name.textContent = title;
    name.title = title;
    summary.textContent = [
      none ? pagesOf(pages.length) : t('summary.selected', { n: selected.size, total: pages.length }),
      hidden ? t('summary.hidden', { n: hidden }) : '',
      stamps.numbers ? t('summary.numbered') : '',
      stamps.header ? t('summary.header') : '',
      stamps.footer ? t('summary.footer') : '',
      stamps.watermark ? t('summary.watermark') : '',
      Object.entries(DEFAULT_PROPERTIES).every(([key, value]) => properties[key] === value) ? '' : t('summary.properties'),
      parts > 1 ? t('summary.parts', { n: parts }) : '',
    ]
      .filter(Boolean)
      .join(' · ');
    if (busy) for (const control of Object.values(controls)) control.disabled = true;
  }

  // ---------- state: the pages, the cuts, the stamps and the properties go through commit, so that they can be undone ----------

  function apply(state) {
    const before = measure();
    pages = state.pages;
    cuts = keepCuts(pages, state.cuts);
    stamps = state.stamps;
    properties = state.properties;
    selected = new Set([...selected].filter((id) => pages.some((page) => page.id === id)));
    render(before);
  }

  const current = () => ({ pages, cuts, stamps, properties });

  // A file nothing can bring back anymore, not even an undo, leaves the memory.
  function release() {
    const held = new Set([pages, ...history.states.map((state) => state.pages)].flat().map((page) => page.file));
    documents.forEach((document, file) => {
      if (!document.doc || held.has(file)) return;
      closeRender(document.doc);
      Object.assign(document, { doc: null, bytes: null, original: null, photo: null, outline: null });
    });
  }

  function commit(next) {
    const state = { ...current(), ...next };
    if (state.pages === pages && state.cuts === cuts && state.stamps === stamps && state.properties === properties) return;
    // What was set for a document does not reach the next one.
    if (state.pages.length === 0) Object.assign(state, { stamps: { ...NO_STAMPS }, properties: { ...DEFAULT_PROPERTIES } });
    history.push(current());
    apply(state);
    release();
  }

  function undo() {
    const state = history.undo(current());
    if (state) apply(state);
  }

  function redo() {
    const state = history.redo(current());
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
      const doc = await openRender(bytes);
      // The screen reads a file with PDF.js and the result is built with pdf-lib: a page they count differently would be another page.
      if (doc.numPages !== count) {
        closeRender(doc);
        throw new Error('The two readers do not see the same pages');
      }
      return { name: file.name, bytes, doc, count, fields, values: {} };
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
      thumbnails.reset();
      history.clear();
      render();
      release();
      return '';
    });

  const lastSelected = () => pages.findLast((page) => selected.has(page.id));
  const shownSelected = () => visible(pages).filter((page) => selected.has(page.id));
  const selectedOrAll = () => (selected.size ? shownSelected() : visible(pages));

  async function addBlank() {
    const reference = lastSelected() ?? pages.at(-1);
    const size = reference ? await entrySize(docOf(reference), reference) : A4;
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

  async function hideBlankPages({ cut = false } = {}) {
    await run('status.blank-looking', async () => {
      const items = [];
      for (const [index, page] of pages.entries()) {
        if (index % 8 === 0) {
          say('status.blank-at', { n: index + 1, total: pages.length });
          await new Promise((resolve) => setTimeout(resolve));
        }
        if (page.hidden || page.redactions.length || page.marks.length) continue;
        if (page.blank) {
          const thumb = document.createElement('canvas');
          thumb.width = 72;
          thumb.height = Math.round((72 * page.blank.height) / page.blank.width);
          items.push({ id: page.id, number: index + 1, ink: 0, thumb });
        } else {
          items.push({ id: page.id, number: index + 1, ...(await inkOf(documents[page.file].doc, page.source)) });
        }
      }
      if (items.length === 0) return () => t('status.no-blank');
      const blank = await blankDialog.choose(items);
      if (!blank) return '';
      commit({ pages: toggleHidden(pages, blank), cuts: cut ? blank : cuts });
      return () => plural(blank.size, 'status.hid-blank-one', 'status.hid-blank-other');
    });
  }

  async function exportImages() {
    const type = byId('export-format').value;
    const dpi = Number(byId('export-dpi').value);
    const extension = type === 'image/png' ? 'png' : 'jpg';
    await run('status.drawing', async () => {
      const chosen = selectedOrAll();
      const files = [];
      for (const page of chosen) {
        say('status.drawing-at', { n: files.length + 1, total: chosen.length });
        const blob = await entryImage(docOf(page), page, dpi, type);
        files.push({ name: `${stem()}-page-${String(pages.indexOf(page) + 1).padStart(3, '0')}.${extension}`, blob });
      }
      if (files.length === 1) download(files[0].blob, files[0].name);
      else download(await buildZip(files), `${stem()}-images.zip`);
    });
  }

  async function extractText() {
    await run('status.reading-text', async () => {
      const chosen = selectedOrAll();
      const parts = [];
      for (const page of chosen) {
        const number = pages.indexOf(page) + 1;
        let text = '';
        if (page.redactions.length) text = t('text.redacted');
        else if (!page.blank) text = (await textOf(documents[page.file].doc, page.source)) || t('text.none');
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
        const picture = copyCanvas(thumbnails.canvasDrawn(page)) ?? document.createElement('canvas');
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

  initMarquee(stage, {
    enabled: () => !busy && view === 'pages' && !panel.hasAttribute('data-empty'),
    selection: () => selected,
    select: (next) => {
      selected = next;
      refresh();
    },
    cards,
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
    next = clamp(next, 0, pages.length - 1);
    if (next === index) return;
    const id = pages[next].id;
    if (event.shiftKey) {
      if (anchor === null) anchor = focusId;
      for (const other of rangeIds(pages, anchor, id)) selected.add(other);
      refresh();
    }
    cards.get(id).focus();
  });

  const openLarge = (id) =>
    previewer.openPages(
      {
        count: pages.length,
        start: pages.findIndex((page) => page.id === id),
        draw: async (index, width) => {
          const page = pages[index];
          return paintEntry(docOf(page), page, width / (await entrySize(docOf(page), page)).width, true);
        },
        caption: (index) => [nameOf(pages[index]), pages[index].hidden ? t('card.hidden') : ''].filter(Boolean).join(t('list-gap')),
      },
      t('preview.page'),
    );

  const hideSelected = () => commit({ pages: toggleHidden(pages, selected) });
  const rotateSelected = (delta) => commit({ pages: rotatePages(pages, selected, delta) });
  const moveSelected = (step) => commit({ pages: movePages(pages, selected, step) });
  const cutSelected = () => commit({ cuts: toggleCuts(pages, cuts, selected) });

  document.addEventListener('keydown', (event) => {
    if (busy || view !== 'pages' || panel.hasAttribute('data-fresh') || document.querySelector('dialog[open]')) return;
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
    else if (key === 'v' && focusId !== null) act(() => openLarge(focusId));
    else if (key === 'c' && pages.length > 1) act(() => commit({ cuts: toggleCuts(pages, cuts, selected.size ? selected : new Set([focusId])) }));
  });

  // ---------- toolbar ----------

  const stem = () => {
    const lead = pages.find((page) => page.file !== null && !page.hidden) ?? pages.find((page) => page.file !== null);
    return (lead ? documents[lead.file].name : 'document').replace(/\.[^.]+$/, '');
  };
  const output = createOutput(documents, () => ({ stamps, properties, compression }), say);
  const { build, squeeze, asPdf, savedText } = output;

  async function run(label, work) {
    if (busy) return;
    busy = true;
    panel.toggleAttribute('data-busy', true);
    refresh();
    output.resetSaved();
    say(label);
    try {
      setStatus((await work()) ?? '');
    } catch (error) {
      say('status.failed', { message: error.message });
    } finally {
      busy = false;
      panel.toggleAttribute('data-busy', false);
      refresh();
    }
  }

  const guarded = (work) => async (...args) => {
    try {
      await work(...args);
    } catch (error) {
      say('status.failed', { message: error.message });
    }
  };

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
  controls.addBlank.addEventListener('click', guarded(addBlank));
  controls.duplicate.addEventListener('click', duplicateSelected);
  controls.reverse.addEventListener('click', () => commit({ pages: reversePages(pages, selected) }));
  controls.interleave.addEventListener('click', () => commit({ pages: interleavePages(pages, selected) }));
  controls.hideBlank.addEventListener('click', () => hideBlankPages());
  controls.extractText.addEventListener('click', extractText);
  const exportDialog = byId('export-dialog');
  controls.exportImages.addEventListener('click', () => {
    const count = selectedOrAll().length;
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
    const placed = await placeMark({ doc: docOf(target), entry: target, draft, number: pages.indexOf(target) + 1, selectedCount: selected.size });
    if (!placed) return;
    const reach = placed.scope === 'all' ? new Set(visible(pages).map((page) => page.id)) : placed.scope === 'selection' ? new Set(selected) : new Set([target.id]);
    const { mark } = placed;
    const made = mark.kind === 'image' ? imageMark(mark.png, mark.x, mark.y, mark.w, mark.h) : textMark(mark.text.trim(), mark.x, mark.y, mark.size);
    commit({ pages: pages.map((page) => (reach.has(page.id) ? { ...page, marks: [...page.marks, made] } : page)) });
    setStatus(() => t(noticeKey, { pages: pagesOf(reach.size) }));
  }
  controls.properties.addEventListener('click', guarded(async () => {
    const result = await propertiesDialog.open(used().map((document) => ({ name: document.name, bytes: document.original ?? document.bytes })), properties);
    if (result) commit({ properties: result });
  }));
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
        thumbnails.reset();
        render();
      }
      return () => t('status.form-updated');
    });
  controls.fillForm.addEventListener('click', guarded(async () => {
    const files = used()
      .filter((document) => document.fields.length)
      .map((document) => ({ index: documents.indexOf(document), name: document.name, fields: document.fields, values: document.values }));
    const result = await formDialog.edit(files);
    if (result) await applyForms(result);
  }));
  controls.sign.addEventListener('click', guarded(async () => {
    const signature = await signer.create();
    if (signature) await putMark({ kind: 'image', png: signature.png, aspect: signature.aspect }, 'status.signature-placed');
  }));
  controls.addText.addEventListener('click', guarded(() => putMark({ kind: 'text', text: t('place.default-text'), size: 0.025 }, 'status.text-placed')));
  controls.clearMarks.addEventListener('click', () => {
    const reach = selected.size ? selected : new Set(pages.map((page) => page.id));
    commit({ pages: pages.map((page) => (reach.has(page.id) && page.marks.length ? { ...page, marks: [] } : page)) });
  });
  controls.find.addEventListener('click', guarded(async () => {
    const candidates = visible(pages).filter((page) => !page.blank).map((page) => ({ page, number: pages.indexOf(page) + 1 }));
    const added = await finder.open(candidates, (page) => pageRuns(documents[page.file].doc, page));
    if (!added) return;
    const count = [...added.values()].reduce((sum, boxes) => sum + boxes.length, 0);
    commit({ pages: pages.map((page) => (added.has(page.id) ? { ...page, redactions: [...page.redactions, ...added.get(page.id)] } : page)) });
    setStatus(() => t('status.found-added', { rectangles: plural(count, 'count.rectangle.one', 'count.rectangle.other'), pages: pagesOf(added.size) }));
  }));
  // The page the settings reach first, built and stamped the way the download is, so the preview cannot disagree with it.
  async function previewStamps(settings) {
    const shownPages = visible(pages);
    const reached = settings.range ? (parseRange(settings.range, shownPages.length) ?? []) : shownPages.map((_, index) => index);
    const index = reached.find((position) => !(settings.numbers?.skipFirst && position === 0)) ?? reached[0] ?? 0;
    const marked = settings.watermark?.kind === 'image' && !settings.watermark.image ? { ...settings, watermark: null } : settings;
    const bytes = await buildPdf(
      documents.map((document) => document.bytes),
      [shownPages[index]],
      (entry) => burnPage(documents[entry.file].doc, entry),
      (output) => applyStamps(output, { ...marked, range: '' }, { index, total: shownPages.length }),
    );
    const doc = await openRender(bytes);
    try {
      const { width } = await pageSize(doc, 0, 0);
      const canvas = document.createElement('canvas');
      await renderPage(doc, 0, 0, canvas, Math.min(2, 520 / width));
      return { canvas, caption: t('page.n', { n: index + 1 }) };
    } finally {
      closeRender(doc);
    }
  }
  controls.stamps.addEventListener('click', guarded(async () => {
    const result = await stampDialog.edit(stamps, previewStamps);
    if (result) commit({ stamps: result });
  }));
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
  controls.angle.addEventListener('change', () => {
    const angle = clamp(Number(controls.angle.value) || 0, -180, 180);
    commit({ pages: setAngle(pages, selected, angle) });
  });
  controls.flipH.addEventListener('click', () => commit({ pages: toggleFlip(pages, selected) }));
  // Top to bottom is left to right and a half turn.
  controls.flipV.addEventListener('click', () => {
    const ids = new Set(pages.filter((page) => selected.has(page.id) && canAdjust(page)).map((page) => page.id));
    commit({ pages: rotatePages(toggleFlip(pages, ids), ids, 180) });
  });
  controls.earlier.addEventListener('click', () => moveSelected(-1));
  controls.later.addEventListener('click', () => moveSelected(1));
  controls.hide.addEventListener('click', hideSelected);
  controls.showHidden.addEventListener('click', () => commit({ pages: showAll(pages) }));
  controls.cut.addEventListener('click', cutSelected);
  controls.cutEvery.addEventListener('click', () => commit({ cuts: cutEvery(pages, Math.max(1, Math.floor(Number(splitSize.value)) || 1)) }));
  controls.cutChapters.addEventListener('click', guarded(async () => {
    const outlines = new Map();
    const starts = new Set();
    for (const page of pages) {
      if (page.file === null) continue;
      if (!outlines.has(page.file)) outlines.set(page.file, await outlineStarts(documents[page.file].doc));
      if (outlines.get(page.file).has(page.source)) starts.add(page.id);
    }
    const next = cutBefore(pages, starts);
    if (next.size === 0) return say('status.no-chapters');
    setStatus('');
    commit({ cuts: next });
  }));
  controls.cutBlank.addEventListener('click', () => hideBlankPages({ cut: true }));
  controls.cutSize.addEventListener('click', () => {
    const limit = Number(splitMb.value) * MEGABYTE;
    if (!(limit > 0)) return say('status.bad-size');
    return run('status.sizing', async () => {
      const burned = new Map();
      const { cuts: next, sizes } = await cutToFit(pages, limit, async (entries) => (await build(entries, burned)).length);
      if (next.size || cuts.size) commit({ cuts: next });
      const largest = Math.max(...sizes);
      const key = largest > limit ? 'status.cut-size-over' : sizes.length > 1 ? 'status.cut-size' : 'status.cut-size-none';
      return () => t(key, { n: sizes.length, size: formatSize(largest) });
    });
  });
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
  controls.preview.addEventListener('click', () =>
    run('status.preview', async () => {
      const chosen = shownSelected();
      const entries = chosen.length ? chosen : visible(pages);
      const blob = await asPdf(entries);
      const title = t(chosen.length ? 'preview.selection' : 'preview.title');
      await previewer.openPdf(new Uint8Array(await blob.arrayBuffer()), title, [pagesOf(entries.length), formatSize(blob.size)].join(t('list-gap')));
    }),
  );
  controls.downloadAll.addEventListener('click', () =>
    run('status.preparing', async () => {
      download(await asPdf(visible(pages)), `${stem()}-edited.pdf`);
      return savedText();
    }),
  );
  controls.downloadSelected.addEventListener('click', () =>
    run('status.preparing', async () => {
      download(await asPdf(shownSelected()), `${stem()}-pages.pdf`);
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
      renderPage(documents[page.file].doc, page.source, page.rotation, canvas, 0.35 * devicePixelRatio, page).catch(() => {});
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
      tone: toned && run.file !== null ? toneOf(run.file) : null,
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
