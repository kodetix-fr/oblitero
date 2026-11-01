# Oblitero

A Chrome extension (Manifest V3) to merge, split, sign and redact PDF files.
100% local, no account, no permission, free and open source.

Status: under construction, private until the first release.

## What works

- Merge: add PDF files, reorder them, download one PDF.

## Planned

Split, extract and rotate pages, sign and fill, and redaction that removes the
hidden content instead of drawing a box over it.

## Privacy

The extension asks for no permission and its Content Security Policy forbids
every network request (`connect-src 'none'`). The files you open stay in the
page that reads them.

## Development

```
npm ci
npm run check        # lint, types, unit tests
```

Load the folder as an unpacked extension from `chrome://extensions`, then click
the Oblitero icon. Third-party code is in `vendor/`, copied as is.

## Licence

MIT, see `LICENSE`.
