import { checkText } from './stamps.js';
import { entrySize, paintEntry } from './render.js';
import { ARROWS, askDialog, byId, fitScale, query } from './dom.js';
import { clamp } from './math.js';
import { failureText, t } from './i18n.js';

const STEP = 0.01;

// Puts a picture or a line of text on a page. `draft` is { kind: 'image', png, aspect } or { kind: 'text', text, size };
// resolves with { mark, scope } (scope: page, selection or all) or null when the user cancels.
export async function placeMark({ doc, entry, draft, number, selectedCount }) {
  const dialog = byId('place-dialog');
  const stage = byId('place-stage');
  const layer = byId('place-layer');
  const error = byId('place-error');
  const isText = draft.kind === 'text';
  byId('place-icon').setAttribute('href', isText ? '#i-text' : '#i-sign');

  // A mark is placed on the whole page, as its fractions say, whatever its crop.
  const whole = { ...entry, crop: null };
  const shown = await entrySize(doc, whole);
  const scale = fitScale(shown.width, shown.height, 340);
  const stageWidth = shown.width * scale;
  const stageHeight = shown.height * scale;
  stage.style.width = `${stageWidth}px`;
  stage.style.height = `${stageHeight}px`;
  const canvas = byId('place-canvas');
  const painted = await paintEntry(doc, whole, scale * devicePixelRatio, true);
  canvas.width = painted.width;
  canvas.height = painted.height;
  canvas.getContext('2d').drawImage(painted, 0, 0);
  byId('place-where').textContent = t('page.n', { n: number });
  byId('scope-selection').hidden = selectedCount < 2;
  query('input[name="place-scope"][value="page"]').checked = true;
  byId('place-text-field').hidden = !isText;
  byId('place-font-hint').hidden = !isText;
  byId('place-date').hidden = !isText;
  byId('place-size-field').hidden = !isText;
  error.textContent = '';

  const measure = (text, size) => {
    const context = document.createElement('canvas').getContext('2d');
    context.font = `${size * stageWidth}px Helvetica, Arial, sans-serif`;
    return context.measureText(text || ' ').width / stageWidth;
  };

  const mark = isText ? { kind: 'text', text: draft.text, size: draft.size, x: 0.1, y: 0.1 } : { kind: 'image', png: draft.png, x: 0.5, y: 0.78, w: 0.3 };
  const ratio = stageWidth / stageHeight;
  const heightOf = () => (isText ? (mark.size * 1.15) * ratio : mark.w * draft.aspect * ratio);
  const widthOf = () => (isText ? measure(mark.text, mark.size) : mark.w);
  const keepInside = () => {
    mark.x = clamp(mark.x, 0, Math.max(0, 1 - widthOf()));
    mark.y = clamp(mark.y, 0, Math.max(0, 1 - heightOf()));
  };

  const element = document.createElement('div');
  element.className = `mark-draft${isText ? ' text' : ''}`;
  element.tabIndex = 0;
  element.setAttribute('role', 'button');
  element.setAttribute('aria-label', t(isText ? 'place.text-aria' : 'place.signature-aria'));
  let url = null;
  if (!isText) {
    url = URL.createObjectURL(new Blob([draft.png], { type: 'image/png' }));
    const picture = Object.assign(document.createElement('img'), { src: url, alt: '' });
    const handle = Object.assign(document.createElement('span'), { className: 'handle' });
    element.append(picture, handle);
    handle.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      handle.setPointerCapture(event.pointerId);
      const start = { x: event.clientX, width: mark.w };
      const move = (e) => {
        mark.w = clamp(start.width + (e.clientX - start.x) / stageWidth, 0.04, 1 - mark.x);
        keepInside();
        layout();
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', () => handle.removeEventListener('pointermove', move), { once: true });
    });
  }
  layer.replaceChildren(element);

  function layout() {
    keepInside();
    Object.assign(element.style, { left: `${mark.x * 100}%`, top: `${mark.y * 100}%` });
    if (isText) {
      element.textContent = mark.text;
      element.style.fontSize = `${mark.size * stageWidth}px`;
    } else {
      Object.assign(element.style, { width: `${mark.w * 100}%`, height: `${heightOf() * 100}%` });
    }
  }
  layout();

  element.addEventListener('pointerdown', (event) => {
    if (event.target !== element && /** @type {Element} */ (event.target).tagName !== 'IMG') return;
    element.setPointerCapture(event.pointerId);
    const start = { x: event.clientX, y: event.clientY, mx: mark.x, my: mark.y };
    const move = (e) => {
      mark.x = start.mx + (e.clientX - start.x) / stageWidth;
      mark.y = start.my + (e.clientY - start.y) / stageHeight;
      layout();
    };
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', () => element.removeEventListener('pointermove', move), { once: true });
  });

  element.addEventListener('keydown', (event) => {
    const arrow = ARROWS[event.key];
    if (arrow) {
      event.preventDefault();
      if (event.shiftKey) {
        const grow = arrow[0] + -arrow[1] > 0 ? 1 : -1;
        if (isText) mark.size = clamp(mark.size + grow * 0.002, 0.008, 0.08);
        else mark.w = clamp(mark.w + grow * STEP, 0.04, 1 - mark.x);
      } else {
        mark.x += arrow[0] * STEP;
        mark.y += arrow[1] * STEP;
      }
      layout();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      byId('place-go').click();
    }
  });

  const session = new AbortController();
  const { signal } = session;
  if (isText) {
    byId('place-text').value = mark.text;
    byId('place-size').value = String(Math.round(mark.size * 1000));
    byId('place-text').addEventListener('input', () => {
      mark.text = byId('place-text').value;
      layout();
    }, { signal });
    byId('place-size').addEventListener('input', () => {
      mark.size = Number(byId('place-size').value) / 1000;
      layout();
    }, { signal });
    byId('place-date').addEventListener('click', () => {
      byId('place-text').value = new Date().toISOString().slice(0, 10);
      byId('place-text').dispatchEvent(new Event('input'));
    }, { signal });
  }

  return askDialog(dialog, 'place-cancel', (finish, closed) => {
    closed.addEventListener('abort', () => {
      session.abort();
      if (url) URL.revokeObjectURL(url);
    });
    byId('place-go').addEventListener(
      'click',
      async () => {
        if (isText) {
          if (!mark.text.trim()) {
            error.textContent = t('place.error-text');
            return;
          }
          try {
            await checkText(mark.text);
          } catch (problem) {
            error.textContent = failureText(problem);
            return;
          }
        }
        const scope = query('input[name="place-scope"]:checked').value;
        finish({ mark: { ...mark, h: isText ? undefined : heightOf() }, scope });
      },
      { signal: closed },
    );
    queueMicrotask(() => element.focus());
  });
}
