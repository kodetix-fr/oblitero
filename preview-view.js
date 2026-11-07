import { byId, unreadablePage } from './dom.js';
import { clamp } from './math.js';
import { t } from './i18n.js';
import { closeRender, openRender, pageSize, renderPage } from './render.js';

const PREVIEW_WIDTH = 860;
const WHEEL_STEP = 80;
const WHEEL_PAUSE_MS = 200;
const KEY_STEPS = { ArrowLeft: -1, ArrowRight: 1, PageUp: -1, PageDown: 1 };

export function initPreview() {
  const dialog = byId('preview-dialog');
  const stage = byId('preview-page');
  let source = null;
  let page = 0;
  let token = 0;
  let wheel = 0;
  let flipped = 0;

  async function paint() {
    const mine = ++token;
    byId('preview-count').textContent = t('compare.page-of', { n: page + 1, total: source.count });
    byId('preview-prev').disabled = page === 0;
    byId('preview-next').disabled = page === source.count - 1;
    if (source.caption) byId('preview-caption').textContent = source.caption(page);
    try {
      const canvas = await source.draw(page, PREVIEW_WIDTH * devicePixelRatio);
      if (mine !== token) return;
      stage.replaceChildren(canvas);
    } catch {
      if (mine === token) stage.replaceChildren(unreadablePage());
    }
  }

  function flip(step) {
    const next = clamp(page + step, 0, source.count - 1);
    if (next === page) return;
    page = next;
    paint();
  }
  byId('preview-prev').addEventListener('click', () => flip(-1));
  byId('preview-next').addEventListener('click', () => flip(1));

  // On the document: the button that had the focus is disabled at the first and the last page, and the focus leaves the dialog.
  document.addEventListener('keydown', (event) => {
    const step = KEY_STEPS[event.key];
    if (!dialog.open || !step) return;
    event.preventDefault();
    flip(step);
  });

  // A trackpad keeps sending wheel events after the swipe, so one page turn waits for a pause.
  dialog.addEventListener('wheel', (event) => {
    event.preventDefault();
    if (event.timeStamp - flipped < WHEEL_PAUSE_MS) return;
    wheel += event.deltaY;
    if (Math.abs(wheel) < WHEEL_STEP) return;
    const step = Math.sign(wheel);
    wheel = 0;
    flipped = event.timeStamp;
    flip(step);
  }, { passive: false });

  // The close event comes after the dialog has closed, and it can come after the dialog opened again: then it is stale.
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    token += 1;
    source?.close?.();
    source = null;
  });
  byId('preview-close').addEventListener('click', () => dialog.close());

  async function show(next, title) {
    source?.close?.();
    source = next;
    page = next.start ?? 0;
    wheel = 0;
    byId('preview-title').textContent = title;
    stage.replaceChildren();
    dialog.showModal();
    await paint();
  }

  return {
    async openPdf(bytes, title, caption) {
      const doc = await openRender(bytes);
      byId('preview-caption').textContent = caption;
      await show(
        {
          count: doc.numPages,
          draw: async (index, width) => {
            const canvas = document.createElement('canvas');
            await renderPage(doc, index, 0, canvas, width / (await pageSize(doc, index, 0)).width);
            return canvas;
          },
          close: () => closeRender(doc),
        },
        title,
      );
    },
    openPages: show,
  };
}
