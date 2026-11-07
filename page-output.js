import { buildPdf } from './export.js';
import { compressPdf, formatSize } from './compress.js';
import { recode } from './photo.js';
import { applyProperties } from './properties.js';
import { burnPage, outlineTree } from './render.js';
import { outlineFor, writeOutline } from './outline.js';
import { applyStamps } from './stamps.js';
import { t } from './i18n.js';

// Turns pages into PDF files, with what the document has set. `settings()` gives { stamps, properties, compression }.
export function createOutput(documents, settings, say) {
  let saved = { before: 0, after: 0 };

  // `burned` keeps the pictures of the redacted pages from one build to the next, when they are many builds of the same pages.
  // `offset` is the number of pages of the parts before this one, for the Bates numbers.
  const build = async (entries, burned = new Map(), offset = 0) => {
    const redacted = entries.filter((entry) => entry.redactions.length > 0).length;
    let drawn = 0;
    const burn = (entry) => {
      const key = JSON.stringify([entry.file, entry.source, entry.rotation, entry.angle, entry.flip, entry.redactions]);
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
      const { stamps } = settings();
      if (bookmarked) writeOutline(output, outlineFor(entries, trees, documents.map((document) => document.name)));
      await applyStamps(output, stamps, null, offset);
      applyProperties(output, properties);
    });
  };

  const squeeze = (bytes) => compressPdf(bytes, settings().compression, recode, (done, total) => total && say('status.compressing', { n: done + 1, total }));

  return {
    build,
    squeeze,
    async asPdf(entries, offset = 0) {
      const bytes = await build(entries, new Map(), offset);
      let result = bytes;
      if (settings().compression !== 'none') {
        const smaller = await squeeze(bytes);
        if (smaller.length < bytes.length) result = smaller;
      }
      saved.before += bytes.length;
      saved.after += result.length;
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
