// Writes the PDF files and the images for testing Oblitero by hand, one folder per tool:
// node scripts/make-test-files.mjs <output folder>
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { PDFDocument, PDFName, PDFString, StandardFonts, degrees, rgb } from '../vendor/pdf-lib.esm.min.js';
import { jpegComponents } from '../compress.js';
import { drawImages } from './draw-test-images.mjs';

const out = resolve(process.argv[2] ?? 'test-files');
const FOLDERS = ['fusion', 'pages', 'images', 'compression', 'signature', 'a-refuser'];
for (const folder of FOLDERS) mkdirSync(join(out, folder), { recursive: true });

// Fake personal data, joined at run time so that no secret scanner reads them as one literal.
const fake = {
  iban: ['FR76', '3000', '6000', '0112', '3456', '7890', '189'].join(' '),
  card: ['4970', '1012', '3456', '7890'].join(' '),
  ssn: ['1', '85', '05', '78', '006', '084', '36'].join(' '),
};

const A4 = [595.28, 841.89];
const LETTER = [612, 792];

function png(width, height, channels, pixel) {
  const raw = Buffer.alloc(height * (1 + width * channels));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * channels);
    for (let x = 0; x < width; x++) {
      const values = pixel(x, y);
      for (let c = 0; c < channels; c++) raw[row + 1 + x * channels + c] = values[c];
    }
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const head = Buffer.alloc(4);
    head.writeUInt32BE(data.length);
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc32(body));
    return Buffer.concat([head, body, tail]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = { 1: 0, 3: 2, 4: 6 }[channels];
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function write(name, document, options) {
  const bytes = await document.save(options);
  writeFileSync(join(out, name), bytes);
  console.log(`${name} (${document.getPageCount()} pages)`);
  return bytes;
}

async function textPages(sizes, draw, setup) {
  const document = await PDFDocument.create();
  setup?.(document);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  sizes.forEach((size, index) => draw(document.addPage(size), { font, bold, index, document }));
  return document;
}

await write('pages/simple-1-page.pdf', await textPages([LETTER], (page, { bold }) => page.drawText('Une seule page', { x: 56, y: 700, size: 24, font: bold })));

await write(
  'pages/contrat-donnees-sensibles.pdf',
  await textPages(
    [LETTER, LETTER, LETTER],
    (page, { font, bold, index }) => {
      const pages = [
        ['Contrat de prestation', ['Entre : Jean Dupont, 12 rue des Lilas, 75011 Paris', 'Telephone : 06 12 34 56 78', 'Email : jean.dupont@example.org', `Numero de securite sociale : ${fake.ssn}`, '', 'Objet : prestation de conseil, 10 jours.']],
        ['Conditions financieres', ['Montant : 8 500 EUR HT', `IBAN : ${fake.iban}`, 'BIC : AGRIFRPP', `Carte : ${fake.card}, expire 09/28`, '', 'Paiement a 30 jours.']],
        ['Signatures', ['Fait a Paris, le 1er novembre 2026.', '', 'Pour le client :', 'Pour le prestataire : Jean Dupont']],
      ][index];
      page.drawText(pages[0], { x: 56, y: 730, size: 20, font: bold });
      pages[1].forEach((line, i) => page.drawText(line, { x: 56, y: 690 - i * 24, size: 12, font }));
    },
    (document) => {
      document.setTitle('Contrat Dupont CONFIDENTIEL');
      document.setAuthor('Jean Dupont');
    },
  ),
);

await write(
  'pages/120-pages.pdf',
  await textPages(Array(120).fill(LETTER), (page, { bold, index }) => {
    page.drawText(String(index + 1), { x: 200, y: 360, size: 160, font: bold, color: rgb(0.15, 0.3, 0.7) });
    page.drawText(`Page ${index + 1} sur 120`, { x: 56, y: 740, size: 14, font: bold });
  }),
);

await write(
  'pages/formats-mixtes.pdf',
  await textPages(
    [A4, [A4[1], A4[0]], LETTER, [841.89, 1190.55], [200, 200], [300, 1200]],
    (page, { bold, index }) => {
      const labels = ['A4 portrait', 'A4 paysage', 'Letter', 'A3', 'Minuscule 200x200', 'Haute 300x1200'];
      const { width, height } = page.getSize();
      page.drawRectangle({ x: 4, y: 4, width: width - 8, height: height - 8, borderWidth: 3, borderColor: rgb(0.8, 0.2, 0.2) });
      page.drawText(labels[index], { x: 16, y: height - 40, size: Math.min(28, width / 10), font: bold });
    },
  ),
);

{
  const document = await textPages([LETTER, LETTER, LETTER, LETTER], (page, { bold, index }) => {
    page.drawText('HAUT', { x: 240, y: 700, size: 48, font: bold });
    page.drawText(`/Rotate ${index * 90}`, { x: 220, y: 400, size: 28, font: bold });
    page.drawText('Telephone : 06 12 34 56 78', { x: 56, y: 200, size: 16, font: bold });
    page.setRotation(degrees(index * 90));
  });
  await write('pages/pages-tournees.pdf', document);
}

{
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.HelveticaBold);
  const gradient = await document.embedPng(png(400, 300, 3, (x, y) => [Math.round((x / 400) * 255), Math.round((y / 300) * 255), 160]));
  const page = document.addPage(LETTER);
  page.drawText('Images et vecteurs', { x: 56, y: 730, size: 22, font });
  page.drawImage(gradient, { x: 56, y: 380, width: 400, height: 300 });
  page.drawRectangle({ x: 56, y: 200, width: 200, height: 120, color: rgb(0.9, 0.5, 0.1), borderColor: rgb(0, 0, 0), borderWidth: 3 });
  page.drawCircle({ x: 400, y: 260, size: 70, color: rgb(0.1, 0.6, 0.3), opacity: 0.6 });
  page.drawLine({ start: { x: 56, y: 150 }, end: { x: 556, y: 100 }, thickness: 4, color: rgb(0.2, 0.2, 0.8) });
  await write('pages/images-et-vecteurs.pdf', document);
}

