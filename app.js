import { countPages, mergePdfs, moveItem } from './merge.js';

const fileInput = /** @type {HTMLInputElement} */ (document.getElementById('files'));
const list = document.getElementById('list');
const status = document.getElementById('status');
const mergeButton = /** @type {HTMLButtonElement} */ (document.getElementById('merge'));

let items = [];
let nextId = 0;

function setStatus(text) {
  status.textContent = text;
}

function actionButton(label, name, onClick, disabled = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.setAttribute('aria-label', `${name}: ${label}`);
  button.disabled = disabled;
  button.addEventListener('click', onClick);
  return button;
}

function render() {
  const rows = items.map((item, index) => {
    const row = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = item.name;
    const pages = document.createElement('span');
    pages.className = 'pages';
    pages.textContent = item.pages === 1 ? '1 page' : `${item.pages} pages`;
    row.append(
      name,
      pages,
      actionButton('Up', item.name, () => reorder(index, index - 1), index === 0),
      actionButton('Down', item.name, () => reorder(index, index + 1), index === items.length - 1),
      actionButton('Remove', item.name, () => remove(item.id)),
    );
    return row;
  });
  list.replaceChildren(...rows);
  mergeButton.disabled = items.length < 2;
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
      items.push({ id: nextId++, name: file.name, bytes, pages: await countPages(bytes) });
    } catch {
      unreadable.push(file.name);
    }
  }
  setStatus(unreadable.length ? `Cannot read ${unreadable.join(', ')}: not a PDF, encrypted or damaged.` : '');
  render();
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

fileInput.addEventListener('change', async () => {
  await addFiles(Array.from(fileInput.files));
  fileInput.value = '';
});

document.addEventListener('dragover', (event) => event.preventDefault());
document.addEventListener('drop', async (event) => {
  event.preventDefault();
  await addFiles(Array.from(event.dataTransfer.files));
});

mergeButton.addEventListener('click', async () => {
  mergeButton.disabled = true;
  try {
    const bytes = await mergePdfs(items.map((item) => item.bytes));
    download(new Blob([bytes], { type: 'application/pdf' }), 'merged.pdf');
    setStatus(`Merged ${items.length} files into merged.pdf.`);
  } catch (error) {
    setStatus(`Merge failed: ${error.message}`);
  } finally {
    mergeButton.disabled = items.length < 2;
  }
});

render();
