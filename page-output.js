import { buildPdf, fitPaper } from './export.js';
import { compressPdf, formatSize } from './compress.js';
import { recode } from './photo.js';
import { applyProperties } from './properties.js';
import { burnPage, outlineTree } from './render.js';
import { outlineFor, writeOutline } from './outline.js';
import { applyStamps } from './stamps.js';
import { t } from './i18n.js';

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
      report.push(t('batch.line-failed', { name, message: error.message }));
    }
  }
  return { files, report, failed: groups.length - files.length };
}

// Turns pages into PDF files, with what the document has set. `settings()` gives { stamps, properties, compression, paper,
// protection }; `protect(bytes, password, permissions)` encrypts a download.
export function createOutput(documents, settings, say, protect) {
  let saved = { before: 0, after: 0 };

  // `burned` keeps the pictures of the redacted pages from one build to the next, when they are many builds of the same pages.
  // `offset` is the number of pages of the parts before this one, for the Bates numbers.
  const build = async (entries, burned = new Map(), offset = 0) => {
    const redacted = entries.filter((entry) => entry.redactions.length > 0).length;
    let drawn = 0;
    const burn = (entry) => {
      const key = JSON.stringify([entry.file, entry.source, entry.rotation, entry.angle, entry.flip, entry.crop, entry.redactions]);
      if (!burned.has(key)) {
        say('status.redacting', { n: ++drawn, total: redacted });
        burned.set(key, burnPage(documents[entry.file].doc, entry));
      }
      return burned.get(key);
    };
    const { properties } = settings();
    // A bookmark can name what a rectangle hides, so a document with a redaction has none.
    const bookmarked = properties.bookmarks && redacted === 0;
    const trees = [];
    if (bookmarked) {
      for (const file of new Set(entries.map((entry) => entry.file).filter((file) => file !== null))) {
        documents[file].outline ??= outlineTree(documents[file].doc);
        trees[file] = await documents[file].outline;
      }
    }
    return buildPdf(documents.map((document) => document.bytes), entries, burn, async (output) => {
      const { stamps, paper } = settings();
      if (paper) await fitPaper(output, paper.size, paper.margin);
      if (bookmarked) writeOutline(output, outlineFor(entries, trees, documents.map((document) => document.name)));
      await applyStamps(output, stamps, null, offset);
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
