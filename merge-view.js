import { countPages, mergePdfs, moveItem } from './merge.js';
import { place } from './pages-model.js';
import { byId, copyCanvas, icon, iconButton, sortable } from './dom.js';
import { download } from './download.js';
import { renderEnds } from './render.js';

const SHEET_WIDTH = 96;
const TONES = 7;

export function initMerge() {
  const panel = byId('panel-merge');
  const fileInput = byId('files');
  const list = byId('list');
  const status = byId('status');
  const note = byId('merge-note');
  const mergeButton = byId('merge');
  const summary = byId('merge-summary');
  const preview = byId('preview');
  const previewTitle = byId('preview-title');
  const strip = byId('preview-strip');

  let items = [];
  let nextId = 0;
  const drag = { source: null, group: new Set() };

  const setStatus = (text) => {
    status.textContent = text;
    note.textContent = text;
  };
  const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

  function sheet(source, number) {
    const figure = document.createElement('figure');
    figure.className = 'sheet';
    const picture = copyCanvas(source);
    if (picture) {
      figure.append(picture);
    } else {
      const missing = document.createElement('span');
      missing.className = 'missing';
      missing.textContent = '?';
      figure.append(missing);
    }
    const caption = document.createElement('figcaption');
    caption.textContent = String(number);
    figure.append(caption);
    return figure;
  }

  function group(item, index, start) {
    const element = document.createElement('div');
    element.className = 'group';
    element.style.setProperty('--tone', String(((index * 360) / TONES) | 0));
    const head = document.createElement('div');
    head.className = 'group-head';
    const name = document.createElement('span');
    name.className = 'group-name';
    name.textContent = item.name;
    const range = document.createElement('span');
    range.textContent = item.pages === 1 ? `p. ${start + 1}` : `p. ${start + 1}-${start + item.pages}`;
    head.append(name, range);
    const sheets = document.createElement('div');
    sheets.className = 'sheets';
    sheets.append(sheet(item.ends[0], start + 1));
    if (item.pages > 2) {
      const gap = document.createElement('span');
      gap.className = 'gap';
      gap.textContent = `+${item.pages - 2}`;
      sheets.append(gap);
    }
    if (item.pages > 1) sheets.append(sheet(item.ends[1], start + item.pages));
    element.append(head, sheets);
    element.draggable = true;
    element.dataset.id = String(item.id);
    return element;
  }

  function renderPreview(total) {
    preview.hidden = items.length === 0;
    previewTitle.textContent = `Preview of merged.pdf: ${plural(total, 'page')}`;
    const nodes = [];
    let start = 0;
    items.forEach((item, index) => {
      if (index > 0) {
        const join = document.createElement('div');
        join.className = 'join';
        nodes.push(join);
      }
      nodes.push(group(item, index, start));
      start += item.pages;
    });
    strip.replaceChildren(...nodes);
  }

  function row(item, index) {
    const element = document.createElement('li');
    element.className = 'file';
    const grip = document.createElement('span');
    grip.className = 'grip';
    grip.append(icon('grip'));
    const number = document.createElement('span');
    number.className = 'num';
    number.textContent = String(index + 1);
    const thumb = document.createElement('span');
    thumb.className = 'file-thumb';
    const picture = copyCanvas(item.ends[0]);
    if (picture) {
      thumb.append(picture);
    } else {
      const missing = document.createElement('span');
      missing.className = 'missing';
      thumb.append(missing);
    }
    const text = document.createElement('span');
    text.className = 'file-text';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = item.name;
    name.title = item.name;
    const pages = document.createElement('span');
    pages.className = 'pages';
    pages.textContent = plural(item.pages, 'page');
    text.append(name, pages);
    const actions = document.createElement('span');
    actions.className = 'file-actions';
    actions.append(
      iconButton('up', `${item.name}: Up`, () => reorder(index, index - 1), index === 0),
      iconButton('down', `${item.name}: Down`, () => reorder(index, index + 1), index === items.length - 1),
      iconButton('x', `${item.name}: Remove`, () => remove(item.id)),
    );
    element.append(grip, number, thumb, text, actions);
    element.draggable = true;
    element.dataset.id = String(item.id);
    return element;
  }

  function render() {
    const total = items.reduce((sum, item) => sum + item.pages, 0);
    panel.toggleAttribute('data-empty', items.length === 0);
    list.replaceChildren(...items.map(row));
    summary.textContent = items.length ? `${plural(items.length, 'file')}, ${plural(total, 'page')}` : '';
    mergeButton.disabled = items.length < 2;
    renderPreview(total);
  }

  function reorder(from, to) {
    items = moveItem(items, from, to);
    render();
  }

  function remove(id) {
    items = items.filter((item) => item.id !== id);
    render();
  }

  async function addFiles(files) {
    const unreadable = [];
    for (const file of files) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const pages = await countPages(bytes);
        const ends = await renderEnds(bytes, SHEET_WIDTH).catch(() => []);
        items.push({ id: nextId++, name: file.name, bytes, pages, ends });
      } catch {
        unreadable.push(file.name);
      }
    }
    setStatus(unreadable.length ? `Cannot read ${unreadable.join(', ')}: not a PDF, encrypted or damaged.` : '');
    render();
  }

  const reorderTo = (ids, target, after) => {
    items = place(items, ids, target, after);
    render();
  };
  const idOf = (element) => Number(element.dataset.id);
  sortable(list, { entry: '.file', idOf, axis: 'y', state: drag, onMove: reorderTo });
  sortable(strip, { entry: '.group', idOf, axis: 'x', state: drag, onMove: reorderTo });

  fileInput.addEventListener('change', async () => {
    await addFiles(Array.from(fileInput.files));
    fileInput.value = '';
  });
  for (const id of ['add-files', 'choose-merge']) byId(id).addEventListener('click', () => fileInput.click());
  byId('clear-files').addEventListener('click', () => {
    items = [];
    setStatus('');
    render();
  });

  mergeButton.addEventListener('click', async () => {
    mergeButton.disabled = true;
    try {
      const bytes = await mergePdfs(items.map((item) => item.bytes));
      download(new Blob([bytes], { type: 'application/pdf' }), 'merged.pdf');
      setStatus(`Merged ${plural(items.length, 'file')} into merged.pdf.`);
    } catch (error) {
      setStatus(`Merge failed: ${error.message}`);
    } finally {
      mergeButton.disabled = items.length < 2;
    }
  });

  render();
  return { addFiles };
}
