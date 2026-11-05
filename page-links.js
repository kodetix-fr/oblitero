import { PDFArray, PDFDict, PDFName, PDFRawStream, PDFRef, PDFStream, decodePDFRawStream } from './vendor/pdf-lib.esm.min.js';

const name = (value) => PDFName.of(value);
const TREE_TYPES = new Set(['/Page', '/Pages', '/Catalog']);
const PAGE_KEYS = new Set(['/Type', '/Parent', '/Resources', '/MediaBox', '/CropBox', '/BleedBox', '/TrimBox', '/ArtBox', '/Rotate', '/Contents', '/Annots', '/Group', '/UserUnit']);
const ANNOTATION_TYPES = new Set(['/Link', '/Text', '/FreeText', '/Line', '/Square', '/Circle', '/Polygon', '/PolyLine', '/Highlight', '/Underline', '/Squiggly', '/StrikeOut', '/Stamp', '/Caret', '/Ink', '/Widget']);
const ANNOTATION_KEYS = new Set(['/Type', '/Subtype', '/Rect', '/AP', '/AS', '/F', '/BS', '/Border', '/BE', '/C', '/IC', '/CA', '/Contents', '/NM', '/M', '/T', '/Subj', '/QuadPoints', '/L', '/LE', '/LL', '/LLE', '/LLO', '/Vertices', '/InkList', '/RD', '/DA', '/DS', '/RC', '/Q', '/MK', '/FT', '/V', '/Ff', '/Name', '/IT', '/CL', '/CP', '/Cap', '/A']);
const NAME_IN_CONTENT = /\/([^\s/<>[\]()%{}]*)/g;

const walkable = (value) => (value instanceof PDFStream ? value.dict : value);

// `forbidden` holds the content streams of the pages: an appearance can point at one without passing through its page.
function reachesPageTree(context, start, clean, forbidden) {
  const seen = new Set();
  const pending = [start];
  while (pending.length) {
    let value = pending.pop();
    if (value instanceof PDFRef) {
      if (forbidden.has(value)) return true;
      if (seen.has(value) || clean.has(value)) continue;
      seen.add(value);
      value = context.lookup(value);
    }
    value = walkable(value);
    if (value instanceof PDFDict) {
      if (TREE_TYPES.has(String(value.lookup(name('Type')))) || value.has(name('MediaBox')) || value.has(name('Kids'))) return true;
      pending.push(...value.values());
    } else if (value instanceof PDFArray) {
      pending.push(...value.asArray());
    }
  }
  for (const ref of seen) clean.add(ref);
  return false;
}

