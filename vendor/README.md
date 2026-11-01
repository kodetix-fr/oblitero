# vendor/

Third-party code copied as is, with no build step (the folder is the extension). No remote code is ever loaded.

## pdf-lib.esm.min.js

| | |
|---|---|
| Project | [pdf-lib](https://github.com/Hopding/pdf-lib) |
| Version | **1.17.1** |
| Licence | MIT, full text in `pdf-lib.LICENSE` |
| Source | `npm pack pdf-lib@1.17.1`, file `package/dist/pdf-lib.esm.min.js` (self-contained ESM: no `import`, `eval` or `new Function`) |
| npm package integrity | `sha512-V/mpyJAoTsN4cnP31vc0wfNA1+p20evqqnap0KLoRUN0Yk/p3wN52DOEsL4oBFcLdb76hlpKPtzJIgo67j/XLw==` |
| sha256 of the `pdf-lib-1.17.1.tgz` package | `a7cc1eaf12e41e612a7be581162a63b18118aefc01e90f6a1f35347b1f324a1c` |
| sha256 of `pdf-lib.esm.min.js` | `72c052d97b4d5d9fa6cdbdcb7ad709f03d4ddb1122390cb3afeba4d88651d969` |

### Verify

```
npm pack pdf-lib@1.17.1 && tar -xzf pdf-lib-1.17.1.tgz
shasum -a 256 package/dist/pdf-lib.esm.min.js vendor/pdf-lib.esm.min.js   # both hashes must be identical
```

## pdfjs/

| | |
|---|---|
| Project | [PDF.js](https://github.com/mozilla/pdf.js) |
| Version | **6.5.438** (npm package `pdfjs-dist`) |
| Licence | Apache-2.0, full text in `pdfjs/LICENSE`; the licences of the decoders are next to them in `pdfjs/wasm/` and `pdfjs/iccs/` and `pdfjs/standard_fonts/` |
| Source | `npm pack pdfjs-dist@6.5.438` |
| npm package integrity | `sha512-vg8Pw1x+AFKy4AMDvhuWl5cOYV8d698UoEANoFFhc79hqXDnZQqnOXoxw3HG907WHOg1JYOvLhP756boddFxpA==` |
| sha256 of the `pdfjs-dist-6.5.438.tgz` package | `7461aefcd27c4ef0dd76f9ca5760f09466eb6b3f934432670c12132e7b3d6faa` |
| `pdfjs/pdf.min.mjs` | `legacy/build/pdf.min.mjs` of the package, sha256 `522ad2c83bc8a0010e7f0cc60d0892b77c8d2bf2c9702dc12288311d94270f42` |
| `pdfjs/pdf.worker.min.mjs` | `legacy/build/pdf.worker.min.mjs` of the package, sha256 `b4c8353ded0d88d2e2009574a29eb4e0c3ff7e942ecdf51ef5f71566a9667f31` |
| Other folders | `cmaps/`, `standard_fonts/`, `iccs/` and `wasm/` (`jbig2.wasm`, `openjpeg.wasm`, `qcms_bg.wasm` only) copied from the package, unmodified |

The files are not modified. The legacy build is the one shipped, not the modern one: the modern build calls `Map.prototype.getOrInsertComputed`, which many Chrome versions do not have, and the page then fails to render a second time. The legacy build polyfills it.

The runtime options are in `render.js`: `isEvalSupported: false` (the Content Security Policy forbids `eval`) and the URLs of the folders above, all inside the extension.

### Verify

```
npm pack pdfjs-dist@6.5.438 && tar -xzf pdfjs-dist-6.5.438.tgz
shasum -a 256 package/legacy/build/pdf.min.mjs vendor/pdfjs/pdf.min.mjs                 # identical
shasum -a 256 package/legacy/build/pdf.worker.min.mjs vendor/pdfjs/pdf.worker.min.mjs   # identical
```
