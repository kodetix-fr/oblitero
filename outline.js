import { PDFHexString, PDFName, PDFNumber } from './vendor/pdf-lib.esm.min.js';

// The bookmarks of the output: `trees[file]` is the outline of a file ({ title, page, items }, `page` being the index of a page
// of that file, or null) and `names[file]` its name. An entry points to the first output page made from its page; one whose
// page is not in the output is dropped, and its own entries move up. When the pages come from several files and one of them
// has an outline, each file gets an entry of its own, with its outline under it.
export function outlineFor(entries, trees, names) {
  const at = new Map();
  entries.forEach((entry, index) => {
    const key = `${entry.file}:${entry.source}`;
    if (entry.file !== null && !at.has(key)) at.set(key, index);
  });
  const keep = (file, items) =>
    items.flatMap((item) => {
      const page = at.get(`${file}:${item.page}`);
      const children = keep(file, item.items);
      return page === undefined ? children : [{ title: item.title, page, items: children }];
    });
  const files = [...new Set(entries.map((entry) => entry.file).filter((file) => file !== null))];
  const kept = files.map((file) => keep(file, trees[file] ?? []));
  if (files.length === 1 || kept.every((items) => items.length === 0)) return kept.flat();
  return files.map((file, i) => ({ title: names[file], page: entries.findIndex((entry) => entry.file === file), items: kept[i] }));
}

// Writes `tree` as the outline of `output`, its pages given by index. Every entry is open.
export function writeOutline(output, tree) {
  if (tree.length === 0) return;
  const { context } = output;
  const pages = output.getPages();
  const add = (items, parent) => {
    const refs = items.map(() => context.nextRef());
    let count = items.length;
    items.forEach((item, i) => {
      const dict = context.obj({ Title: PDFHexString.fromText(item.title), Parent: parent, Dest: [pages[item.page].ref, 'Fit'] });
      if (i > 0) dict.set(PDFName.of('Prev'), refs[i - 1]);
      if (i < refs.length - 1) dict.set(PDFName.of('Next'), refs[i + 1]);
      if (item.items.length) count += link(dict, add(item.items, refs[i]));
      context.assign(refs[i], dict);
    });
    return { first: refs[0], last: refs.at(-1), count };
  };
  const link = (dict, { first, last, count }) => {
    dict.set(PDFName.of('First'), first);
    dict.set(PDFName.of('Last'), last);
    dict.set(PDFName.of('Count'), PDFNumber.of(count));
    return count;
  };
  const root = context.nextRef();
  const outlines = context.obj({ Type: 'Outlines' });
  link(outlines, add(tree, root));
  context.assign(root, outlines);
  output.catalog.set(PDFName.of('Outlines'), root);
}
