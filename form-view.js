import { askDialog, byId } from './dom.js';
import { t } from './i18n.js';
import { checkText } from './stamps.js';

const pagesText = (pages) => (pages.length === 1 ? t('page.n', { n: pages[0] + 1 }) : pages.length ? t('form.pages', { list: pages.map((page) => page + 1).join(', ') }) : '');
const element = (tag, attributes = {}) => Object.assign(document.createElement(tag), attributes);

// A dialog that lists the fields of the forms and lets the user fill them.
export function initForm() {
  const dialog = byId('form-dialog');
  const body = byId('form-fields');
  const error = byId('form-error');
  let rows = [];

  function control(field, value, id, datalist) {
    if (field.type === 'checkbox') return element('input', { type: 'checkbox', checked: !!value, id });
    if (field.type === 'text') {
      const box = field.multiline ? element('textarea', { rows: 3 }) : element('input', { type: 'text' });
      Object.assign(box, { value, id, spellcheck: false });
      if (field.maxLength) box.maxLength = field.maxLength;
      return box;
    }
    if (field.type === 'dropdown' && field.editable) {
      const box = element('input', { type: 'text', value, id, spellcheck: false });
      box.setAttribute('list', `${id}-options`);
      datalist.append(...field.options.map((option) => element('option', { value: option })));
      datalist.id = `${id}-options`;
      return box;
    }
    const select = element('select', { id });
    select.append(element('option', { value: '', textContent: t('form.none') }), ...field.options.map((option) => element('option', { value: option, textContent: option })));
    select.value = value;
    return select;
  }

  function row(field, value, id) {
    if (field.type === 'unsupported') return { node: element('p', { className: 'form-note', textContent: t('form.unsupported', { name: field.label }) }) };
    const node = element('div', { className: 'form-row' });
    const datalist = element('datalist');
    const input = control(field, value, id, datalist);
    input.disabled = field.readOnly;
    const label = element('label', { htmlFor: id });
    label.append(element('span', { className: 'form-label', textContent: field.label, title: field.name }));
    const meta = [pagesText(field.pages), field.readOnly ? t('form.read-only') : ''].filter(Boolean).join(t('list-gap'));
    if (meta) label.append(element('span', { className: 'form-meta', textContent: meta }));
    node.append(label, input, datalist);
    return { node, field, input };
  }

  const valueOf = ({ field, input }) => (field.type === 'checkbox' ? input.checked : input.value);

  // `files`: [{ index, name, fields, values }]. Resolves with a Map of the file index to the value of each field the user
  // can fill, or null when they cancel.
  function edit(files) {
    error.textContent = '';
    rows = [];
    let count = 0;
    body.replaceChildren(
      ...files.map((file) => {
        const section = element('section', { className: 'form-file' });
        section.append(element('h3', { textContent: file.name }));
        for (const field of file.fields) {
          const made = row(field, Object.hasOwn(file.values, field.name) ? file.values[field.name] : field.value, `form-field-${count++}`);
          if (made.field) rows.push({ ...made, index: file.index });
          section.append(made.node);
        }
        return section;
      }),
    );
    return askDialog(dialog, 'form-cancel', (finish, signal) => {
      byId('form-reset').addEventListener(
        'click',
        () => {
          error.textContent = '';
          for (const made of rows) {
            if (made.field.type === 'checkbox') made.input.checked = !!made.field.value;
            else made.input.value = made.field.value;
          }
        },
        { signal },
      );
      byId('form-apply').addEventListener(
        'click',
        async () => {
          for (const made of rows) {
            const value = valueOf(made);
            if (typeof value !== 'string' || !value || made.field.type === 'radio' || made.field.type === 'list' || (made.field.type === 'dropdown' && !made.field.editable)) continue;
            try {
              for (const line of value.split(/\r?\n/)) if (line) await checkText(line);
            } catch (problem) {
              error.textContent = t('form.error-field', { label: made.field.label, message: problem.message });
              made.input.focus();
              return;
            }
          }
          const result = new Map();
          for (const made of rows) {
            if (made.field.readOnly) continue;
            if (!result.has(made.index)) result.set(made.index, {});
            result.get(made.index)[made.field.name] = valueOf(made);
          }
          finish(result);
        },
        { signal },
      );
    });
  }

  return { edit };
}
