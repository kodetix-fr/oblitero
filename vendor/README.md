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
