import { icon } from './dom.js';
import { plural, t } from './i18n.js';

const TONES = 7;
const urls = new WeakMap();

function markUrl(png) {
  if (!urls.has(png)) urls.set(png, URL.createObjectURL(new Blob([png], { type: 'image/png' })));
  return urls.get(png);
}

function markElement(mark) {
  const element = document.createElement('span');
  Object.assign(element.style, { left: `${mark.x * 100}%`, top: `${mark.y * 100}%` });
  element.style.setProperty('--turn', `${mark.turn}deg`);
  element.toggleAttribute('data-sideways', mark.turn % 180 !== 0);
  if (mark.kind === 'image') {
    element.className = 'mark-img';
    Object.assign(element.style, { width: `${mark.w * 100}%`, height: `${mark.h * 100}%` });
    element.append(Object.assign(document.createElement('img'), { src: markUrl(mark.png), alt: '' }));
  } else {
    element.className = 'mark-text';
    element.textContent = mark.text;
    element.style.setProperty('--size', String(mark.size));
  }
  return element;
}

// The entry of a page in the grid: its button, its thumbnail with what was put on it, and the scissors after it.
export function pageCard({ page, number, name, canvas, last, part, fileTone, tagged, focused, pressed, hasCut }, { onChoose, onOpen, onFocus, onCut }) {
  const item = document.createElement('li');
  item.draggable = true;
  item.dataset.id = String(page.id);
  if (part !== null) {
    item.dataset.part = String(part);
    item.style.setProperty('--tone', String(((part * 360) / TONES) | 0));
  }
  if (fileTone !== null) {
    item.dataset.file = String(page.file);
    item.style.setProperty('--file-tone', String(fileTone));
  }
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'card';
  toggle.tabIndex = focused ? 0 : -1;
  const count = page.redactions.length;
  const redactions = count ? plural(count, 'count.redaction.one', 'count.redaction.other') : '';
  toggle.setAttribute('aria-label', [t('page.n', { n: number }), page.blank ? t('card.blank') : '', redactions, page.hidden ? t('card.hidden') : ''].filter(Boolean).join(t('list-gap')));
  toggle.setAttribute('aria-pressed', String(pressed));

  const check = document.createElement('span');
  check.className = 'check';
  check.append(icon('check'));
  toggle.append(check);
  toggle.title = `${name}\n${t('card.large')}`;
  if (tagged) toggle.append(Object.assign(document.createElement('span'), { className: 'run-tag', textContent: name }));
  if (count) {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = t('card.redacted', { n: count });
    toggle.append(badge);
  }
  const thumb = document.createElement('span');
  thumb.className = 'thumb';
  thumb.append(canvas);
  for (const { x, y, w, h } of page.redactions) {
    const box = document.createElement('span');
    box.className = 'box';
    Object.assign(box.style, { left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` });
    thumb.append(box);
  }
  thumb.append(...page.marks.map(markElement));
  thumb.style.setProperty('--fit', canvas.style.getPropertyValue('--fit') || '1');
  thumb.style.setProperty('--aspect', canvas.style.getPropertyValue('--aspect') || '1');
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = String(number);
  toggle.append(thumb, label);
  if (page.hidden) {
    const mark = document.createElement('span');
    mark.className = 'hidden-mark';
    mark.append(icon('eye-off'));
    toggle.append(mark);
    item.dataset.hidden = '';
  }
  toggle.addEventListener('click', (event) => onChoose(event.shiftKey));
  toggle.addEventListener('dblclick', onOpen);
  toggle.addEventListener('focus', onFocus);
  item.append(toggle);

  if (!last) {
    const cut = document.createElement('button');
    cut.type = 'button';
    cut.className = 'cut';
    cut.tabIndex = -1;
    cut.title = t(hasCut ? 'cut.remove' : 'cut.add');
    cut.setAttribute('aria-label', t(hasCut ? 'cut.remove-aria' : 'cut.add-aria', { n: number }));
    cut.setAttribute('aria-pressed', String(hasCut));
    cut.append(icon('cut'));
    cut.addEventListener('click', onCut);
    item.append(cut);
    if (hasCut) item.dataset.cut = '';
  }
  return { item, toggle };
}
