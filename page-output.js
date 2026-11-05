import { buildPdf } from './export.js';
import { compressPdf, formatSize } from './compress.js';
import { recode } from './photo.js';
import { applyProperties } from './properties.js';
import { burnPage } from './render.js';
import { applyStamps } from './stamps.js';
import { t } from './i18n.js';

// Turns pages into PDF files, with what the document has set. `settings()` gives { stamps, properties, compression }.
export function createOutput(documents, settings, say) {
  let saved = { before: 0, after: 0 };

  // `burned` keeps the pictures of the redacted pages from one build to the next, when they are many builds of the same pages.
  const build = async (entries, burned = new Map()) => {
    const redacted = entries.filter((entry) => entry.redactions.length > 0).length;
    let drawn = 0;
    const burn = (entry) => {
      const key = JSON.stringify([entry.file, entry.source, entry.rotation, entry.redactions]);
      if (!burned.has(key)) {
        say('status.redacting', { n: ++drawn, total: redacted });
        burned.set(key, burnPage(documents[entry.file].doc, entry));
      }
      return burned.get(key);
    };
    return buildPdf(documents.map((document) => document.bytes), entries, burn, async (output) => {
      const { stamps, properties } = settings();
      await applyStamps(output, stamps);
      applyProperties(output, properties);
    });
  };

  const squeeze = (bytes) => compressPdf(bytes, settings().compression, recode, (done, total) => total && say('status.compressing', { n: done + 1, total }));

  return {
    build,
    squeeze,
    async asPdf(entries) {
      const bytes = await build(entries);
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
