import { initPages } from './pages-view.js';
import { byId } from './dom.js';

const pages = initPages();

// Files dragged in from outside: the page takes the drop (else the browser would open the file and leave the app), and a
// box says so. Dragging a card inside the page carries no file, so it never gets here.
const dragsFiles = (/** @type {DragEvent} */ event) => !!event.dataTransfer && [...event.dataTransfer.types].includes('Files');
const hint = byId('dropHint');
const showHint = (on) => {
  hint.hidden = !on;
  if (on) hint.firstElementChild.textContent = pages.hasDocument() ? 'Drop PDF files or photos to add them' : 'Drop PDF files or photos to start';
};

addEventListener('dragover', (event) => {
  if (!dragsFiles(event)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
  showHint(true);
});
addEventListener('dragleave', (event) => {
  if (!event.relatedTarget) showHint(false);
});
addEventListener('drop', async (event) => {
  if (!dragsFiles(event)) return;
  event.preventDefault();
  showHint(false);
  await pages.drop(Array.from(event.dataTransfer.files), event);
});
