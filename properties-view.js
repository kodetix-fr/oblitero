import { DEFAULT_PROPERTIES, inspectPdf } from './properties.js';
import { byId } from './dom.js';
import { plural, t } from './i18n.js';

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
    title.textContent = info ? t('props.card-title', { name: file.name, pages: plural(info.pages, 'count.page.one', 'count.page.other') }) : file.name;
    element.append(title);
    const list = document.createElement('dl');
    for (const [label, value] of info ? facts(info) : [[t('props.error'), t('props.unreadable')]]) {
      const term = Object.assign(document.createElement('dt'), { textContent: label });
      const detail = Object.assign(document.createElement('dd'), { textContent: value || t('props.none'), className: value ? '' : 'none' });
      list.append(term, detail);
    }
    element.append(list);
    return element;
  }

  const fill = (settings) => {
    byId('props-title-input').value = settings.title;
    byId('props-author').value = settings.author;
    byId('props-subject').value = settings.subject;
    byId('props-keywords').value = settings.keywords;
    byId('props-dates').checked = settings.dates;
    byId('props-strip').checked = settings.stripAnnotations;
  };
  const read = () => ({
    title: byId('props-title-input').value.trim(),
    author: byId('props-author').value.trim(),
    subject: byId('props-subject').value.trim(),
    keywords: byId('props-keywords').value.trim(),
    dates: byId('props-dates').checked,
    stripAnnotations: byId('props-strip').checked,
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
    return new Promise((resolve) => {
      const session = new AbortController();
      const { signal } = session;
      let result = null;
      byId('props-cancel').addEventListener('click', () => dialog.close(), { signal });
      byId('props-reset').addEventListener('click', () => fill(DEFAULT_PROPERTIES), { signal });
      byId('props-apply').addEventListener(
        'click',
        () => {
          result = read();
          dialog.close();
        },
        { signal },
      );
      dialog.addEventListener(
        'close',
        () => {
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
