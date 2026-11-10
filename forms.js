import { PDFCheckBox, PDFDict, PDFDocument, PDFDropdown, PDFHexString, PDFName, PDFOptionList, PDFRadioGroup, PDFString, PDFTextField } from './vendor/pdf-lib.esm.min.js';

// pdf-lib sizes the text of a multiline field with no size of its own as large as the box allows.
const MULTILINE_SIZE = 10;

const alternateName = (field) => {
  const text = field.acroField.dict.lookup(PDFName.of('TU'));
  return text instanceof PDFString || text instanceof PDFHexString ? text.decodeText() : null;
};

// The pages (0-based) a field is drawn on, found through the annotations of the pages.
const pagesOf = (document) => {
  const owners = new Map();
  document.getPages().forEach((page, index) => {
    const annotations = page.node.Annots();
    for (let i = 0; annotations && i < annotations.size(); i++) owners.set(annotations.lookup(i), index);
  });
  return (field) => [...new Set(field.acroField.getWidgets().map((widget) => owners.get(widget.dict)).filter((page) => page !== undefined))].sort((a, b) => a - b);
};

function describe(field) {
  if (field instanceof PDFTextField) return { type: 'text', value: field.getText() ?? '', multiline: field.isMultiline(), maxLength: field.getMaxLength() ?? null };
  if (field instanceof PDFCheckBox) return { type: 'checkbox', value: field.isChecked() };
  if (field instanceof PDFRadioGroup) return { type: 'radio', options: field.getOptions(), value: field.getSelected() ?? '' };
  if (field instanceof PDFDropdown) return { type: 'dropdown', options: field.getOptions(), editable: field.isEditable(), value: field.getSelected()[0] ?? '' };
  if (field instanceof PDFOptionList) return { type: 'list', options: field.getOptions(), value: field.getSelected()[0] ?? '' };
  return { type: 'unsupported' };
}

/**
 * The fields of the form of a loaded document, in their order: { name, label, pages, readOnly, type, value, ... }.
 * `type` is text, checkbox, radio, dropdown or list; a button or a signature is `unsupported` and listed all the same.
 * @param {any} document
 */
export function readFields(document) {
  let fields;
  try {
    fields = document.getForm().getFields();
  } catch {
    return [];
  }
  const pageOf = pagesOf(document);
  return fields.map((field) => {
    const base = { name: field.getName(), label: alternateName(field) || field.getName().split('.').pop(), pages: pageOf(field), readOnly: field.isReadOnly() };
    try {
      return { ...base, ...describe(field) };
    } catch {
      return { ...base, type: 'unsupported' };
    }
  });
}

// The values of `values` (field name to value) that differ from what the fields hold in the file.
export function changedValues(fields, values) {
  return Object.fromEntries(fields.filter((field) => Object.hasOwn(values, field.name) && values[field.name] !== field.value).map((field) => [field.name, values[field.name]]));
}

/**
 * The document with `values` (field name to text, true or false, or the chosen option) written into its fields and the whole
 * form flattened: the values become the content of the pages and no field is left.
 * @param {Uint8Array} bytes
 * @param {Record<string, string | boolean>} values
 */
export async function fillForm(bytes, values) {
  const document = await PDFDocument.load(bytes);
  const form = document.getForm();
  for (const [name, value] of Object.entries(values)) {
    const field = form.getFieldMaybe(name);
    if (!field || field.isReadOnly()) continue;
    if (field instanceof PDFTextField) {
      const size = /([\d.]+)\s+Tf/.exec(field.acroField.getDefaultAppearance() ?? '')?.[1];
      if (field.isMultiline() && !Number(size)) field.setFontSize(MULTILINE_SIZE);
      field.setText(value === '' ? undefined : String(value));
    }
    else if (field instanceof PDFCheckBox) {
      if (value) field.check();
      else field.uncheck();
    } else if (field instanceof PDFRadioGroup || field instanceof PDFDropdown || field instanceof PDFOptionList) {
      if (value === '') field.clear();
      else field.select(String(value));
    }
  }
  form.deleteXFA();
  form.flatten();
  for (const page of document.getPages()) {
    const annotations = page.node.Annots();
    for (let i = (annotations?.size() ?? 0) - 1; i >= 0; i--) {
      const annotation = annotations.lookupMaybe(i, PDFDict);
      if (!annotation || annotation.get(PDFName.of('Subtype')) === PDFName.of('Widget')) annotations.remove(i);
    }
  }
  document.catalog.delete(PDFName.of('AcroForm'));
  return document.save();
}
