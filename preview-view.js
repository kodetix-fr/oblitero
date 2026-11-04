import { byId } from './dom.js';
import { t } from './i18n.js';
import { closeRender, openRender, pageSize, renderPage } from './render.js';

const PREVIEW_WIDTH = 860;
const WHEEL_STEP = 80;
const WHEEL_PAUSE_MS = 200;

export function initPreview() {
  const dialog = byId('preview-dialog');
  const stage = byId('preview-page');
  let doc = null;
  let page = 0;
  let token = 0;
  let wheel = 0;
  let flipped = 0;

  async function paint() {
    const mine = ++token;
    byId('preview-count').textContent = t('compare.page-of', { n: page + 1, total: doc.numPages });
    byId('preview-prev').disabled = page === 0;
    byId('preview-next').disabled = page === doc.numPages - 1;
    try {
      const scale = (PREVIEW_WIDTH * devicePixelRatio) / (await pageSize(doc, page, 0)).width;
      const canvas = document.createElement('canvas');
      await renderPage(doc, page, 0, canvas, scale);
      if (mine !== token) return;
      stage.replaceChildren(canvas);
    } catch {
      if (mine === token) stage.replaceChildren();
    }
  }
  for (const [id, step] of /** @type {Array<[string, number]>} */ ([['preview-prev', -1], ['preview-next', 1]])) {
    byId(id).addEventListener('click', () => {
      page += step;
      paint();
    });
  }

  // A trackpad keeps sending wheel events after the swipe, so one page turn waits for a pause.
  dialog.addEventListener('wheel', (event) => {
    event.preventDefault();
    if (event.timeStamp - flipped < WHEEL_PAUSE_MS) return;
    wheel += event.deltaY;
    if (Math.abs(wheel) < WHEEL_STEP) return;
    const next = Math.max(0, Math.min(doc.numPages - 1, page + Math.sign(wheel)));
    wheel = 0;
    flipped = event.timeStamp;
    if (next === page) return;
    page = next;
    paint();
  }, { passive: false });

  dialog.addEventListener('close', () => {
    token += 1;
    closeRender(doc);
  });
  byId('preview-close').addEventListener('click', () => dialog.close());

  return {
    async open(bytes, title, caption) {
      doc = await openRender(bytes);
      page = 0;
      wheel = 0;
      byId('preview-title').textContent = title;
      byId('preview-caption').textContent = caption;
      stage.replaceChildren();
      dialog.showModal();
      await paint();
    },
  };
}