{
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const first = document.addPage(LETTER);
  first.drawText('Lien et formulaire (cette page sera caviardee)', { x: 56, y: 730, size: 16, font });
  first.drawText('Cliquer ici : https://example.org', { x: 56, y: 680, size: 14, font, color: rgb(0, 0, 0.8) });
  const link = document.context.register(
    document.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [56, 672, 300, 698],
      Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: PDFString.of('https://example.org') },
    }),
  );
  first.node.set(PDFName.of('Annots'), document.context.obj([link]));
  const form = document.getForm();
  first.drawText('Nom :', { x: 56, y: 620, size: 12, font });
  const name = form.createTextField('nom');
  name.setText('Jean Dupont');
  name.addToPage(first, { x: 110, y: 610, width: 240, height: 24 });
  first.drawText('Accepte :', { x: 56, y: 570, size: 12, font });
  form.createCheckBox('accepte').addToPage(first, { x: 130, y: 565, width: 18, height: 18 });
  const second = document.addPage(LETTER);
  second.drawText('Page 2 : un lien ici, https://example.org/deux', { x: 56, y: 700, size: 14, font });
  const link2 = document.context.register(
    document.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [56, 692, 400, 716], Border: [0, 0, 0], A: { Type: 'Action', S: 'URI', URI: PDFString.of('https://example.org/deux') } }),
  );
  second.node.set(PDFName.of('Annots'), document.context.obj([link2]));
  await write('pages/liens-et-formulaire.pdf', document);
}

