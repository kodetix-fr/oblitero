import { MARGINS, PAGE_SIZES, imagesToPdf, jpegOrientation, kindOf } from './images.js';
import { place } from './pages-model.js';
import { byId, copyCanvas, icon, iconButton, sortable } from './dom.js';
import { download } from './download.js';

const THUMB = 96;

// Draws a decoded image on a white canvas (the browser applies the EXIF orientation while decoding).
async function reencode(bitmap, type, quality) {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  if (!blob) throw new Error('The image is too large to convert.');
  return new Uint8Array(await blob.arrayBuffer());
}

export function initImages({ openInPages }) {
  const panel = byId('panel-images');
  const input = byId('image-files');
  const list = byId('image-list');
  const status = byId('images-status');
  const note = byId('images-note');
  const summary = byId('images-summary');
  const sizeSelect = byId('images-size');
  const marginSelect = byId('images-margin');
  const downloadButton = byId('images-download');
  const openButton = byId('images-open');

  let items = [];
  let nextId = 0;
  const drag = { source: null, group: new Set() };

  const choices = (select, entries) => select.replaceChildren(...entries.map(([value, text]) => Object.assign(document.createElement('option'), { value, textContent: text })));
  choices(sizeSelect, PAGE_SIZES);
  choices(marginSelect, MARGINS);
  marginSelect.value = 'none';

  const setStatus = (text) => {
    status.textContent = text;
    note.textContent = text;
  };
  const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

  function row(item, index) {
    const element = document.createElement('li');
    element.className = 'file';
    element.draggable = true;
    element.dataset.id = String(item.id);
    const grip = document.createElement('span');
    grip.className = 'grip';
    grip.append(icon('grip'));
    const number = document.createElement('span');
    number.className = 'num';
    number.textContent = String(index + 1);
    const thumb = document.createElement('span');
    thumb.className = 'file-thumb';
    thumb.append(copyCanvas(item.thumb));
    const text = document.createElement('span');
    text.className = 'file-text';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = item.name;
    name.title = item.name;
    const dimensions = document.createElement('span');
    dimensions.className = 'pages';
    dimensions.textContent = `${item.width} x ${item.height} px`;
    text.append(name, dimensions);
    const actions = document.createElement('span');
    actions.className = 'file-actions';
    actions.append(
      iconButton('up', `${item.name}: Up`, () => reorder(index, index - 1), index === 0),
      iconButton('down', `${item.name}: Down`, () => reorder(index, index + 1), index === items.length - 1),
      iconButton('x', `${item.name}: Remove`, () => remove(item.id)),
    );
    element.append(grip, number, thumb, text, actions);
    return element;
  }

  function render() {
    panel.toggleAttribute('data-empty', items.length === 0);
    list.replaceChildren(...items.map(row));
    summary.textContent = items.length ? plural(items.length, 'image') : '';
    downloadButton.disabled = items.length === 0;
    openButton.disabled = items.length === 0;
  }

  function reorder(from, to) {
    if (to < 0 || to >= items.length) return;
    const next = items.slice();
    next.splice(to, 0, next.splice(from, 1)[0]);
    items = next;
    render();
  }

  function remove(id) {
    items = items.filter((item) => item.id !== id);
    render();
  }

  async function addFiles(files) {
    const refused = [];
    for (const file of files) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const bitmap = await createImageBitmap(new Blob([bytes]));
        const scale = Math.min(1, THUMB / Math.max(bitmap.width, bitmap.height));
        const thumb = document.createElement('canvas');
        thumb.width = Math.max(1, Math.round(bitmap.width * scale));
        thumb.height = Math.max(1, Math.round(bitmap.height * scale));
        thumb.getContext('2d').drawImage(bitmap, 0, 0, thumb.width, thumb.height);
        items.push({ id: nextId++, name: file.name, bytes, kind: kindOf(bytes), width: bitmap.width, height: bitmap.height, thumb });
        bitmap.close();
      } catch {
        refused.push(file.name);
      }
    }
    setStatus(refused.length ? `Cannot read ${refused.join(', ')}: not an image this browser can open.` : '');
    render();
  }

  // A JPEG or PNG goes in as it is; the other formats, and a JPEG that is stored sideways, are redrawn first.
  async function prepare(item) {
    const asIs = item.kind === 'png' || (item.kind === 'jpg' && jpegOrientation(item.bytes) === 1);
    if (asIs) return { bytes: item.bytes, kind: item.kind };
    const bitmap = await createImageBitmap(new Blob([item.bytes]));
    const photo = item.kind === 'jpg' || /\.(webp|avif|heic)$/i.test(item.name);
    const bytes = await reencode(bitmap, photo ? 'image/jpeg' : 'image/png', 0.92);
    bitmap.close();
    return { bytes, kind: photo ? 'jpg' : 'png' };
  }

  async function build() {
    const prepared = [];
    for (const item of items) prepared.push(await prepare(item));
    return imagesToPdf(prepared, { size: sizeSelect.value, margin: MARGINS.find(([value]) => value === marginSelect.value)[2] });
  }

  async function run(label, work) {
    downloadButton.disabled = true;
    openButton.disabled = true;
    setStatus(label);
    try {
      await work(await build());
      setStatus('');
    } catch (error) {
      setStatus(`Failed: ${error.message}`);
    } finally {
      render();
    }
  }

  sortable(list, {
    entry: '.file',
    idOf: (element) => Number(element.dataset.id),
    axis: 'y',
    state: drag,
    onMove: (ids, target, after) => {
      items = place(items, ids, target, after);
      render();
    },
  });
  input.addEventListener('change', async () => {
    await addFiles(Array.from(input.files));
    input.value = '';
  });
  for (const id of ['add-images', 'choose-images']) byId(id).addEventListener('click', () => input.click());
  byId('clear-images').addEventListener('click', () => {
    items = [];
    setStatus('');
    render();
  });
  downloadButton.addEventListener('click', () => run('Building the PDF...', async (bytes) => download(new Blob([bytes], { type: 'application/pdf' }), 'images.pdf')));
  openButton.addEventListener('click', () => run('Building the PDF...', async (bytes) => openInPages(new File([bytes], 'images.pdf', { type: 'application/pdf' }))));

  render();
  return { addFiles };
}
