import { formatSize } from './compress.js';
import { byId } from './dom.js';
import { closeRender, openRender, pageSize, renderPage } from './render.js';

const COMPARE_WIDTH = 860;

// A dialog that shows the same page of two PDFs, the first on the left of a line the pointer drags and the second on its right.
export function initCompare() {
  const dialog = byId('compare-dialog');
  const stage = byId('compare-stage');
  const handle = byId('compare-handle');
  let docs = null;
  let page = 0;
  let token = 0;

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

  async function paint() {
    const mine = ++token;
    try {
      const [before, after] = await docs;
      if (mine !== token) return;
      page = Math.min(page, before.numPages - 1);
      byId('compare-page').textContent = `Page ${page + 1} of ${before.numPages}`;
      byId('compare-prev').disabled = page === 0;
      byId('compare-next').disabled = page === before.numPages - 1;
      const scale = (COMPARE_WIDTH * devicePixelRatio) / (await pageSize(before, page, 0)).width;
      const canvases = [document.createElement('canvas'), document.createElement('canvas')];
      await Promise.all([renderPage(before, page, 0, canvases[0], scale), renderPage(after, page, 0, canvases[1], scale)]);
      if (mine === token) byId('compare-pages').replaceChildren(...canvases);
    } catch {
      if (mine === token) byId('compare-pages').replaceChildren();
    }
  }
  for (const [id, step] of /** @type {Array<[string, number]>} */ ([['compare-prev', -1], ['compare-next', 1]])) {
    byId(id).addEventListener('click', () => {
      page += step;
      paint();
    });
  }

  dialog.addEventListener('close', () => {
    token += 1;
    docs?.then(([before, after]) => {
      closeRender(before);
      closeRender(after);
    }, () => {});
  });
  byId('compare-close').addEventListener('click', () => dialog.close());

  return {
    async open(beforeBytes, afterBytes, caption) {
      docs = Promise.all([openRender(beforeBytes), openRender(afterBytes)]);
      page = 0;
      setSplit(50);
      byId('compare-caption').textContent = caption;
      byId('compare-before-size').textContent = formatSize(beforeBytes.length);
      byId('compare-after-size').textContent = formatSize(afterBytes.length);
      byId('compare-pages').replaceChildren();
      dialog.showModal();
      await paint();
    },
  };
}
