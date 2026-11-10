import { buildPdf, fitPaper } from './export.js';
import { compressPdf, formatSize } from './compress.js';
import { recode } from './photo.js';
import { applyProperties } from './properties.js';
import { burnPage, outlineTree } from './render.js';
import { outlineFor, writeOutline } from './outline.js';
import { applyStamps } from './stamps.js';
import { failureText, t } from './i18n.js';

// Makes one result for each group of pages ({ name, entries }), one after the other so that a single result is in memory at a
// time; a group that fails is reported and the others still come out. Resolves with the files and one line of report per group.
export async function eachFile(groups, make) {
  const files = [];
  const report = [];
  for (const { name, entries } of groups) {
    try {
      files.push({ name, blob: await make(entries) });
      report.push(t('batch.line-done', { name }));
    } catch (error) {
      report.push(t('batch.line-failed', { name, message: failureText(error) }));
    }
  }
  return { files, report, failed: groups.length - files.length };
}

const imageIds = new WeakMap();
let imageCount = 0;
const imageId = (png) => {
  if (!imageIds.has(png)) imageIds.set(png, ++imageCount);
  return imageIds.get(png);
};

// What a burned picture depends on. The marks count only when a crop that removes what is outside draws them into it, and a
// picture of a mark is named by identity, not by its bytes.
export const burnKey = (entry) =>
  JSON.stringify([entry.file, entry.source, entry.rotation, entry.angle, entry.flip, entry.crop, entry.redactions, entry.crop?.remove ? entry.marks : null], (_, value) =>
    value instanceof Uint8Array ? imageId(value) : value,
  );

// The outline of a file, read once; a read that fails is made again by the next export.
export function outlineOf(document, read = outlineTree) {
  document.outline ??= read(document.doc).catch((error) => {
    document.outline = null;
    throw error;
  });
  return document.outline;
}

// Turns pages into PDF files, with what the document has set. `settings()` gives { stamps, properties, compression, paper,
// protection }; `protect(bytes, password, permissions)` encrypts a download.
export function createOutput(documents, settings, say, protect) {
  let saved = { before: 0, after: 0 };

  // `burned` keeps the pictures of the redacted pages from one build to the next, when they are many builds of the same pages.
  // `offset` is the number of pages of the parts before this one, for the Bates numbers. `preview` ({ stamps, place }) stamps one
  // page with settings that are not applied yet, as the page `index` of `total` of `place`.
  const build = async (entries, burned = new Map(), offset = 0, /** @type {{ stamps: any, place: { index: number, total: number } } | null} */ preview = null) => {
    const redacted = entries.filter((entry) => entry.redactions.length > 0).length;
    let drawn = 0;
    const burn = (entry) => {
      const key = burnKey(entry);
      if (!burned.has(key)) {
        if (!preview) say('status.redacting', { n: ++drawn, total: redacted });
        burned.set(key, burnPage(documents[entry.file].doc, entry));
      }
      return burned.get(key);
    };
    const { properties } = settings();
    // A bookmark can name what a rectangle hides, so a document with a redaction has none.
    const bookmarked = properties.bookmarks && redacted === 0 && !preview;
    /** @type {any[]} */
    const trees = [];
    if (bookmarked) {
      for (const file of new Set(entries.map((entry) => entry.file).filter((file) => file !== null))) {
        trees[file] = await outlineOf(documents[file]);
      }
    }
    return buildPdf(documents.map((document) => document.bytes), entries, burn, async (output) => {
      const { stamps, paper } = settings();
      if (paper) await fitPaper(output, paper.size, paper.margin);
      if (bookmarked) writeOutline(output, outlineFor(entries, trees, documents.map((document) => document.name)));
      await applyStamps(output, preview?.stamps ?? stamps, preview?.place ?? null, offset);
      applyProperties(output, properties);
    });
  };

  const squeeze = (bytes) => compressPdf(bytes, settings().compression, recode, (done, total) => total && say('status.compressing', { n: done + 1, total }));

  return {
    build,
    squeeze,
    // A preview is shown here, so it is not encrypted.
    async asPdf(entries, { offset = 0, preview = false } = {}) {
      const bytes = await build(entries, new Map(), offset);
      let result = bytes;
      if (settings().compression !== 'none') {
        const smaller = await squeeze(bytes);
        if (smaller.length < bytes.length) result = smaller;
      }
      saved.before += bytes.length;
      saved.after += result.length;
      const { protection } = settings();
      if (protection && !preview) result = await protect(result, protection.password, protection);
      return new Blob([result], { type: 'application/pdf' });
    },
    savedText() {
      if (settings().compression === 'none' || saved.after >= saved.before) return '';
      const { before, after } = saved;
      return () => t('status.compressed', { before: formatSize(before), after: formatSize(after) });
    },
    resetSaved() {
      saved = { before: 0, after: 0 };
    },
  };
}
