import { countPages, mergePdfs, moveItem } from './merge.js';
import { button, byId } from './dom.js';
import { download } from './download.js';

export function initMerge() {
  const fileInput = byId('files');
  const list = byId('list');
  const status = byId('status');
  const mergeButton = byId('merge');

  let items = [];
  let nextId = 0;

  const setStatus = (text) => {
    status.textContent = text;
  };

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
        button('Up', `${item.name}: Up`, () => reorder(index, index - 1), index === 0),
        button('Down', `${item.name}: Down`, () => reorder(index, index + 1), index === items.length - 1),
        button('Remove', `${item.name}: Remove`, () => remove(item.id)),
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

  fileInput.addEventListener('change', async () => {
    await addFiles(Array.from(fileInput.files));
    fileInput.value = '';
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
  return { addFiles };
}
