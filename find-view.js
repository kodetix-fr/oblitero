import { PRESETS, findMatches } from './find.js';
import { byId } from './dom.js';

const KIND = Object.fromEntries([...PRESETS, ['word', 'Word']]);
const plural = (count, word) => `${count} ${count === 1 ? word : `${word}${word.endsWith('ch') ? 'es' : 's'}`}`;

export function initFind() {
  const dialog = byId('find-dialog');
  const presets = byId('find-presets');
  const results = byId('find-results');
  const note = byId('find-note');
  const apply = byId('find-apply');
  const toggle = byId('find-toggle');

  for (const [id, label] of PRESETS) {
    const wrapper = document.createElement('label');
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
      byId('find-apply-label').textContent = chosen.length ? `Redact ${plural(chosen.length, 'match')}` : 'Redact';
      apply.disabled = chosen.length === 0;
      toggle.textContent = chosen.length === found.length ? 'Select none' : 'Select all';
      toggle.disabled = found.length === 0;
      byId('find-count').textContent = found.length ? plural(found.length, 'match') : '';
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
        note.textContent = `Reading page ${index + 1} of ${pages.length}...`;
        const { text, runs } = await read(page);
        if (mine !== searching) return;
        if (!text.trim()) withoutText++;
        for (const match of findMatches(text, { presets: kinds, words })) {
          const boxes = runs.filter((run) => run.box && run.start < match.end && run.end > match.start).map((run) => run.box);
          if (boxes.length === 0) continue;
          const item = document.createElement('li');
          const box = Object.assign(document.createElement('input'), { type: 'checkbox', checked: true });
          box.setAttribute('aria-label', `Page ${number}: ${match.text}`);
          box.addEventListener('change', refresh);
          const where = Object.assign(document.createElement('span'), { className: 'page', textContent: `Page ${number}` });
          const kind = Object.assign(document.createElement('span'), { className: 'kind', textContent: KIND[match.kind] });
          const snippet = Object.assign(document.createElement('span'), { className: 'snippet', textContent: match.text, title: match.text });
          item.append(box, where, kind, snippet);
          results.append(item);
          found.push({ page, boxes, box });
        }
        refresh();
        await new Promise((resolve) => setTimeout(resolve));
      }
      const pagesWith = new Set(found.map((entry) => entry.page.id)).size;
      note.textContent = `${found.length ? `${plural(found.length, 'match')} on ${plural(pagesWith, 'page')}.` : 'Nothing found.'}${withoutText ? ` ${plural(withoutText, 'page')} without a text layer (scans) could not be searched.` : ''} Each match covers the whole line of text it is in.`;
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
