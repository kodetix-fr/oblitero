import { PDFArray, PDFDict, PDFDocument, PDFName } from './vendor/pdf-lib.esm.min.js';

const name = (value) => PDFName.of(value);

// The names of a PDF name tree (embedded files, scripts): its pairs of name and value, and the same in its kids.
function treeNames(node, depth = 0) {
  if (!node || depth > 8) return [];
  const found = [];
  const list = node.lookupMaybe(name('Names'), PDFArray);
  if (list) {
    for (let i = 0; i < list.size(); i += 2) {
      const key = list.lookup(i);
      found.push(key.decodeText ? key.decodeText() : String(key));
    }
  }
  const kids = node.lookupMaybe(name('Kids'), PDFArray);
  if (kids) for (let i = 0; i < kids.size(); i++) found.push(...treeNames(kids.lookupMaybe(i, PDFDict), depth + 1));
  return found;
}

// What a PDF file carries besides its pages.
export async function inspectPdf(bytes) {
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  const catalog = document.catalog;
  const names = catalog.lookupMaybe(name('Names'), PDFDict);
  const annotations = { links: 0, widgets: 0, others: 0 };
  for (const page of document.getPages()) {
    const list = page.node.lookupMaybe(name('Annots'), PDFArray);
    for (let i = 0; list && i < list.size(); i++) {
      const kind = String(list.lookupMaybe(i, PDFDict)?.get(name('Subtype')));
      if (kind === '/Link') annotations.links++;
      else if (kind === '/Widget') annotations.widgets++;
      else annotations.others++;
    }
  }
  const fields = (() => {
    try {
      return document.getForm().getFields().length;
    } catch {
      return 0;
    }
  })();
  return {
    pages: document.getPageCount(),
    title: document.getTitle(),
    author: document.getAuthor(),
    subject: document.getSubject(),
    keywords: document.getKeywords(),
    creator: document.getCreator(),
    producer: document.getProducer(),
    created: document.getCreationDate(),
    modified: document.getModificationDate(),
    xmp: catalog.has(name('Metadata')),
    bookmarks: catalog.has(name('Outlines')),
    layers: catalog.has(name('OCProperties')),
    files: names ? treeNames(names.lookupMaybe(name('EmbeddedFiles'), PDFDict)) : [],
    scripts: (names ? treeNames(names.lookupMaybe(name('JavaScript'), PDFDict)) : []).length + (catalog.has(name('OpenAction')) || catalog.has(name('AA')) ? 1 : 0),
    annotations,
    fields,
  };
}

// settings: { title, author, subject, keywords, dates, stripAnnotations, bookmarks }; the bookmarks are written by the output. The output is a new document, so the properties of
// the sources are not in it; what is written here is what the user typed.
export function applyProperties(output, settings) {
  if (settings.title) output.setTitle(settings.title);
  if (settings.author) output.setAuthor(settings.author);
  if (settings.subject) output.setSubject(settings.subject);
  const keywords = settings.keywords.split(',').map((word) => word.trim()).filter(Boolean);
  if (keywords.length) output.setKeywords(keywords);
  if (!settings.dates) {
    output.getInfoDict().delete(name('CreationDate'));
    output.getInfoDict().delete(name('ModDate'));
  }
  if (settings.stripAnnotations) for (const page of output.getPages()) page.node.delete(name('Annots'));
}

export const DEFAULT_PROPERTIES = { title: '', author: '', subject: '', keywords: '', dates: true, stripAnnotations: false, bookmarks: true };
