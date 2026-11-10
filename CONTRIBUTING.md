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

## Where things are

The root is flat and there is no bundler: the folder is the extension.

- `app.html`, `app.css` and `app.js` (the entry point) are the page; `sw.js` opens it from the toolbar icon.
- A `*-view.js` module touches the DOM: a dialog, or the grid. `pages-view.js` holds the state of the document and wires
  the others together.
- Logic without DOM goes in a module of its own with a `*.test.js` next to it: `pages-model.js` (pages, cuts, the states
  that undo goes back to), `export.js` (building the PDF), `stamps.js`, `marks.js`, `find.js`, `outline.js`, `zip.js`.
- `render.js` draws pages with PDF.js; `page-thumbs.js`, `page-card.js` and `page-output.js` are the thumbnails, the
  cards and the result.
- `locales/` has the texts of the interface, `_locales/` the name and the description for the store.
- `vendor/` is third-party code, copied as is and never edited by hand (`vendor/README.md`, `vendor/SHA256SUMS`).
- `scripts/` packages the extension and writes test files and store images; `test/e2e/` has the scenarios.

## How a change is checked

- Pure logic goes in a module without DOM, with a `*.test.js` next to it. A behaviour on the screen gets a scenario in
  `test/e2e/`. A claim about a PDF is proved by reading the output with PDF.js (text, metadata, pixels), not by
  searching its bytes: pdf-lib compresses them.
- Fake personal data and fake secrets in fixtures are built at run time, so that secret scanners stay quiet.
- The interface has nine languages. A new text goes into `locales/en.js` and every other file of `locales/`, in the
  same order; `npm test` checks it. Code and comments are in English.
- The CI (lint, types, unit and end-to-end tests, security scans) must pass before a merge.

## Release

1. Move the entries of `## [Unreleased]` in `CHANGELOG.md` under a new `## [x.y.z] - date` heading.
2. Set the version in `manifest.json` and `package.json`; `npm version x.y.z --no-git-tag-version` does the second and
   `package-lock.json`. `manifest.test.js` checks that the three agree.
3. Merge the pull request once CI is green.
4. Tag the merge commit with an annotated tag and push it:
   `git tag -a vX.Y.Z -m "Oblitero X.Y.Z" && git push origin vX.Y.Z`.

The tag runs `release.yml`: the checks, then the zip and its SHA-256 as a GitHub Release, with the changelog section as
its notes. It refuses a tag that is not annotated, that differs from the versions of `manifest.json` and `package.json`,
that has no changelog section, or whose commit has no green CI run.

## Security

Do not report a vulnerability in a public issue: see `SECURITY.md`.
