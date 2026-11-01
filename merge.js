import { PDFDocument } from './vendor/pdf-lib.esm.min.js';

export async function countPages(bytes) {
  const document = await PDFDocument.load(bytes);
  return document.getPageCount();
}

export async function mergePdfs(sources) {
  if (sources.length < 2) throw new Error('Merging needs at least two PDF files.');
  const merged = await PDFDocument.create();
  for (const bytes of sources) {
    const source = await PDFDocument.load(bytes);
    for (const page of await merged.copyPages(source, source.getPageIndices())) merged.addPage(page);
  }
  return merged.save();
}

export function moveItem(list, from, to) {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = list.slice();
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}
