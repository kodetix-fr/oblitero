// Writes a set of PDF files for testing Oblitero by hand: node scripts/make-test-pdfs.mjs <output folder>
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { PDFDocument, PDFName, PDFString, StandardFonts, degrees, rgb } from '../vendor/pdf-lib.esm.min.js';

const out = resolve(process.argv[2] ?? 'test-pdfs');
mkdirSync(out, { recursive: true });

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
  header[9] = channels === 1 ? 0 : 2;
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

// 01
await write('01-simple.pdf', await textPages([LETTER], (page, { bold }) => page.drawText('Une seule page', { x: 56, y: 700, size: 24, font: bold })));

// 02
await write(
  '02-contrat-donnees-sensibles.pdf',
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

// 03
await write(
  '03-120-pages.pdf',
  await textPages(Array(120).fill(LETTER), (page, { bold, index }) => {
    page.drawText(String(index + 1), { x: 200, y: 360, size: 160, font: bold, color: rgb(0.15, 0.3, 0.7) });
    page.drawText(`Page ${index + 1} sur 120`, { x: 56, y: 740, size: 14, font: bold });
  }),
);

// 04
await write(
  '04-formats-mixtes.pdf',
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

// 05
{
  const document = await textPages([LETTER, LETTER, LETTER, LETTER], (page, { bold, index }) => {
    page.drawText('HAUT', { x: 240, y: 700, size: 48, font: bold });
    page.drawText(`/Rotate ${index * 90}`, { x: 220, y: 400, size: 28, font: bold });
    page.drawText('Telephone : 06 12 34 56 78', { x: 56, y: 200, size: 16, font: bold });
    page.setRotation(degrees(index * 90));
  });
  await write('05-pages-tournees.pdf', document);
}

// 06
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
  await write('06-images-et-vecteurs.pdf', document);
}

// 07
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
  await write('07-liens-et-formulaire.pdf', document);
}

// 08
await write(
  '08-metadonnees.pdf',
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

// 09
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
  await write('09-banc-essai-caviardage.pdf', document);
}

// 10
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
  await write('10-scan-image-seule.pdf', document);
}

// 11
{
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.HelveticaBold);
  const page = document.addPage([14400, 14400]);
  page.drawText('PAGE GEANTE 14400 pt', { x: 600, y: 13400, size: 600, font });
  page.drawText('SECRET-GEANT', { x: 600, y: 7000, size: 900, font });
  page.drawRectangle({ x: 200, y: 200, width: 14000, height: 14000, borderWidth: 80, borderColor: rgb(0.7, 0.1, 0.1) });
  await write('11-page-geante.pdf', document);
}

// 12
await write(
  '12-accents-et-symboles.pdf',
  await textPages([LETTER], (page, { font }) => {
    ['Eleve a l ecole, Noel en famille.', 'Élève à l’école, Noël en famille : œuvre, cœur, ça, ñ, ü.', 'Prix : 100 € ou 120 £, soit 90 % de remise (note ©).', 'Guillemets « français » et “anglais”.'].forEach((line, i) =>
      page.drawText(line, { x: 56, y: 700 - i * 28, size: 14, font }),
    );
  }),
);

// 17
for (const [letter, color] of [['A', rgb(0.85, 0.2, 0.2)], ['B', rgb(0.2, 0.6, 0.3)], ['C', rgb(0.2, 0.3, 0.85)]]) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.HelveticaBold);
  for (let i = 1; i <= 2; i++) {
    const page = document.addPage(LETTER);
    page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color });
    page.drawText(`${letter}${i}`, { x: 150, y: 300, size: 260, font, color: rgb(1, 1, 1) });
  }
  await write(`17-fusion-${letter}.pdf`, document);
}

// 14, 15, 16: files that must be refused
{
  const bytes = await (await textPages(Array(40).fill(LETTER), (page, { bold, index }) => page.drawText(`Page ${index + 1}`, { x: 56, y: 700, size: 30, font: bold }))).save();
  writeFileSync(join(out, '14-tronque.pdf'), bytes.subarray(0, Math.floor(bytes.length * 0.6)));
  console.log('14-tronque.pdf (truncated)');
  writeFileSync(join(out, '15-pas-un-pdf.pdf'), 'Ceci est un fichier texte avec une extension .pdf.\n');
  console.log('15-pas-un-pdf.pdf (not a PDF)');
  writeFileSync(join(out, '16-vide.pdf'), '');
  console.log('16-vide.pdf (0 bytes)');
}

// 13: really encrypted (macOS PDFKit through swift), password "secret"
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
    execFileSync('swift', [script, plain, join(out, '13-chiffre-mot-de-passe-secret.pdf')], { stdio: 'pipe' });
    console.log('13-chiffre-mot-de-passe-secret.pdf (encrypted, password: secret)');
  } catch (error) {
    console.log(`13-chiffre-mot-de-passe-secret.pdf skipped: ${String(error.stderr ?? error.message).split('\n')[0]}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
