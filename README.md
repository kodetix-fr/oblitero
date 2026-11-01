# Oblitero

A Chrome extension (Manifest V3) for PDF files: merge, organize, cut, hide pages,
redact, compress, number and watermark, turn images into a PDF and pages into
images. 100% local, no account, no permission, free and open source.

Status: under construction, private until the first release.

## What works

- **Merge**: drop PDF files on the page or choose them, drag the cards, or the
  groups of the preview (or use the arrows), to reorder, see a preview of the
  result (first and last page of each file, its page range, a dashed line where
  files join), and download one PDF.
- **Pages**: open one PDF and see every page. Click selects, Shift+click selects
  a range, a rectangle dragged on the background selects what it touches, and a
  field takes a list such as `1-3, 7, 10-` (Odd and Even are one click). Rotate,
  hide, drag to reorder (the whole selection travels with the page you grab,
  and a drop lands next to the nearest page, gaps and the end included). Every
  change can be undone and redone. A hidden page stays in the grid, dimmed, and
  is left out of every download; Show brings it back. Download the result or
  only the selected pages. The thumbnails have a size slider.
- **Several files in one document**: Insert PDF puts the pages of another file
  after the selection, and a PDF dropped on the grid lands next to the nearest
  page. Add a blank page (the size of the page before it) and Duplicate act on
  the selection.
- **Cut**: the scissors that appear between two pages cut the document there.
  The parts get their own color, and one click downloads them as a ZIP. "Cut
  every N pages" places the cuts for you, and they can be moved or removed one
  by one.
- **Hide blank pages**: pages with no ink (the blank backs of a scan) are hidden
  in one click, and can be shown again.
- **Numbers and watermark**: page numbers (six positions, three formats, first
  number, skip the cover) and a text watermark (size, angle, opacity), drawn on
  everything you download, upright on rotated pages too.
- **Redact**: draw rectangles on a page. In the downloaded PDF that page becomes a
  picture with the rectangles painted black, so the text, the vectors and the
  links under them no longer exist. The other pages are copied untouched. The
  output is a new document: the title, author and other metadata of the source
  are not carried over.
  Everything can be done with the keyboard: focus the page, arrows move a
  crosshair (Shift for bigger steps), Enter starts a rectangle and Enter again
  places it; Tab goes through the rectangles, which move with the arrows, resize
  with Shift and the arrows, and go with Delete.
- **Find and redact**: look for e-mail addresses, IBAN (checksum verified), card
  numbers (Luhn verified), phone numbers and words in the text of every page.
  Each match is listed, can be switched off, and becomes a rectangle that covers
  the whole line of text it is in. Scanned pages have no text and are reported
  as not searched.
- **Sign and add text**: sign with a drawn, typed or imported signature (an
  imported scan gets a transparent paper), or put a line of text anywhere on a
  page (a name, a date, a cross). Drag it where it belongs, or move it with the
  arrow keys; apply it to one page, the selected pages or all of them. It is a
  picture of a signature, not a digital signature with a certificate.
- **Properties**: a report of what each file carries (title, author, dates, XMP,
  embedded files, scripts, bookmarks, hidden layers, links, comments, form
  fields), and the properties of the file you download, which you write
  yourself. The download is a new document, so none of the document level data
  of your files is copied; links and comments stay on the copied pages unless
  you ask to remove them. The dates can be left out.
- **Extract text**: the text of the shown pages (or of the selection) to a .txt
  file. A redacted page is written as `[redacted page]`.
- **Export images**: the pages as PNG or JPEG at 72, 150 or 300 dpi, as a ZIP.
  Redactions are painted in and hidden pages are left out.
- **Images**: photos and screenshots (JPEG, PNG, WebP) become the pages of a PDF,
  in the order you give them, with a page size (fit, A4, Letter) and a margin. A
  photo stored sideways by a phone is turned upright. Open the result in Pages
  or download it.
- **Compress**: Light rewrites the file compactly; Balanced and Strong also
  re-encode the JPEG photos inside at a lower size and quality. The size before
  and after is shown before you download.

## Keyboard

Arrows move between pages (Shift extends the selection), Space selects the
focused page, Ctrl/Cmd+A selects all, Esc clears the selection, R and Shift+R
rotate, Delete or H hides (and shows again), Alt+Left and Alt+Right move, C cuts
after the page, Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z undo and redo.

## Limits

- A redacted page is no longer searchable or selectable as a whole, and its
  links are gone.
- Compression only touches JPEG photos (single filter, gray or color). Images
  in other encodings are kept as they are, so a PDF made of scanned PNG pages
  or of vector drawings may not shrink; the result says so. Bookmarks, forms and
  the rest of the structure are kept, and there is no PDF/A guarantee.
- Text put on a page is limited to the same characters. Real form fields (the
  boxes of an administrative form) are not detected yet: type into them with
  Add text.
- Page numbers and the watermark are drawn in the standard Helvetica: a
  character outside it is refused with a message.
- Text extraction follows the order the file stores its text in, which is not
  always the reading order of a page with columns.
- Encrypted PDF files are refused.
- Only tested with the Chromium that ships with Playwright 1.57.

## Planned

The backlog is on the project board (milestones 0.1.0 and 0.2.0): signing and
filling forms, finding text to redact, an interface in several languages,
headers and footers, an image watermark, and more.

## Performance

Measured once on a development Mac (Apple silicon, Chromium 143), so only the
order of magnitude matters. A 500-page text document opens and shows its first
thumbnails in about a third of a second, with 17 MB of script memory. A scan of
120 pages with one photo each (58 MB) opens in a quarter of a second, takes 2
seconds to look for blank pages, 0.3 seconds to download, and 4 seconds to
compress (Balanced); the memory peaks at about 240 MB during the download.
Thumbnails are drawn only when they come into view. A 200 MB file has not been
tried. `npm run bench` repeats the scan measurement (building the file takes
about a second per page).

## Privacy

The extension asks for no permission. Its Content Security Policy only lets a
page load files from the extension itself (`connect-src 'self'`), so no request
can leave for another origin. The files you open stay in the page that reads
them.

## Development

```
npm ci
npm run check        # lint, types, unit tests
npm run test:e2e     # the extension in Chromium (needs: npx playwright-core install chromium)
```

`npm run icons` redraws `icons/` from `docs/logo.svg`.

Load the folder as an unpacked extension from `chrome://extensions`, then click
the Oblitero icon. Third-party code is in `vendor/`, copied as is.

## Licence

MIT, see `LICENSE`.
