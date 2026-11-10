# vendor/

Third-party code copied as is, with no build step (the folder is the extension). No remote code is ever loaded.

`SHA256SUMS` holds the sha256 of every file of this folder, the folders included. `vendor.test.js` recomputes them, so a vendored file that changes fails the unit tests, and `.gitattributes` keeps git from converting their line endings. After a deliberate update, write the list again and commit it with the new files:

```
(cd vendor && find . -type f ! -name README.md ! -name SHA256SUMS | sed 's|^\./||' | LC_ALL=C sort | xargs shasum -a 256 > SHA256SUMS)
```

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

## qpdf/

| | |
|---|---|
| Project | [qpdf](https://github.com/qpdf/qpdf) 12.2.0, compiled to WebAssembly by [qpdf-wasm](https://github.com/neslinesli93/qpdf-wasm) |
| Version | **0.3.1** (npm package `@neslinesli93/qpdf-wasm`), built and published by the GitHub workflow of the project, with a build provenance attestation |
| Licences | qpdf: Apache-2.0, `qpdf/LICENSE_QPDF` and `qpdf/NOTICE_QPDF.txt`; the wrapper: ISC, `qpdf/LICENSE_QPDF_WASM`; zlib: `qpdf/LICENSE_ZLIB` (from `zlib.h`); libjpeg-turbo: `qpdf/LICENSE_JPEG_TURBO.txt`. Taken from the commits the build pins: qpdf `856d32c6`, zlib `21767c65`, jpeg-turbo `7aa2a898` |
| Source | `npm pack @neslinesli93/qpdf-wasm@0.3.1`, files `package/dist/qpdf.js` and `package/dist/qpdf.wasm` (no `eval` and no `new Function`) |
| npm package integrity | `sha512-pN6wK7JSq66dtmFpncxPAvuOrILm+sdrm1SI8ZKMCl3TSKKHQeCXoes4p8gXNez8dpEhZ0st+qeN4tLbeCm3kw==` |
| sha256 of the `qpdf-wasm-0.3.1.tgz` package | `bdb7c4a6b55a096771c738c2410387a8cd55dccbcaa0cd4762337c88896e8728` |
| sha256 of `qpdf.js` | `c0e8fe62e0c3385dd8cb5d6b613f74d87a4138a3a3343e2add45a067a14d0884` |
| sha256 of `qpdf.wasm` | `69a17eecb26ef73e6b853487500802b18523c7b453382de0063bb2d387edb6bd` |

`qpdf.js` is a classic script, not a module: `qpdf-run.js` adds it to the page the first time it is needed, and it fetches `qpdf.wasm` from the extension. It opens a password-protected PDF, repairs a damaged one and protects the result with a password.

### Verify

```
npm pack @neslinesli93/qpdf-wasm@0.3.1 && tar -xzf neslinesli93-qpdf-wasm-0.3.1.tgz
shasum -a 256 package/dist/qpdf.js vendor/qpdf/qpdf.js       # identical
shasum -a 256 package/dist/qpdf.wasm vendor/qpdf/qpdf.wasm   # identical
gh attestation verify vendor/qpdf/qpdf.wasm --repo neslinesli93/qpdf-wasm   # signed by the workflow of the project
gh attestation verify vendor/qpdf/qpdf.js --repo neslinesli93/qpdf-wasm
```
