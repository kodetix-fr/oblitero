# Oblitero

A Chrome extension (Manifest V3) for PDF files: merge, organize, cut, hide pages,
redact, compress, number and watermark, turn images into a PDF and pages into
images.

## Install

[Add Oblitero to Chrome](https://chromewebstore.google.com/detail/oblitero-pdf-merge-redact/ofnapekaofoabpfodbffomjkpljmbdfd) from the Chrome Web Store (Chrome 124 or newer).

## Promise

Free, open source, no account, no watermark forced on your files, no ad, no usage
limit, no permission and no network request. Your files stay in the tab that reads
them, and are gone when you close it. See `docs/PRIVACY.md`.

Check it yourself: the `permissions` list of `manifest.json` is empty, its Content
Security Policy only lets a page load files from the extension itself
(`connect-src 'self'`), and `test/e2e/privacy.e2e.mjs` tries every kind of request
against a local server. In Chrome, the Network tab of DevTools lists only
`chrome-extension://`, `data:` and `blob:` addresses.

## Scope

Oblitero will not have a server, an account or telemetry. A tool that cannot work
on your computer alone (conversion through an online service, a shared link, a
certified digital signature) is out of scope.

## What works

- **One screen**: drop PDF files and photos together on the page, or choose them.
  The **Files** view lists them, one row each: drag the rows (or use the arrows)
  to reorder, hide a whole file from the result, remove it, or open its pages.
  The **Pages** view shows every page of every file, in the order of the result,
  and the name of each file on its first page. Add files puts new pages after the
  selection, and a file dropped on the grid lands next to the nearest page. Clear
  empties the screen, and Undo brings it back.
- **Pages**: click selects, Shift+click selects a range, a rectangle dragged on
  the background selects what it touches, and a field takes a list such as
  `1-3, 7, 10-` (Odd and Even are one click). Rotate, hide, drag to reorder (with
  a finger or a pen, a long press starts the drag; the
  whole selection travels with the page you grab, and a drop lands next to the
  nearest page, gaps and the end included). Every change can be undone and
  redone. A hidden page stays in the grid, dimmed, and is left out of every
  download; Show brings it back. Download the result or only the selected pages.
  The thumbnails have a size slider, and a double click (or V) shows a page large,
  with the arrows or the wheel to go to the next one. Add a blank page (the size of the page
  before it) and Duplicate act on the selection. Reverse turns the order of the
  selected pages around, and Interleave takes one page of each file in turn: a
  duplex scan that arrives as the fronts and the backs (reverse the backs first).
  Crop frames the part of the selected pages to keep, drawn on one of them; the
  rest stays in the file, clipped, unless "remove what is outside" is on, and then
  the page becomes a picture of the frame. Links and comments of a cropped page
  are not kept. The Paper setting of the result puts every page on A4 or Letter
  with a margin, turned to its side.
  An angle in degrees turns the selected pages to straighten a crooked scan, and
  the mirror buttons flip them left to right or top to bottom; a page that carries
  a redaction keeps its angle, so the black rectangle stays on what it covers.
- **Photos**: photos and screenshots (JPEG, PNG, WebP) become pages like any
  other, in the order you give them, with a page size (fit, A4, Letter) and a
  margin chosen in the result panel. A photo stored sideways by a phone is turned
  upright. The page of the photos cannot change while one of them carries a
  redaction, a signature or a text.
- **Cut**: the scissors that appear between two pages cut the document there.
  The parts get their own color, and one click downloads them as a ZIP. With
  several files, "One PDF per file" makes a ZIP with a result for each file
  instead (its pages, with the changes and the settings of the result, such as a
  rotation, the numbers, a watermark or the compression), one file at a time,
  and a report that says which ones could not be made. "Cut
  every N pages" places the cuts for you, and they can be moved or removed one
  by one. So do the other ways: at the chapters (the top-level entries of the
  outline), after each blank page (which is hidden: a batch scan with separator
  sheets), or so that no part goes over a size you type. That size is measured by
  building the parts; a page over the limit on its own is a part of its own.
- **Preview**: the result panel shows the PDF you would download, the selection
  if there is one and the whole document otherwise, page by page (arrows or mouse
  wheel) and with its real size: hidden pages left out, redactions, stamps and
  compression applied.
- **Hide blank pages**: every page is measured and shown in a dialog; a slider sets
  how much ink a page may hold and still count as blank (faint scan noise and dust,
  or only the empty pages), and the pages that would be hidden are dimmed as you
  move it. A page with a stamp or a signature stays. Apply hides them, undoable,
  and they can be shown again.
- **Numbers, header, footer and watermark**: page numbers (six positions, three
  formats, first number, skip the cover), a header and a footer of free text
  (left, center or right; `{page}` and `{pages}` become the page number and the
  page count) and a watermark, drawn on everything you download, upright on
  rotated pages too. The watermark is a text (size) or an image (a share of the
  page width), with an angle and an opacity, centered or repeated across the
  page. Bates numbers (prefix, first number, digits, suffix) go on from one part
  of a cut document to the next, and a stamp is a framed text such as
  CONFIDENTIAL, or an image, in a corner or the middle of an edge. A letterhead is the first page of a PDF you choose (company paper),
  placed under or over the content of every page, as large as the page holds it,
  with an opacity. A list of pages such as `2-5, 8` limits all of them to those pages of each
  file you download. The dialog previews the first page reached, stamped the way
  the single PDF is.
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
- **Fill form**: the text fields, check boxes, radio buttons and lists of a form
  are listed with their page and their readable name; fill them and the values
  are written on the pages of the file you download, which no longer holds any
  field. Fill again, or Reset, as long as the file is open; a button, a signature
  or a read only field is listed but not filled. A PDF without fields uses Add
  text.
- **Sign and add text**: sign with a drawn, typed or imported signature (an
  imported scan gets a transparent paper), or put a line of text anywhere on a
  page (a name, a date, a cross). Drag it where it belongs, or move it with the
  arrow keys; apply it to one page, the selected pages or all of them. It is a
  picture of a signature, not a digital signature with a certificate.
- **Password**: the result panel takes a password to open the downloaded files
  (AES-256, by qpdf), with or without printing and copying the text. The preview
  is not protected, and the password is not kept.
- **Properties**: a report of what each file carries (title, author, dates, XMP,
  embedded files, scripts, bookmarks, hidden layers, links, comments, form
  fields), and the properties of the file you download, which you write
  yourself. The download is a new document, so none of the document level data
  of your files is copied; links and comments stay on the copied pages unless
  you ask to remove them, or to draw them into the pages (flatten: the fields
  and comments look the same and can no longer be changed). The dates can be
  left out. The bookmarks are kept,
  pointing to the pages of the result, under the name of each file when there
  are several; they can be left out, and they never are kept when a page is
  redacted, since a bookmark can name what the rectangle hides.
- **Extract text**: the text of the shown pages (or of the selection) to a .txt
  file. A redacted page is written as `[redacted page]`.
- **Export images**: the pages as PNG or JPEG at 72, 150 or 300 dpi, as a ZIP.
  Redactions are painted in and hidden pages are left out.
- **Compression**, in the result panel: None, Light (rewrites the file
  compactly), Balanced or Strong (also re-encode the JPEG photos inside at a
  lower size and quality). It applies to everything you download. "See before
  and after" shows the page itself: a line you drag (or move with the arrow keys)
  shows the original on its left and the result on its right, page by page, so
  you can judge the loss; the sizes are shown, and the download says how much
  was saved.

## Keyboard

Arrows move between pages (Shift extends the selection), Space selects the
focused page, Ctrl/Cmd+A selects all, Esc clears the selection, R and Shift+R
rotate, Delete or H hides (and shows again), Alt+Left and Alt+Right move, C cuts
after the page, V shows it large, Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z undo and redo.

## Limits

- A redacted page is no longer searchable or selectable as a whole, and its
  links are gone.
- Links inside a document (a table of contents, for example) are removed from
  the result, so that none can carry a redacted or hidden page along. Web links
  stay, and so do notes and what form fields show; attachments, media and
  private application data of a page do not.
- A damaged PDF (cut short, a lost cross-reference table or page tree, or pages
  two readers count differently) is rebuilt from the pages that can still be
  read, and the status says how many were recovered out of how many; a page
  with nothing left to read is gone. A file with no readable page is refused.
- Compression only touches JPEG photos (single filter, gray or color). Images
  in other encodings are kept as they are, so a PDF made of scanned PNG pages
  or of vector drawings may not shrink; the result says so. Bookmarks, forms and
  the rest of the structure are kept, and there is no PDF/A guarantee.
- Text put on a page is limited to the same characters, and so are the values of
  a form (the standard font only holds Latin characters). A form is filled
  through a list, not on the page itself, and its scripts (formats, checks,
  calculations) do not run; a multiple choice list keeps one choice.
- Page numbers and the watermark are drawn in the standard Helvetica: a
  character outside it is refused with a message.
- Text extraction reads the page from the position of its text, not from the
  order the file draws it in: columns are read one after the other, a header
  before them, a table row by row. It is a guess from the layout, so a page with
  a sidebar, a table whose cells hold long text, or vertical text can come out in
  the wrong order.
- A password-protected PDF is opened with its password, decrypted in memory by
  qpdf (RC4 and AES); its result is a file without that password.
- Needs Chrome 124 or newer. The tests run on Chrome 124 and on the Chromium that
  ships with Playwright 1.57. Chrome 116 cannot open a PDF: it lacks
  `Promise.withResolvers`, which PDF.js uses. Versions 117 to 123 are not tested.

## Planned

The backlog is on the project board.

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

## Development

```
npm ci
npm run check        # lint, types, unit tests
npm run test:e2e     # the extension in Chromium (needs: npx playwright-core install chromium)
npm run package      # dist/oblitero-<version>.zip and its SHA-256
```

`npm run icons` redraws `icons/` from `docs/logo.svg`.

`node scripts/make-test-files.mjs <folder>` writes the files used to try every tool by
hand, one folder per tool (PDF files, photos, a phone photo stored sideways, signatures,
scans, files that must be refused), with a `LISEZ-MOI.txt` that says what to check in each.
The pictures are drawn by the Chromium of Playwright.

Load the folder as an unpacked extension from `chrome://extensions`, then click
the Oblitero icon. Third-party code is in `vendor/`, copied as is.

## Languages

The interface speaks English, French, German, Spanish, Brazilian Portuguese,
Russian, Japanese, Simplified Chinese and Indonesian, the same list as Obturo.
It follows the language of the browser, and a picker in the title bar changes it
(the choice is kept on this computer, with no permission). The texts are in
`locales/<code>.js`, one flat list of keys per language; `locales/en.js` is the
source and the fallback. The static texts of `app.html` carry their key in a
`data-i18n` attribute, the others are written by the scripts with `t('key')`.

To add a language: its code and its name in `languages.js`, `locales/<code>.js`
with the keys of `en.js` in the same order, and `_locales/<code>/messages.json`
for the name and the description in the store. `npm test` checks that every
language has the same keys and the same `{placeholders}`, that no text holds a
long dash, and that the code only asks for keys that exist.

## Support

Oblitero is free and will stay free. To support it: https://kodetix.fr/oblitero/soutenir

## Licence

MIT, see `LICENSE`.
