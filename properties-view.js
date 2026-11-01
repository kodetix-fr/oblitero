import { DEFAULT_PROPERTIES, inspectPdf } from './properties.js';
import { byId } from './dom.js';

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
const day = (date) => (date ? date.toISOString().slice(0, 10) : '');

// The lines of the report: a label, the value, and whether there is anything.
function facts(report) {
  const { annotations: found } = report;
  return [
    ['Title', report.title],
    ['Author', report.author],
    ['Subject', report.subject],
    ['Keywords', report.keywords],
    ['Created with', [report.creator, report.producer].filter(Boolean).join(' / ')],
    ['Dates', [day(report.created), day(report.modified)].filter(Boolean).join(', ')],
    ['XMP metadata', report.xmp ? 'yes' : ''],
    ['Embedded files', report.files.join(', ')],
    ['Scripts', report.scripts ? 'yes' : ''],
    ['Bookmarks', report.bookmarks ? 'yes' : ''],
    ['Hidden layers', report.layers ? 'yes' : ''],
    ['Links', found.links ? String(found.links) : ''],
    ['Comments and other notes', found.others ? String(found.others) : ''],
    ['Form fields', report.fields ? plural(report.fields, 'field') : ''],
  ];
}

export function initProperties() {
  const dialog = byId('props-dialog');
  const report = byId('props-report');

  function card(file, info) {
    const element = document.createElement('div');
    element.className = 'report-card';
    const title = document.createElement('h4');
    title.textContent = `${file.name}${info ? `, ${plural(info.pages, 'page')}` : ''}`;
    element.append(title);
    const list = document.createElement('dl');
    for (const [label, value] of info ? facts(info) : [['Error', 'This file could not be read.']]) {
      const term = Object.assign(document.createElement('dt'), { textContent: label });
      const detail = Object.assign(document.createElement('dd'), { textContent: value || 'none', className: value ? '' : 'none' });
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
