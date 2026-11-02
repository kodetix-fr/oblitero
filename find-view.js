import { PRESETS, findMatches } from './find.js';
import { byId, setI18n } from './dom.js';
import { plural, t } from './i18n.js';

const matches = (count) => plural(count, 'count.match.one', 'count.match.other');
const pagesOf = (count) => plural(count, 'count.page.one', 'count.page.other');

export function initFind() {
  const dialog = byId('find-dialog');
  const presets = byId('find-presets');
  const results = byId('find-results');
  const note = byId('find-note');
  const apply = byId('find-apply');
  const toggle = byId('find-toggle');

  for (const id of PRESETS) {
    const wrapper = document.createElement('label');
    const label = document.createElement('span');
    setI18n(label, `preset.${id}`);
    wrapper.append(Object.assign(document.createElement('input'), { type: 'checkbox', name: 'preset', value: id, checked: id !== 'phone' }), label);
    presets.append(wrapper);
  }

  // `pages`: [{ page, number }] to search, `read(page)` gives { text, runs }. Resolves with a Map of page id to the rectangles
  // to add, or null when the user cancels.
  function open(pages, read) {
    results.replaceChildren();
    note.textContent = '';
    byId('find-count').textContent = '';
    apply.disabled = true;
    toggle.disabled = true;
    let found = [];
    let searching = 0;

    const checked = () => found.filter((entry) => entry.box.checked);
    const refresh = () => {
      const chosen = checked();
      byId('find-apply-label').textContent = chosen.length ? t('find.redact-n', { matches: matches(chosen.length) }) : t('find.redact');
      apply.disabled = chosen.length === 0;
      toggle.textContent = chosen.length === found.length ? t('find.find-toggle') : t('find.select-all');
      toggle.disabled = found.length === 0;
      byId('find-count').textContent = found.length ? matches(found.length) : '';
    };

    async function search() {
      const mine = ++searching;
      const kinds = [...presets.querySelectorAll('input:checked')].map((input) => input.value);
      const words = byId('find-words').value.split(/[,\n]/);
      results.replaceChildren();
      found = [];
      refresh();
      let withoutText = 0;
      for (const [index, { page, number }] of pages.entries()) {
        note.textContent = t('find.reading', { n: index + 1, total: pages.length });
        const { text, runs } = await read(page);
        if (mine !== searching) return;
        if (!text.trim()) withoutText++;
        for (const match of findMatches(text, { presets: kinds, words })) {
          const boxes = runs.filter((run) => run.box && run.start < match.end && run.end > match.start).map((run) => run.box);
          if (boxes.length === 0) continue;
          const item = document.createElement('li');
          const box = Object.assign(document.createElement('input'), { type: 'checkbox', checked: true });
          box.setAttribute('aria-label', t('find.match-aria', { page: number, text: match.text }));
          box.addEventListener('change', refresh);
          const where = Object.assign(document.createElement('span'), { className: 'page', textContent: t('page.n', { n: number }) });
          const kind = Object.assign(document.createElement('span'), { className: 'kind', textContent: t(`preset.${match.kind}`) });
          const snippet = Object.assign(document.createElement('span'), { className: 'snippet', textContent: match.text, title: match.text });
          item.append(box, where, kind, snippet);
          results.append(item);
          found.push({ page, boxes, box });
        }
        refresh();
        await new Promise((resolve) => setTimeout(resolve));
      }
      const pagesWith = new Set(found.map((entry) => entry.page.id)).size;
      note.textContent = [
        found.length ? t('find.found', { matches: matches(found.length), pages: pagesOf(pagesWith) }) : t('find.none'),
        withoutText ? t('find.no-text', { pages: pagesOf(withoutText) }) : '',
        t('find.covers'),
      ]
        .filter(Boolean)
        .join(t('sentence-gap'));
    }

    return new Promise((resolve) => {
      const session = new AbortController();
      const { signal } = session;
      let result = null;
      byId('find-run').addEventListener('click', search, { signal });
      byId('find-words').addEventListener('keydown', (event) => event.key === 'Enter' && search(), { signal });
      toggle.addEventListener(
        'click',
        () => {
          const all = checked().length !== found.length;
          for (const entry of found) entry.box.checked = all;
          refresh();
        },
        { signal },
      );
      byId('find-cancel').addEventListener('click', () => dialog.close(), { signal });
      apply.addEventListener(
        'click',
        () => {
          result = new Map();
          for (const entry of checked()) result.set(entry.page.id, [...(result.get(entry.page.id) ?? []), ...entry.boxes]);
          dialog.close();
        },
        { signal },
      );
      dialog.addEventListener(
        'close',
        () => {
          searching++;
          session.abort();
          resolve(result);
        },
        { once: true },
      );
      dialog.showModal();
    });
  }

  return { open };
}
