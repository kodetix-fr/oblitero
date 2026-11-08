# Changelog

Notable changes to Oblitero. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows
[semantic versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Draw** rectangles, arrows and highlights on a page, written into its content.
- **Open password-protected PDFs** (RC4 and AES, by qpdf compiled to WebAssembly), **protect the result** with a password (AES-256) and **repair damaged files** from the pages that can still be read.
- **Reverse** the order of the selected pages, and **interleave** them one file at a time (the fronts and backs of a scan).
- **One PDF per file**: the same changes and settings on many files, in a ZIP with a report.
- **Drag with a finger or a pen**: a long press starts the drag of a page or a file row.
- **Crop** the selected pages, keeping or destroying what is outside, and put the result on **A4 or Letter** with a margin; links and comments move with the content.
- **Turn by any angle** and **mirror** the selected pages.
- **Bates numbers** that go on across the parts, and **stamps** (a framed text or an image) at a position.
- **Letterhead**: the first page of a PDF under or over every page, or a range, with an opacity.
- **Flatten** the form fields and comments into the pages, an option of Properties.
- **Bookmarks** of the files are kept in the result, under the name of each file when there are several (never with a redaction).

## [0.1.0] - 2026-11-06

First release. One screen, in nine languages, with no account, no permission and no network request.

### Added

- **Files and pages**: PDF files and photos dropped together, a Files view and a Pages view over the same document;
  select, rotate, hide, reorder, insert, duplicate, add a blank page; undo and redo; everything from the keyboard.
- **Cut**: scissors between pages, cut every N pages, at the chapters, after blank pages or under a size, a ZIP of the parts.
- **Large view** of a page, by double click or V, and a size slider for the thumbnails.
- **Preview** of the result, and a before and after for the compression.
- **Redact**: rectangles drawn or placed with the keyboard, find and redact (e-mail, IBAN, card, phone, words). A
  redacted page becomes a picture, and the output is a new document without the metadata of the source. Links inside a
  document are removed from the result, so that none can carry a redacted or hidden page along.
- **Sign and add text**, **fill a form**, **numbers, header, footer and watermark** (text or image).
- **Photos to PDF** and **pages to images**, **extract text** in reading order, **hide blank pages**.
- **Compression** in three levels and a report of the **properties** a file carries.