await write(
  'pages/metadonnees.pdf',
  await textPages(
    [LETTER],
    (page, { font }) => page.drawText('Document charge de metadonnees', { x: 56, y: 700, size: 18, font }),
    (document) => {
      document.setTitle('METADONNEE-TITRE');
      document.setAuthor('METADONNEE-AUTEUR');
      document.setSubject('METADONNEE-SUJET');
      document.setKeywords(['METADONNEE-MOTCLE', 'secret']);
      document.setCreator('METADONNEE-CREATEUR');
      document.setProducer('METADONNEE-PRODUCTEUR');
      document.setCreationDate(new Date('2020-01-02T03:04:05Z'));
      document.setModificationDate(new Date('2021-02-03T04:05:06Z'));
    },
  ),
);

{
  const document = await PDFDocument.create();
  const helvetica = await document.embedFont(StandardFonts.Helvetica);
  const times = await document.embedFont(StandardFonts.TimesRoman);
  const courier = await document.embedFont(StandardFonts.Courier);
  const page = document.addPage(LETTER);
  page.drawText('Banc d essai du caviardage', { x: 56, y: 740, size: 20, font: helvetica });
  page.drawText('SECRET-HELVETICA-20', { x: 56, y: 690, size: 20, font: helvetica });
  page.drawText('SECRET-TIMES-14', { x: 56, y: 650, size: 14, font: times });
  page.drawText('SECRET-COURIER-10', { x: 56, y: 620, size: 10, font: courier });
  page.drawText('SECRET-MINUSCULE-5', { x: 56, y: 600, size: 5, font: helvetica });
  page.drawText('SECRET-ENORME-60', { x: 56, y: 520, size: 60, font: helvetica });
  page.drawText('SECRET-OBLIQUE-45', { x: 80, y: 300, size: 24, font: helvetica, rotate: degrees(45) });
  page.drawText('TEXTE-BLANC-INVISIBLE', { x: 56, y: 460, size: 18, font: helvetica, color: rgb(1, 1, 1) });
  page.drawText('SECRET-BORD-GAUCHE', { x: 2, y: 420, size: 14, font: helvetica });
  page.drawText('SECRET-BORD-BAS', { x: 56, y: 3, size: 14, font: helvetica });
  page.drawText('SECRET-SUPERPOSE', { x: 56, y: 380, size: 20, font: helvetica });
  page.drawText('SECRET-SUPERPOSE', { x: 58, y: 382, size: 20, font: courier });
  await write('pages/banc-essai-caviardage.pdf', document);
}

{
  const random = seeded(7);
  const gray = png(1240, 1754, 1, (x, y) => {
    const line = Math.floor((y - 120) / 40);
    if (y < 120 || y > 1640 || (y - 120) % 40 > 18) return [255];
    const word = Math.floor((x + line * 37) / 90);
    return [(word * 2654435761 + line * 40503) % 11 > 2 && x > 100 && x < 1140 ? 20 + Math.floor(random() * 40) : 255];
  });
  const document = await PDFDocument.create();
  const image = await document.embedPng(gray);
  for (let i = 0; i < 2; i++) document.addPage(A4).drawImage(image, { x: 0, y: 0, width: A4[0], height: A4[1] });
  await write('pages/scan-image-seule.pdf', document);
}

{
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.HelveticaBold);
  const page = document.addPage([14400, 14400]);
  page.drawText('PAGE GEANTE 14400 pt', { x: 600, y: 13400, size: 600, font });
  page.drawText('SECRET-GEANT', { x: 600, y: 7000, size: 900, font });
  page.drawRectangle({ x: 200, y: 200, width: 14000, height: 14000, borderWidth: 80, borderColor: rgb(0.7, 0.1, 0.1) });
  await write('pages/page-geante.pdf', document);
}

await write(
  'pages/accents-et-symboles.pdf',
  await textPages([LETTER], (page, { font }) => {
    ['Eleve a l ecole, Noel en famille.', 'Élève à l’école, Noël en famille : œuvre, cœur, ça, ñ, ü.', 'Prix : 100 € ou 120 £, soit 90 % de remise (note ©).', 'Guillemets « français » et “anglais”.'].forEach((line, i) =>
      page.drawText(line, { x: 56, y: 700 - i * 28, size: 14, font }),
    );
  }),
);

