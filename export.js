import { PDFDocument, degrees } from './vendor/pdf-lib.esm.min.js';
import { drawMarks, newCache } from './marks.js';
import { dropUnreachable, isolatePages } from './page-links.js';

const parsed = new WeakMap();

// Copying pages does not change the document they come from, so that the parts of a file can share one parse.
function loadIsolated(bytes) {
  if (!parsed.has(bytes)) {
    parsed.set(
      bytes,
      PDFDocument.load(bytes).then((document) => {
        isolatePages(document);
        return document;
      }),
    );
  }
  return parsed.get(bytes);
}

// `sources` are the bytes of the files the pages come from (an entry names its file by index). A page with redactions is
// replaced by the picture burnPage returns, so nothing of its content survives; a blank page is an empty page. The output
// is a new document: the metadata, outline and attachments of the sources are not carried over. `finish(output)` runs on the
// finished document, before it is saved (page numbers, watermarks).
export async function buildPdf(sources, entries, burnPage, finish) {
  const load = (file) => loadIsolated(sources[file]);
  const output = await PDFDocument.create({ updateMetadata: false });
  output.setProducer('Oblitero');
  output.setCreator('Oblitero');
  output.setCreationDate(new Date());
  output.setModificationDate(new Date());

  const copied = (entry) => entry.file !== null && entry.redactions.length === 0;
  const key = (entry) => `${entry.file}:${entry.source}`;

  // The pages of one file are copied together, so that fonts and images they share are stored once. A page that is used
  // twice (a duplicate) is copied again, because one copy cannot carry two different rotations.
  const firsts = new Map();
  for (const entry of entries) {
    if (!copied(entry) || firsts.has(key(entry))) continue;
    firsts.set(key(entry), entry);
  }
  const copies = new Map();
  for (const file of new Set([...firsts.values()].map((entry) => entry.file))) {
    const wanted = [...firsts.values()].filter((entry) => entry.file === file);
    const pages = await output.copyPages(await load(file), wanted.map((entry) => entry.source));
    wanted.forEach((entry, i) => copies.set(key(entry), pages[i]));
  }

  const marked = newCache();
  for (const entry of entries) {
    if (entry.blank) {
      output.addPage([entry.blank.width, entry.blank.height]).setRotation(degrees(entry.rotation));
    } else if (entry.redactions.length > 0) {
      const { bytes, width, height } = await burnPage(entry);
      const image = await output.embedJpg(bytes);
      output.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height });
    } else {
      let page = copies.get(key(entry));
      if (page) copies.delete(key(entry));
      else [page] = await output.copyPages(await load(entry.file), [entry.source]);
      page.setRotation(degrees((page.getRotation().angle + entry.rotation) % 360));
      output.addPage(page);
    }
    await drawMarks(output, output.getPages().at(-1), entry.marks, marked);
  }
  await finish?.(output);
  await dropUnreachable(output);
  return output.save();
}
