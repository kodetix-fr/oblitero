# Oblitero - Chrome Web Store listing

Texts to paste into the dashboard, which cannot be automated. Requirements checked for Obturo on 2026-10-01 in the official documentation (policies, privacy tab, images, publishing); reread the real form. Long descriptions are in French and English; the store shows the English one to the other languages.

## 1. Name and summary

Read from the package (`extName` and `extDescription` in `_locales/<language>/messages.json`); the tooltip of the icon stays "Oblitero". The limits are 75 and 132 characters, and `manifest.test.js` checks them. The seven languages other than English and French are assisted translations, not reviewed by native speakers.

## 2. Long description

### Français

Oblitero assemble, organise, caviarde et signe tes PDF, sans compte, sans serveur et sans aucune permission. Tes fichiers ne quittent jamais ton ordinateur, même les plus sensibles.

ORGANISER
- Dépose ensemble des PDF et des photos : tout arrive sur un seul écran, par fichier ou par page.
- Fais pivoter, déplace, duplique, masque des pages, ajoute une page blanche. Chaque geste s'annule, et tout se fait aussi au clavier.
- Coupe le document d'un clic, ou toutes les N pages, et récupère les parties dans un ZIP.
- Masque les pages blanches d'un scan, avec un curseur qui montre ce qui serait retiré.
- Inverse ou entrelace les pages (recto et verso d'un scan), rogne-les, tourne-les de n'importe quel angle ou en miroir.

CAVIARDER POUR DE VRAI
- Dessine des rectangles, au clavier si tu préfères, ou cherche les e-mails, IBAN, numéros de carte, téléphones et mots de ton choix dans tout le document.
- La page caviardée devient une image : le texte, les dessins et les liens sous le rectangle n'existent plus dans le fichier.
- Le fichier produit est un nouveau document : le titre, l'auteur et les autres propriétés de la source ne suivent pas. Un rapport montre ce que chaque fichier transporte.

SIGNER ET REMPLIR
- Signe avec une signature dessinée, tapée ou importée, et ajoute un nom ou une date où tu veux. C'est l'image d'une signature, pas une signature numérique avec certificat.
- Remplis les formulaires : champs, cases, listes.
- Ajoute des numéros de page, un en-tête, un pied de page et un filigrane, en texte ou en image, une numérotation Bates, un tampon ou un papier à en-tête.
- Dessine des rectangles, des flèches et des surlignages sur une page.

PROTÉGER ET RÉPARER
- Ouvre les PDF protégés par mot de passe, et protège le résultat par un mot de passe (AES-256).
- Répare un fichier abîmé à partir des pages encore lisibles.

CONVERTIR ET ALLÉGER
- Transforme des photos en PDF (taille de page, marge) et des pages en images PNG ou JPEG.
- Extrais le texte dans l'ordre de lecture.
- Compresse sur trois niveaux, et compare la page avant et après avant de télécharger.
- Prévisualise le résultat, avec sa taille réelle.
- Un PDF par fichier : les mêmes réglages sur plusieurs fichiers, dans un ZIP avec un rapport.

Interface en neuf langues (français, anglais, allemand, espagnol, portugais du Brésil, indonésien, russe, japonais, chinois simplifié). Gratuit, sans limite d'usage, sans filigrane imposé, open source sous licence MIT.

Confidentialité : aucun compte, aucun serveur, aucune télémétrie, aucune publicité, aucun code distant. L'extension ne demande aucune permission, et sa politique de sécurité interdit toute requête vers l'extérieur : tu peux le vérifier dans l'onglet Réseau.

Limites : une page caviardée n'est plus sélectionnable, la compression ne touche que les photos JPEG, le texte ajouté se limite aux caractères latins.

### English

Oblitero merges, organizes, redacts and signs your PDF files, with no account, no server and no permission at all. Your files never leave your computer, even the most sensitive ones.

ORGANIZE
- Drop PDF files and photos together: everything lands on one screen, by file or by page.
- Rotate, move, duplicate and hide pages, add a blank page. Every action can be undone, and everything works from the keyboard too.
- Cut the document with one click, every N pages, at the chapters, after blank pages or under a size, and get the parts in a ZIP.
- Hide the blank pages of a scan, with a slider that shows what would go.
- Reverse or interleave the pages (the fronts and backs of a scan), crop them, turn them by any angle or mirror them.

REDACT FOR REAL
- Draw rectangles, with the keyboard if you prefer, or look for e-mail addresses, IBANs, card numbers, phone numbers and words of your choice across the document.
- A redacted page becomes a picture: the text, the drawings and the links under the rectangle no longer exist in the file.
- The output is a new document: the title, author and other properties of the source do not follow. A report shows what each file carries.

SIGN AND FILL
- Sign with a drawn, typed or imported signature, and add a name or a date anywhere. It is a picture of a signature, not a digital signature with a certificate.
- Fill in forms: fields, check boxes, lists.
- Add page numbers, a header, a footer and a watermark, as text or as an image, Bates numbers, a stamp or a letterhead.
- Draw rectangles, arrows and highlights on a page.

PROTECT AND REPAIR
- Open password-protected PDF files, and protect the result with a password (AES-256).
- Repair a damaged file from the pages that can still be read.

CONVERT AND SHRINK
- Turn photos into a PDF (page size, margin) and pages into PNG or JPEG images.
- Extract the text in reading order.
- Compress at three levels, and compare the page before and after you download.
- Preview the result, with its real size.
- One PDF per file: the same settings on many files, in a ZIP with a report.

The interface comes in nine languages (English, French, German, Spanish, Brazilian Portuguese, Indonesian, Russian, Japanese and simplified Chinese). Free, no usage limit, no forced watermark, open source under the MIT license.

Privacy: no account, no server, no telemetry, no ads, no remote code. The extension asks for no permission, and its security policy forbids any request to the outside: you can check it in the Network tab.

Limits: a redacted page can no longer be selected, compression only touches JPEG photos, added text is limited to Latin characters.

## 3. Category

Tools, or Productivity like Obturo: pick it in the dashboard menu.

## 4. Single purpose

> Français : Modifier des fichiers PDF sur l'ordinateur de l'utilisateur (assembler, organiser, caviarder, signer, compresser), sans jamais les envoyer.
>
> English: Edit PDF files on the user's computer (merge, organize, redact, sign, compress), without ever sending them anywhere.

## 5. Permissions and remote code

- Permissions: **none**, so nothing to justify (`manifest.test.js` pins the empty list). If the form asks anyway: "The extension requests no permission. The icon opens a page of the extension, and the user chooses the files."
- Remote code: **No.** All the code is in the package, the vendored pdf-lib and PDF.js included. `'wasm-unsafe-eval'` in the content security policy is for the WebAssembly image decoders of PDF.js, which are files of the package.

## 6. Data disclosure and privacy policy

The Chrome FAQ asks for a disclosure even when data is only processed locally. The files are not collected, but they are handled, and no box of the form describes a file the user opens. **Website content** is the closest ("text, images, sounds, videos or hyperlinks"): tick it.

- Certifications: all of them, as no data is sold, transferred, used outside the single purpose, used for advertising or read by a human.
- Policy URL: https://kodetix.fr/en/oblitero/confidentialite (rendered from `docs/PRIVACY.md`).
- Support: support@kodetix.fr.

## 7. Visuals

| Visual | Size | Source |
|---|---|---|
| Store icon | 128x128 PNG | `icons/icon128.png` |
| Screenshots | 5 at 1280x800 | `node scripts/make-store-images.mjs` writes them to `dist/store/`, on made-up documents |
| Small tile | 440x280 | same script |
| Marquee promo tile | 1400x560 | same script: the name, the promise and the Find and redact screen |

## 8. Submission

1. `npm run package`: `dist/oblitero-<version>.zip`, with its checks.
2. Dashboard, "Add new item", upload the zip.
3. Store Listing: description (2), category (3), visuals (7).
4. Privacy: single purpose (4), permissions and remote code (5), disclosure and policy URL (6).
5. Distribution: free of charge, all countries, public.
6. Test instructions (below), then "Submit for review", with deferred publication to choose the moment.

Test instructions to enter (the field takes 500 characters): "No account needed. Click the Oblitero icon: a tab opens. Drop a PDF on it. Select a page, then use Rotate or Hide. Use Redact to draw a rectangle, then Download PDF: the area is black and the text under it is gone. The extension has no permission and sends nothing to any server: the DevTools Network tab shows only chrome-extension, data and blob addresses. The only external addresses are the links of About (store, GitHub, kodetix.fr), opened in a new tab on click."