for (const [letter, color] of [['A', rgb(0.85, 0.2, 0.2)], ['B', rgb(0.2, 0.6, 0.3)], ['C', rgb(0.2, 0.3, 0.85)]]) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.HelveticaBold);
  for (let i = 1; i <= 2; i++) {
    const page = document.addPage(LETTER);
    page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color });
    page.drawText(`${letter}${i}`, { x: 150, y: 300, size: 260, font, color: rgb(1, 1, 1) });
  }
  await write(`fusion/fusion-${letter}.pdf`, document);
}

// Files that must be refused
{
  const bytes = await (await textPages(Array(40).fill(LETTER), (page, { bold, index }) => page.drawText(`Page ${index + 1}`, { x: 56, y: 700, size: 30, font: bold }))).save();
  writeFileSync(join(out, 'a-refuser/tronque.pdf'), bytes.subarray(0, Math.floor(bytes.length * 0.6)));
  console.log('a-refuser/tronque.pdf (truncated)');
  writeFileSync(join(out, 'a-refuser/pas-un-pdf.pdf'), 'Ceci est un fichier texte avec une extension .pdf.\n');
  console.log('a-refuser/pas-un-pdf.pdf (not a PDF)');
  writeFileSync(join(out, 'a-refuser/vide.pdf'), '');
  console.log('a-refuser/vide.pdf (0 bytes)');
}

