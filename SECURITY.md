# Security policy

## Supported versions

Only the latest release and the current `main` receive fixes. There is no
maintenance branch.

## Reporting a vulnerability

Report privately, not through a public issue: open the repository's
[**Security** tab](https://github.com/kodetix-fr/oblitero/security/advisories/new)
and use *Report a vulnerability*. The report stays visible only to you and the
maintainers until a fix is published.

Useful in a report:

- what an attacker gains, and what they need to already have
- the affected file or code path
- the steps that demonstrate it, with the version of Oblitero (the one in
  `manifest.json`) and of Chrome

Expect an acknowledgement within a week. This is a small project maintained on
free time: there is no bounty, and fixes ship when they are ready. Please hold
public disclosure until a fix is out, or for 90 days, whichever comes first.

## Scope

Oblitero is a local extension. It has no server, no account and no telemetry,
it makes no network request, it asks for no permission, and it keeps nothing
once its tab is closed.

In scope, and worth reporting:

- a PDF that makes the extension run code, read something it was not given, or
  write outside the file the user downloads
- a redacted page whose covered content can still be recovered from the file
  that is downloaded
- a permission, a network access or remote code added by mistake
- the supply chain of the repository: development dependencies, the workflows,
  `vendor/` (pdf-lib, PDF.js and qpdf with its WebAssembly wrapper) and the
  packaging script

Out of scope: flaws in Chrome itself, or in pdf-lib, PDF.js or qpdf upstream
(report them to those projects, and tell us if Oblitero is affected, the bundled
version will be updated), access to the files by someone who already controls
the machine or the browser profile, the content of the PDFs you open and what
you do with the files you download, findings from a scanner with no
demonstrated impact, social engineering, and attacks that need a modified
extension to be installed.
