# Third-party notices

Oblitero is released under the MIT licence (see `LICENSE`). The extension package bundles three third-party components, copied as is into `vendor/`. No other code is shipped: the development tools (`devDependencies`) are not part of the package.

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
| Licence | Apache-2.0, full text in `vendor/pdfjs/LICENSE` |
| Use | rendering the pages: thumbnails, the redaction editor, and the picture that replaces a redacted page |

The decoders and the fonts of `vendor/pdfjs/` carry their own licences, in the folder of each:

| Component | Folder | Licence |
|---|---|---|
| OpenJPEG (JPEG 2000) | `wasm/` | BSD 2-Clause, `LICENSE_OPENJPEG` and `LICENSE_PDFJS_OPENJPEG` |
| JBIG2 | `wasm/` | BSD 3-Clause (PDFium authors), `LICENSE_JBIG2` and `LICENSE_PDFJS_JBIG2` |
| qcms (colour profiles) | `wasm/` | MIT, `LICENSE_QCMS` and `LICENSE_PDFJS_QCMS` |
| Foxit standard fonts (`Foxit*.pfb`) | `standard_fonts/` | BSD 3-Clause (PDFium authors), `LICENSE_FOXIT` |
| Liberation Sans (`LiberationSans-*.ttf`) | `standard_fonts/` | GNU GPL v2 with the Liberation font exception, `LICENSE_LIBERATION` |

## qpdf

| | |
|---|---|
| Project | [qpdf](https://github.com/qpdf/qpdf) 12.2.0, compiled to WebAssembly by [qpdf-wasm](https://github.com/neslinesli93/qpdf-wasm) |
| Version | 0.3.1 (npm package `@neslinesli93/qpdf-wasm`) |
| Shipped files | `vendor/qpdf/qpdf.js` and `vendor/qpdf/qpdf.wasm` (`dist/` of the npm package, unmodified) |
| Licence | qpdf: Apache-2.0, `vendor/qpdf/LICENSE_QPDF` and `vendor/qpdf/NOTICE_QPDF.txt`; the JavaScript wrapper: ISC, `vendor/qpdf/LICENSE_QPDF_WASM` |
| Libraries linked in `qpdf.wasm` | zlib (`vendor/qpdf/LICENSE_ZLIB`) and libjpeg-turbo (`vendor/qpdf/LICENSE_JPEG_TURBO.txt`) |
| Use | opening a password-protected PDF, repairing a damaged one, and protecting a download with a password |

The checksums of the npm packages and of the shipped files, and the way to verify them, are in `vendor/README.md`.
