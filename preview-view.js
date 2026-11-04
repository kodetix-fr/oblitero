import { byId } from './dom.js';
import { t } from './i18n.js';
import { closeRender, openRender, pageSize, renderPage } from './render.js';

const PREVIEW_WIDTH = 860;

export function initPreview() {
  const dialog = byId('preview-dialog');
  const stage = byId('preview-page');
  let doc = null;
  let page = 0;
  let token = 0;

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

  dialog.addEventListener('close', () => {
    token += 1;
    closeRender(doc);
  });
  byId('preview-close').addEventListener('click', () => dialog.close());

  return {
    async open(bytes, caption) {
      doc = await openRender(bytes);
      page = 0;
      byId('preview-caption').textContent = caption;
      stage.replaceChildren();
      dialog.showModal();
      await paint();
    },
  };
}
