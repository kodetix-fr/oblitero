# Third-party notices

Oblitero is released under the MIT licence (see `LICENSE`). The extension package bundles two third-party components, copied as is into `vendor/`. No other code is shipped: the development tools (`devDependencies`) are not part of the package.

## pdf-lib

| | |
|---|---|
| Project | [pdf-lib](https://github.com/Hopding/pdf-lib) |
| Version | 1.17.1 |
| Shipped file | `vendor/pdf-lib.esm.min.js` (`dist/pdf-lib.esm.min.js` of the npm package, unmodified) |
| Licence | MIT, full text in `vendor/pdf-lib.LICENSE` |
| Use | reading, merging and writing PDF files |

## PDF.js

| | |
|---|---|
| Project | [PDF.js](https://github.com/mozilla/pdf.js) |
| Version | 6.5.438 |
| Shipped files | `vendor/pdfjs/` (legacy build, character maps, standard fonts, ICC profile and three WebAssembly decoders of the npm package `pdfjs-dist`, unmodified) |
| Licence | Apache-2.0, full text in `vendor/pdfjs/LICENSE`; the decoders and fonts carry their own licences in the same folders |
| Use | rendering the pages: thumbnails, the redaction editor, and the picture that replaces a redacted page |

The checksums of the npm packages and of the shipped files, and the way to verify them, are in `vendor/README.md`.