// Really encrypted (macOS PDFKit through swift), password "secret"
{
  const work = mkdtempSync(join(tmpdir(), 'obl-enc-'));
  try {
    const plain = join(work, 'plain.pdf');
    writeFileSync(plain, await (await textPages([LETTER], (page, { bold }) => page.drawText('Protege par mot de passe', { x: 56, y: 700, size: 24, font: bold }))).save());
    const script = join(work, 'encrypt.swift');
    writeFileSync(
      script,
      `import PDFKit
let a = CommandLine.arguments
guard let d = PDFDocument(url: URL(fileURLWithPath: a[1])) else { exit(1) }
exit(d.write(to: URL(fileURLWithPath: a[2]), withOptions: [PDFDocumentWriteOption.userPasswordOption: "secret", PDFDocumentWriteOption.ownerPasswordOption: "owner"]) ? 0 : 1)
`,
    );
    execFileSync('swift', [script, plain, join(out, 'a-refuser/chiffre-mot-de-passe-secret.pdf')], { stdio: 'pipe' });
    console.log('a-refuser/chiffre-mot-de-passe-secret.pdf (encrypted, password: secret)');
  } catch (error) {
    console.log(`a-refuser/chiffre-mot-de-passe-secret.pdf skipped: ${String(error.stderr ?? error.message).split('\n')[0]}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const LOREM =
  'Le conseil d’administration s’est réuni à Lyon pour examiner les comptes de l’exercice. Les produits ont progressé de 8 % par rapport à l’année précédente, portés par les ventes en ligne et par l’ouverture de deux agences. Les charges de personnel restent stables, tandis que les dépenses d’énergie ont reculé de 3 %. Le résultat net, après impôt, s’établit à 1 240 000 €. Contact : comptabilite@example.org, 01 23 45 67 89.';

function wrap(font, size, text, width) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const attempt = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(attempt, size) > width) {
      lines.push(line);
      line = word;
    } else line = attempt;
  }
  return line ? [...lines, line] : lines;
}

// Pages: a lot of three invoices (cut every 3 pages), a report with a cover (numbers, watermark), two columns (text order).
{
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const colors = [rgb(0.85, 0.25, 0.2), rgb(0.2, 0.55, 0.3), rgb(0.2, 0.35, 0.8)];
  for (let invoice = 1; invoice <= 3; invoice++) {
    for (let n = 1; n <= 3; n++) {
      const page = document.addPage(A4);
      page.drawRectangle({ x: 0, y: 770, width: A4[0], height: 72, color: colors[invoice - 1] });
      page.drawText(`FACTURE F-2026-00${invoice}`, { x: 40, y: 797, size: 24, font: bold, color: rgb(1, 1, 1) });
      page.drawText(`Page ${n} sur 3`, { x: 460, y: 800, size: 12, font, color: rgb(1, 1, 1) });
      for (let row = 0; row < 14; row++) page.drawText(`Ligne ${(n - 1) * 14 + row + 1}   Prestation de service   ${(row + 1) * 10 + invoice * 7} EUR`, { x: 40, y: 720 - row * 26, size: 12, font });
      if (n === 3) page.drawText(`TOTAL FACTURE ${invoice} : ${invoice * 1234} EUR`, { x: 40, y: 280, size: 18, font: bold });
    }
  }
  await write('pages/lot-de-3-factures.pdf', document);
}

{
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const cover = document.addPage(A4);
  cover.drawRectangle({ x: 0, y: 0, width: A4[0], height: A4[1], color: rgb(0.1, 0.2, 0.45) });
  cover.drawText('Rapport annuel', { x: 56, y: 520, size: 48, font: bold, color: rgb(1, 1, 1) });
  cover.drawText('Exercice 2026', { x: 56, y: 470, size: 26, font, color: rgb(0.8, 0.88, 1) });
  for (let chapter = 1; chapter <= 9; chapter++) {
    const page = document.addPage(A4);
    page.drawText(`Chapitre ${chapter}`, { x: 56, y: 770, size: 24, font: bold });
    let y = 730;
    for (let paragraph = 0; paragraph < 3; paragraph++) {
      for (const line of wrap(font, 12, LOREM, A4[0] - 112)) {
        page.drawText(line, { x: 56, y, size: 12, font });
        y -= 18;
      }
      y -= 14;
    }
  }
  await write('pages/rapport-10-pages.pdf', document);
}

{
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  for (let sheet = 1; sheet <= 2; sheet++) {
    const page = document.addPage(A4);
    page.drawText(`Bulletin d’information n° ${sheet}`, { x: 56, y: 790, size: 22, font: bold });
    [56, 310].forEach((x, column) => {
      let y = 740;
      page.drawText(column ? 'Colonne de droite' : 'Colonne de gauche', { x, y, size: 13, font: bold });
      y -= 26;
      for (let paragraph = 0; paragraph < 3; paragraph++) {
        for (const line of wrap(font, 11, LOREM, 230)) {
          page.drawText(line, { x, y, size: 11, font });
          y -= 15;
        }
        y -= 10;
      }
    });
    page.drawText('Date', { x: 56, y: 250, size: 11, font: bold });
    page.drawText('Désignation', { x: 160, y: 250, size: 11, font: bold });
    page.drawText('Montant', { x: 450, y: 250, size: 11, font: bold });
    for (let row = 0; row < 6; row++) {
      const y = 228 - row * 22;
      page.drawText(`0${row + 1}/11/2026`, { x: 56, y, size: 11, font });
      page.drawText(`Cotisation et frais de dossier ${row + 1}`, { x: 160, y, size: 11, font });
      page.drawText(`${(row + 1) * 45},00 €`, { x: 450, y, size: 11, font });
      page.drawLine({ start: { x: 56, y: y - 6 }, end: { x: 540, y: y - 6 }, thickness: 0.4, color: rgb(0.6, 0.6, 0.6) });
    }
  }
  await write('pages/deux-colonnes.pdf', document);
}

// Pages: a form without fields, to be filled with text and a signature.
{
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const page = document.addPage(A4);
  page.drawText('ATTESTATION SUR L’HONNEUR', { x: 56, y: 770, size: 22, font: bold });
  page.drawText('Formulaire à compléter à la main (aucun champ n’est actif dans ce fichier).', { x: 56, y: 745, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
  const lines = ['Nom :', 'Prénom :', 'Date de naissance :', 'Adresse :', 'Code postal et ville :'];
  lines.forEach((label, i) => {
    const y = 690 - i * 44;
    page.drawText(label, { x: 56, y, size: 12, font: bold });
    page.drawLine({ start: { x: 200, y: y - 2 }, end: { x: 540, y: y - 2 }, thickness: 0.8 });
  });
  page.drawText('Je déclare sur l’honneur que les informations ci-dessus sont exactes.', { x: 56, y: 440, size: 12, font });
  [['Oui', 56], ['Non', 130]].forEach(([label, x]) => {
    page.drawRectangle({ x, y: 396, width: 16, height: 16, borderWidth: 1, borderColor: rgb(0, 0, 0) });
    page.drawText(String(label), { x: Number(x) + 24, y: 400, size: 12, font });
  });
  page.drawText('Fait à :', { x: 56, y: 330, size: 12, font: bold });
  page.drawLine({ start: { x: 120, y: 328 }, end: { x: 300, y: 328 }, thickness: 0.8 });
  page.drawText('Le :', { x: 330, y: 330, size: 12, font: bold });
  page.drawLine({ start: { x: 365, y: 328 }, end: { x: 540, y: 328 }, thickness: 0.8 });
  page.drawText('Signature :', { x: 56, y: 270, size: 12, font: bold });
  page.drawRectangle({ x: 56, y: 130, width: 260, height: 120, borderWidth: 1, borderColor: rgb(0.5, 0.5, 0.5) });
  await write('pages/formulaire-a-remplir.pdf', document);
}

// Pages: a file that carries a lot besides its pages, for the properties report and the clean download.
{
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  document.setTitle('Dossier interne CONFIDENTIEL');
  document.setAuthor('Jean Dupont');
  document.setSubject('Plan de licenciement');
  document.setKeywords(['interne', 'brouillon']);
  document.setCreator('Traitement de texte 12');
  document.setProducer('Moteur PDF 3');
  document.setCreationDate(new Date('2024-03-04T08:09:10Z'));
  document.setModificationDate(new Date('2025-06-07T11:12:13Z'));
  const first = document.addPage(LETTER);
  const second = document.addPage(LETTER);
  first.drawText('Fichier avec pièce jointe, script, signets, calque caché, commentaire, lien et champ.', { x: 40, y: 740, size: 12, font });
  second.drawText('Page 2', { x: 40, y: 740, size: 12, font });
  await document.attach(new TextEncoder().encode('Note privée : ne pas diffuser.'), 'notes-privees.txt', { mimeType: 'text/plain', description: 'Notes privées' });
  const { context, catalog } = document;
  const link = context.register(context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [40, 700, 300, 725], Border: [0, 0, 0], A: { Type: 'Action', S: 'URI', URI: PDFString.of('https://example.org') } }));
  const note = context.register(context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [320, 700, 340, 720], Contents: PDFString.of('Commentaire de relecture : à supprimer'), T: PDFString.of('Jean Dupont') }));
  first.node.set(PDFName.of('Annots'), context.obj([link, note]));
  first.drawText('Nom :', { x: 40, y: 640, size: 12, font });
  document.getForm().createTextField('nom').addToPage(first, { x: 90, y: 630, width: 200, height: 22 });
  catalog.set(PDFName.of('OpenAction'), context.obj({ S: 'JavaScript', JS: PDFString.of('var ouvert = true;') }));
  const outlines = context.nextRef();
  const items = [context.nextRef(), context.nextRef()];
  context.assign(outlines, context.obj({ Type: 'Outlines', First: items[0], Last: items[1], Count: 2 }));
  [first, second].forEach((target, i) =>
    context.assign(items[i], context.obj({ Title: PDFString.of(i ? 'Deuxième page' : 'Première page'), Parent: outlines, Dest: [target.ref, 'Fit'], ...(i ? { Prev: items[0] } : { Next: items[1] }) })),
  );
  catalog.set(PDFName.of('Outlines'), outlines);
  const layer = context.register(context.obj({ Type: 'OCG', Name: PDFString.of('Calque caché') }));
  catalog.set(PDFName.of('OCProperties'), context.obj({ OCGs: [layer], D: { OFF: [layer], Order: [layer] } }));
  const xmp = '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator><rdf:Seq><rdf:li>Jean Dupont</rdf:li></rdf:Seq></dc:creator></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>';
  catalog.set(PDFName.of('Metadata'), context.register(context.stream(xmp, { Type: 'Metadata', Subtype: 'XML' })));
  await write('pages/proprietes-riches.pdf', document);
}

// Pages: a scan whose backs are blank in different ways (white, scanner noise, dust, a small real stamp).
{
  const random = seeded(31);
  const [width, height] = [620, 876];
  const scanned = (kind) =>
    png(width, height, 1, (x, y) => {
      const noise = kind === 'noise' ? 244 + Math.floor(random() * 11) : 255;
      if (kind === 'text') {
        const line = Math.floor((y - 90) / 34);
        return [y > 90 && y < height - 90 && (y - 90) % 34 < 15 && x > 70 && x < width - 70 && (x * 7 + line * 131) % 97 > 18 ? 25 + Math.floor(random() * 40) : 250];
      }
      if (kind === 'dust') return [[[140, 200], [400, 520], [250, 700]].some(([dx, dy]) => Math.abs(x - dx) < 2 && Math.abs(y - dy) < 2) ? 60 : 252];
      if (kind === 'stamp') {
        const inside = x > 200 && x < 420 && y > 380 && y < 470;
        const border = inside && (x < 206 || x > 414 || y < 386 || y > 464);
        return [border ? 40 : 253];
      }
      return [noise];
    });
  const document = await PDFDocument.create();
  const kinds = ['text', 'white', 'text', 'noise', 'text', 'dust', 'text', 'stamp'];
  for (const kind of kinds) document.addPage(A4).drawImage(await document.embedPng(scanned(kind)), { x: 0, y: 0, width: A4[0], height: A4[1] });
  await write('pages/scan-avec-dos-blancs.pdf', document);
}

// Images, signatures and the PDF files that hold photos.
const pictures = await drawImages();
if (pictures) {
  const withOrientation = (jpeg, orientation) => {
    const exif = Buffer.from([0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, 0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0]);
    return Buffer.concat([jpeg.subarray(0, 2), exif, jpeg.subarray(2)]);
  };
  const save = (name, bytes) => {
    writeFileSync(join(out, name), bytes);
    console.log(`${name} (${(bytes.length / 1048576).toFixed(2)} MB)`);
  };
  for (const name of ['photo-paysage.jpg', 'photo-portrait.jpg', 'photo.webp', 'tres-grande-photo.jpg', 'capture-ecran.png', 'logo-transparent.png', ...[1, 2, 3, 4, 5].map((n) => `ordre-${n}.png`)]) save(`images/${name}`, pictures[name]);
  save('images/photo-telephone-couchee.jpg', withOrientation(pictures['photo-telephone-couchee.jpg'], 6));
  save('images/gris.png', png(800, 600, 1, (x, y) => [Math.round(((x + y) / 1400) * 255)]));
  save('images/minuscule.png', png(16, 16, 3, (x, y) => [x * 16, y * 16, 128]));
  save('images/faux-image.jpg', Buffer.from('Ceci est un fichier texte avec une extension .jpg.\n'));
  save('images/vide.png', Buffer.alloc(0));
  for (const name of ['signature-scan.png', 'signature-scan.jpg', 'signature-transparente.png']) save(`signature/${name}`, pictures[name]);

  const photoPdf = async (name, build) => {
    const document = await PDFDocument.create();
    await build(document, await document.embedFont(StandardFonts.Helvetica), await document.embedFont(StandardFonts.HelveticaBold));
    await write(`compression/${name}`, document);
  };
  const fit = (image, box) => {
    const scale = Math.min(box[0] / image.width, box[1] / image.height);
    return { width: image.width * scale, height: image.height * scale };
  };

  await photoPdf('album-photos.pdf', async (document) => {
    for (const [name, size] of [['pdf-photo-1.jpg', [A4[1], A4[0]]], ['pdf-photo-2.jpg', A4], ['pdf-photo-3.jpg', [A4[1], A4[0]]]]) {
      const image = await document.embedJpg(pictures[name]);
      const page = document.addPage(size);
      const { width, height } = fit(image, [size[0] - 40, size[1] - 40]);
      page.drawImage(image, { x: (size[0] - width) / 2, y: (size[1] - height) / 2, width, height });
    }
  });
  await photoPdf('rapport-photo-et-texte.pdf', async (document, font, bold) => {
    const image = await document.embedJpg(pictures['pdf-photo-moyenne.jpg']);
    for (const title of ['Visite du site', 'Suite de la visite']) {
      const page = document.addPage(A4);
      page.drawText(title, { x: 56, y: 770, size: 24, font: bold });
      let y = 735;
      for (const line of wrap(font, 12, LOREM, A4[0] - 112)) {
        page.drawText(line, { x: 56, y, size: 12, font });
        y -= 18;
      }
      const { width, height } = fit(image, [A4[0] - 112, 360]);
      page.drawImage(image, { x: 56, y: y - 20 - height, width, height });
      page.drawText('Figure : vue générale du site, texte à garder net.', { x: 56, y: y - 40 - height, size: 10, font });
    }
  });
  await photoPdf('scan-courrier-jpeg.pdf', async (document) => {
    for (let n = 1; n <= 3; n++) document.addPage(A4).drawImage(await document.embedJpg(pictures[`pdf-scan-${n}.jpg`]), { x: 0, y: 0, width: A4[0], height: A4[1] });
  });
  await photoPdf('photo-deja-compacte.pdf', async (document) => {
    const image = await document.embedJpg(pictures['pdf-photo-compacte.jpg']);
    document.addPage(A4).drawImage(image, { x: 40, y: 400, width: 515, height: 343 });
  });
  await photoPdf('png-et-vectoriel-sans-gain.pdf', async (document, font) => {
    const page = document.addPage(LETTER);
    page.drawText('Aucune photo JPEG : rien à recompresser.', { x: 56, y: 730, size: 16, font });
    page.drawImage(await document.embedPng(png(400, 300, 3, (x, y) => [Math.round((x / 400) * 255), Math.round((y / 300) * 255), 160])), { x: 56, y: 380, width: 400, height: 300 });
    page.drawCircle({ x: 400, y: 260, size: 70, color: rgb(0.1, 0.6, 0.3), opacity: 0.6 });
  });

  // A grey JPEG, when the system can write one (macOS).
  const work = mkdtempSync(join(tmpdir(), 'obl-gray-'));
  try {
    const source = join(work, 'gray.png');
    const target = join(work, 'gray.jpg');
    writeFileSync(source, png(1200, 800, 1, (x, y) => [Math.round(128 + 100 * Math.sin(x / 40) * Math.cos(y / 50) + (((x * 7919 + y * 104729) % 23) - 11))]));
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '90', source, '--out', target], { stdio: 'pipe' });
    const bytes = readFileSync(target);
    if (jpegComponents(bytes) !== 1) throw new Error('not a grey JPEG');
    await photoPdf('scan-gris-jpeg.pdf', async (document) => {
      document.addPage(A4).drawImage(await document.embedJpg(bytes), { x: 40, y: 300, width: 515, height: 343 });
    });
  } catch (error) {
    console.log(`compression/scan-gris-jpeg.pdf skipped: ${String(error.message).split('\n')[0]}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

copyFileSync(new URL('./test-files-readme.txt', import.meta.url), join(out, 'LISEZ-MOI.txt'));