const decodedName = (raw) => raw.replace(/#([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

function contentNames(stream) {
  const bytes = stream instanceof PDFRawStream ? decodePDFRawStream(stream).decode() : stream.getContents();
  return Array.from(new TextDecoder('latin1').decode(bytes).matchAll(NAME_IN_CONTENT), (match) => decodedName(match[1]));
}

function contentStreams(context, page) {
  const contents = page.lookup(name('Contents'));
  const list = contents instanceof PDFArray ? contents.asArray().map((item) => context.lookup(item)) : [contents];
  return list.filter((item) => item instanceof PDFStream);
}

function contentRefs(page) {
  const contents = page.get(name('Contents'));
  const array = page.lookup(name('Contents'));
  if (array instanceof PDFArray) return array.asArray().filter((item) => item instanceof PDFRef);
  return contents instanceof PDFRef ? [contents] : [];
}

function inheritedResources(page) {
  let node = page;
  for (let depth = 0; node && depth < 64; depth++) {
    const resources = node.lookupMaybe(name('Resources'), PDFDict);
    if (resources) return resources;
    node = node.lookupMaybe(name('Parent'), PDFDict);
  }
  return null;
}

// The names the content uses, with those used by a form that has no resources of its own and reads those of its page.
function usedNames(context, streams, resources) {
  const names = new Set();
  const forms = resources.lookupMaybe(name('XObject'), PDFDict);
  const pending = [...streams];
  while (pending.length) {
    for (const used of contentNames(pending.pop())) {
      if (names.has(used)) continue;
      names.add(used);
      const form = forms?.lookup(name(used));
      if (form instanceof PDFStream && String(form.dict.lookup(name('Subtype'))) === '/Form' && !form.dict.has(name('Resources'))) pending.push(form);
    }
  }
  return names;
}

// One dictionary of resources is often shared by all the pages of a file: what a page keeps is only what it draws, so that the
// pictures of the other pages do not come along with it. The dictionaries of what it keeps are reduced in the same way.
function createPruner(context, keeps) {
  const done = new Set();

  function pruneWithin(start) {
    const pending = [start];
    while (pending.length) {
      let value = pending.pop();
      if (value instanceof PDFRef) {
        if (done.has(value)) continue;
        done.add(value);
        value = context.lookup(value);
      }
      if (value instanceof PDFStream) {
        if (done.has(value)) continue;
        done.add(value);
        const own = value.dict.lookupMaybe(name('Resources'), PDFDict);
        if (own) value.dict.set(name('Resources'), prune(own, [value]));
        value = value.dict;
      }
      if (value instanceof PDFDict) {
        for (const [key, item] of value.entries()) if (key !== name('Parent') && key !== name('Resources')) pending.push(item);
      } else if (value instanceof PDFArray) {
        pending.push(...value.asArray());
      }
    }
  }

  function prune(resources, streams) {
    const names = usedNames(context, streams, resources);
    const result = context.obj({});
    for (const [kind, value] of resources.entries()) {
      const category = context.lookup(value);
      if (!(category instanceof PDFDict)) {
        if (kind === name('ProcSet')) result.set(kind, value);
        continue;
      }
      const kept = context.obj({});
      for (const [key, entry] of category.entries()) {
        const entryName = key.decodeText();
        if (!names.has(entryName) && !(kind === name('ColorSpace') && entryName.startsWith('Default'))) continue;
        pruneWithin(entry);
        if (keeps(entry)) kept.set(key, entry);
      }
      result.set(kind, kept);
    }
    return result;
  }

  return { prune, pruneWithin };
}

// Keeps of an annotation what draws it and what it says, and nothing that leads elsewhere. A widget keeps its appearance: its
// field, and through it the values of the other fields of the form, stay behind. Returns false when nothing useful is left.
function reduceAnnotation(context, annotation) {
  const subtype = String(annotation.lookup(name('Subtype')));
  if (!ANNOTATION_TYPES.has(subtype)) return false;
  const action = annotation.lookupMaybe(name('A'), PDFDict);
  const web = String(action?.lookup(name('S'))) === '/URI';
  if (subtype === '/Widget') {
    let node = annotation;
    for (let depth = 0; node && depth < 32 && !annotation.has(name('FT')); depth++) {
      const type = node.get(name('FT'));
      if (type) annotation.set(name('FT'), type);
      node = node.lookupMaybe(name('Parent'), PDFDict);
    }
  }
  for (const key of annotation.keys()) if (!ANNOTATION_KEYS.has(String(key))) annotation.delete(key);
  if (web) annotation.set(name('A'), context.obj({ S: 'URI', URI: action.get(name('URI')) }));
  else annotation.delete(name('A'));
  return subtype !== '/Link' || web;
}

// pdf-lib copies everything a page refers to, and saves every object it copied, even one no page shows: a link to another page
// would bring that whole page into the output, redacted or hidden. So a page keeps only what draws it, and refers to no other page.
// Links inside the document are lost with it: a link to a copied page would lead to a second, invisible copy anyway.
export function isolatePages(document) {
  const { context } = document;
  const clean = new Set();
  const pages = document.getPages().map((page) => page.node);
  const forbidden = new Set(pages.flatMap(contentRefs));
  const keeps = (value) => !reachesPageTree(context, value, clean, forbidden);
  const { prune, pruneWithin } = createPruner(context, keeps);

  for (const page of pages) {
    const resources = inheritedResources(page);
    for (const key of page.keys()) if (!PAGE_KEYS.has(String(key))) page.delete(key);
    page.set(name('Resources'), resources ? prune(resources, contentStreams(context, page)) : context.obj({}));
    const group = page.get(name('Group'));
    if (group && !keeps(group)) page.delete(name('Group'));
    const annotations = page.Annots();
    for (let i = (annotations?.size() ?? 0) - 1; i >= 0; i--) {
      const annotation = annotations.lookupMaybe(i, PDFDict);
      if (!annotation || !reduceAnnotation(context, annotation)) annotations.remove(i);
    }
    for (let i = (annotations?.size() ?? 0) - 1; i >= 0; i--) {
      pruneWithin(annotations.lookup(i, PDFDict).get(name('AP')));
      if (!keeps(annotations.get(i))) annotations.remove(i);
    }
  }
}

// Whatever was left behind on the way (the notes of a page whose annotations were stripped) does not go into the file.
export async function dropUnreachable(document) {
  await document.flush();
  const { context } = document;
  const reached = new Set();
  const pending = [context.trailerInfo.Root, context.trailerInfo.Info].filter(Boolean);
  while (pending.length) {
    let value = pending.pop();
    if (value instanceof PDFRef) {
      if (reached.has(value)) continue;
      reached.add(value);
      value = context.lookup(value);
    }
    value = walkable(value);
    if (value instanceof PDFDict) pending.push(...value.values());
    else if (value instanceof PDFArray) pending.push(...value.asArray());
  }
  for (const [ref] of context.enumerateIndirectObjects()) if (!reached.has(ref)) context.delete(ref);
}
