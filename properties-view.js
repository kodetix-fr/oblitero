import { DEFAULT_PROPERTIES, inspectPdf } from './properties.js';
import { askDialog, byId } from './dom.js';
import { pagesOf, plural, t } from './i18n.js';

const day = (date) => (date ? date.toISOString().slice(0, 10) : '');

// The lines of the report: a label, the value, and whether there is anything.
function facts(report) {
  const { annotations: found } = report;
  const yes = t('props.yes');
  return [
    [t('props.fact-title'), report.title],
    [t('props.fact-author'), report.author],
    [t('props.fact-subject'), report.subject],
    [t('props.fact-keywords'), report.keywords],
    [t('props.fact-created-with'), [report.creator, report.producer].filter(Boolean).join(' / ')],
    [t('props.fact-dates'), [day(report.created), day(report.modified)].filter(Boolean).join(', ')],
    [t('props.fact-xmp'), report.xmp ? yes : ''],
    [t('props.fact-files'), report.files.join(', ')],
    [t('props.fact-scripts'), report.scripts ? yes : ''],
    [t('props.fact-bookmarks'), report.bookmarks ? yes : ''],
    [t('props.fact-layers'), report.layers ? yes : ''],
    [t('props.fact-links'), found.links ? String(found.links) : ''],
    [t('props.fact-notes'), found.others ? String(found.others) : ''],
    [t('props.fact-fields'), report.fields ? plural(report.fields, 'count.field.one', 'count.field.other') : ''],
  ];
}

export function initProperties() {
  const dialog = byId('props-dialog');
  const report = byId('props-report');

  function card(file, info) {
    const element = document.createElement('div');
    element.className = 'report-card';
    const title = document.createElement('h4');
    title.textContent = info ? t('props.card-title', { name: file.name, pages: pagesOf(info.pages) }) : file.name;
    element.append(title);
    const found = info ? facts(info).filter(([, value]) => value) : [[t('props.error'), t('props.unreadable')]];
    const list = document.createElement('dl');
    for (const [label, value] of found) list.append(Object.assign(document.createElement('dt'), { textContent: label }), Object.assign(document.createElement('dd'), { textContent: value }));
    element.append(found.length ? list : Object.assign(document.createElement('p'), { className: 'none', textContent: t('props.nothing') }));
    element.dataset.found = String(info ? found.length : 0);
    return element;
  }

  const fill = (settings) => {
    byId('props-title-input').value = settings.title;
    byId('props-author').value = settings.author;
    byId('props-subject').value = settings.subject;
    byId('props-keywords').value = settings.keywords;
    byId('props-dates').checked = settings.dates;
    byId('props-strip').checked = settings.stripAnnotations;
    byId('props-bookmarks').checked = settings.bookmarks;
    byId('props-flatten').checked = settings.flatten;
  };
  const read = () => ({
    title: byId('props-title-input').value.trim(),
    author: byId('props-author').value.trim(),
    subject: byId('props-subject').value.trim(),
    keywords: byId('props-keywords').value.trim(),
    dates: byId('props-dates').checked,
    stripAnnotations: byId('props-strip').checked,
    flatten: byId('props-flatten').checked,
    bookmarks: byId('props-bookmarks').checked,
  });

  // `files`: [{ name, bytes }]. Resolves with the properties to write, or null when the user cancels.
  async function open(files, current) {
    fill(current);
    report.replaceChildren();
    const cards = await Promise.all(
      files.map(async (file) => {
        try {
          return card(file, await inspectPdf(file.bytes));
        } catch {
          return card(file, null);
        }
      }),
    );
    report.replaceChildren(...cards);
    const count = cards.reduce((sum, card) => sum + Number(card.dataset.found), 0);
    byId('props-summary').textContent = count ? t('props.found', { count }) : t('props.found-none');
    byId('props-summary').toggleAttribute('data-found', count > 0);
    byId('props-summary').removeAttribute('data-clean');
    return askDialog(dialog, 'props-cancel', (finish, signal) => {
      byId('props-reset').addEventListener('click', () => fill(DEFAULT_PROPERTIES), { signal });
      byId('props-clean').addEventListener(
        'click',
        () => {
          fill({ ...DEFAULT_PROPERTIES, dates: false, stripAnnotations: true, bookmarks: false });
          const summary = byId('props-summary');
          summary.textContent = t('props.cleaned');
          summary.removeAttribute('data-found');
          summary.toggleAttribute('data-clean', true);
          byId('props-apply').focus();
        },
        { signal },
      );
      byId('props-apply').addEventListener('click', () => finish(read()), { signal });
    });
  }

  return { open };
}
