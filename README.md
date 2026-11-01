# Oblitero

A Chrome extension (Manifest V3) to merge, split, sign and redact PDF files.
100% local, no account, no permission, free and open source.

Status: under construction, private until the first release.

## What works

- Merge: add PDF files, reorder them, download one PDF.
- Pages: open one PDF, see every page, select, rotate, delete and reorder
  pages, download the result, download only the selected pages, or split the
  document into a ZIP of parts of N pages.
- Redact: draw rectangles on a page. In the downloaded PDF that page becomes a
  picture with the rectangles painted black, so the text, the vectors and the
  links under them no longer exist. The other pages are copied untouched. The
  output is a new document: the title, author and other metadata of the source
  are not carried over.

## Limits

- A redacted page is no longer searchable or selectable as a whole, and its
  links are gone.
- Rectangles are drawn with the pointer; there is no keyboard way to place
  them yet.
- Encrypted PDF files are refused.
- Only tested with the Chromium that ships with Playwright 1.57.

## Planned

Sign and fill, find text and redact it, a keyboard way to place rectangles.

## Privacy

The extension asks for no permission. Its Content Security Policy only lets a
page load files from the extension itself (`connect-src 'self'`), so no request
can leave for another origin. The files you open stay in the page that reads
them.

## Development

```
npm ci
npm run check        # lint, types, unit tests
npm run test:e2e     # the extension in Chromium (needs: npx playwright-core install chromium)
```

Load the folder as an unpacked extension from `chrome://extensions`, then click
the Oblitero icon. Third-party code is in `vendor/`, copied as is.

## Licence

MIT, see `LICENSE`.
