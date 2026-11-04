# Contributing to Oblitero

Issues and pull requests are welcome. For anything bigger than a fix, open an issue first: Oblitero stays small,
and a tool has to work with no server, no account and no permission.

## What will not be accepted

A permission, a network request, remote code, telemetry, an account, a usage limit, a watermark on the result, a
runtime dependency from npm (third-party code is copied into `vendor/`, see `vendor/README.md`).

## Run it

Node 22.13 or later.

```
npm ci
npm run check        # lint, types, unit tests
npx playwright-core install chromium
npm run test:e2e     # the extension in Chromium, built from the files of the package
npm run package      # dist/oblitero-<version>.zip and its SHA-256
```

Load the folder as an unpacked extension from `chrome://extensions`, then click the Oblitero icon.
`node scripts/make-test-files.mjs <folder>` writes files to try every tool by hand.

## How a change is checked

- Pure logic goes in a module without DOM, with a `*.test.js` next to it. A behaviour on the screen gets a scenario in
  `test/e2e/`. A claim about a PDF is proved by reading the output with PDF.js (text, metadata, pixels), not by
  searching its bytes: pdf-lib compresses them.
- Fake personal data and fake secrets in fixtures are built at run time, so that secret scanners stay quiet.
- The interface has nine languages. A new text goes into `locales/en.js` and every other file of `locales/`, in the
  same order; `npm test` checks it. Code and comments are in English.
- The CI (lint, types, unit and end-to-end tests, security scans) must pass before a merge.

## Security

Do not report a vulnerability in a public issue: see `SECURITY.md`.
