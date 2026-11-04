## What this changes

<!-- The behaviour before and after. Link the issue if there is one. If it is not covered by a test, what you tried by hand in Chrome (version, scenario). -->

## Why

<!-- The constraint or failure behind the change. -->

## Checklist

- [ ] `npm run check` passes (lint, typecheck, unit tests)
- [ ] `npm run test:e2e` passes, if the change touches the screen or what is downloaded
- [ ] The logic added or changed has its tests; a new behaviour has its end-to-end scenario, or the description above says what was tried by hand
- [ ] No permission added to the manifest (or it was discussed in an issue, and `docs/store-listing.md` and `docs/PRIVACY.md` are up to date)
- [ ] No remote code, no network request, no `innerHTML`, no runtime dependency (or the written reason is above)
- [ ] `CHANGELOG.md` is up to date (the Unreleased section)
- [ ] No real document, personal data or credential added to the repository; fake ones are built at run time
