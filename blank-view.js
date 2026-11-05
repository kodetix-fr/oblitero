import { DEFAULT_POSITION, POSITIONS, blankIds, thresholdAt } from './blank.js';
import { askDialog, byId, icon } from './dom.js';
import { formatPercent, t } from './i18n.js';

// A dialog that shows every page with the ink it holds, and dims the ones that a slider would hide.
export function initBlank() {
  const dialog = byId('blank-dialog');
  const slider = byId('blank-threshold');
  const grid = byId('blank-pages');
  const apply = byId('blank-apply');
  slider.min = '0';
  slider.max = String(POSITIONS);

  // `items`: [{ id, number, ink, thumb }]. Resolves with the Set of the ids to hide, or null when the user cancels.
  function choose(items) {
    const rows = items.map((item) => {
      const row = document.createElement('li');
      row.title = t('blank.page-title', { n: item.number, percent: formatPercent(item.ink) });
      const mark = document.createElement('span');
      mark.className = 'blank-mark';
      mark.append(icon('eye-off'));
      const number = Object.assign(document.createElement('span'), { className: 'blank-number', textContent: String(item.number) });
      row.append(item.thumb, mark, number);
      return { item, row };
    });
    grid.replaceChildren(...rows.map(({ row }) => row));
    let chosen = new Set();

    const show = () => {
      const threshold = thresholdAt(Number(slider.value));
      chosen = blankIds(items, threshold);
      for (const { item, row } of rows) row.toggleAttribute('data-blank', chosen.has(item.id));
      byId('blank-level').textContent = t('blank.level', { percent: formatPercent(threshold) });
      byId('blank-count').textContent = t('blank.summary', { n: chosen.size, total: items.length });
      apply.disabled = chosen.size === 0;
    };
    slider.value = String(DEFAULT_POSITION);
    show();

    return askDialog(dialog, 'blank-cancel', (finish, signal) => {
      signal.addEventListener('abort', () => grid.replaceChildren());
      slider.addEventListener('input', show, { signal });
      apply.addEventListener('click', () => finish(chosen), { signal });
    });
  }

  return { choose };
}
