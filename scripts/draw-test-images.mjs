// Draws the test pictures in the browser that Playwright ships (its canvas writes JPEG, PNG and WebP): name -> bytes.
import { chromium } from 'playwright-core';

export async function drawImages() {
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chromium' });
  } catch (error) {
    console.log(`images skipped (no Chromium for Playwright): ${String(error.message).split('\n')[0]}`);
    return null;
  }
  try {
    const page = await browser.newPage();
    const encoded = await page.evaluate(draw);
    return Object.fromEntries(Object.entries(encoded).map(([name, base64]) => [name, Buffer.from(base64, 'base64')]));
  } finally {
    await browser.close();
  }
}

// Runs inside the page: no import, no outer variable.
async function draw() {
  const random = (seed) => {
    let state = seed;
    return () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const canvasOf = (width, height) => Object.assign(document.createElement('canvas'), { width, height });
  const base64 = (blob) =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.readAsDataURL(blob);
    });
  const encode = async (canvas, type, quality) => base64(await new Promise((resolve) => canvas.toBlob(resolve, type, quality)));
  const grain = (context, width, height, amount, rnd) => {
    const image = context.getImageData(0, 0, width, height);
    for (let i = 0; i < image.data.length; i += 4) {
      const n = (rnd() - 0.5) * amount;
      image.data[i] += n;
      image.data[i + 1] += n;
      image.data[i + 2] += n;
    }
    context.putImageData(image, 0, 0);
  };

  // A landscape with a lot of fine detail and grain, so that a JPEG of it is heavy and its loss is visible.
  const scene = (width, height, seed) => {
    const rnd = random(seed);
    const canvas = canvasOf(width, height);
    const c = canvas.getContext('2d', { willReadFrequently: true });
    const sky = c.createLinearGradient(0, 0, 0, height * 0.65);
    sky.addColorStop(0, '#1f4e9c');
    sky.addColorStop(0.6, '#7fb2e5');
    sky.addColorStop(1, '#f6d6a8');
    c.fillStyle = sky;
    c.fillRect(0, 0, width, height);
    const sun = c.createRadialGradient(width * 0.7, height * 0.45, 0, width * 0.7, height * 0.45, height * 0.25);
    sun.addColorStop(0, 'rgba(255,248,220,1)');
    sun.addColorStop(0.3, 'rgba(255,220,150,.8)');
    sun.addColorStop(1, 'rgba(255,200,120,0)');
    c.fillStyle = sun;
    c.fillRect(0, 0, width, height);
    c.filter = `blur(${Math.max(2, height / 120)}px)`;
    for (let i = 0; i < 40; i++) {
      c.fillStyle = `rgba(255,255,255,${0.15 + rnd() * 0.2})`;
      c.beginPath();
      c.ellipse(rnd() * width, rnd() * height * 0.45, width * (0.04 + rnd() * 0.08), height * (0.01 + rnd() * 0.03), 0, 0, Math.PI * 2);
      c.fill();
    }
    c.filter = 'none';
    [[0.55, '#6d8fb3'], [0.65, '#4f7a5c'], [0.78, '#2f5a3a'], [0.9, '#1d3b27']].forEach(([base, color], layer) => {
      c.fillStyle = String(color);
      c.beginPath();
      c.moveTo(0, height);
      for (let x = 0; x <= width; x += width / 200) {
        const y = height * Number(base) + Math.sin((x / width) * (3 + layer * 2) + layer) * height * 0.05 + Math.sin((x / width) * (17 + layer * 5) + layer * 3) * height * 0.012;
        c.lineTo(x, y);
      }
      c.lineTo(width, height);
      c.closePath();
      c.fill();
    });
    for (let i = 0; i < (width * height) / 250; i++) {
      const x = rnd() * width;
      const y = height * (0.62 + rnd() * 0.38);
      c.strokeStyle = `hsla(${90 + rnd() * 50},${40 + rnd() * 30}%,${15 + rnd() * 35}%,${0.4 + rnd() * 0.5})`;
      c.lineWidth = 1 + rnd() * 2.5;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + (rnd() - 0.5) * (height / 60), y - rnd() * (height / 45));
      c.stroke();
    }
    grain(c, width, height, 18, rnd);
    return canvas;
  };

  // A page of a typed letter, scanned: grey paper, a slight tilt, noise.
  const scannedLetter = (lines, seed) => {
    const rnd = random(seed);
    const [width, height] = [1654, 2339];
    const canvas = canvasOf(width, height);
    const c = canvas.getContext('2d', { willReadFrequently: true });
    c.fillStyle = '#efece4';
    c.fillRect(0, 0, width, height);
    c.save();
    c.translate(width / 2, height / 2);
    c.rotate(0.007);
    c.translate(-width / 2, -height / 2);
    c.fillStyle = '#1b1b1f';
    c.font = 'bold 44px "Times New Roman", serif';
    c.fillText('Cabinet Dupont & Associés', 160, 230);
    c.font = '30px "Times New Roman", serif';
    c.fillText('12 rue des Lilas, 75011 Paris', 160, 280);
    lines.forEach((line, i) => c.fillText(line, 160, 420 + i * 46));
    c.restore();
    const edge = c.createRadialGradient(width / 2, height / 2, height * 0.35, width / 2, height / 2, height * 0.75);
    edge.addColorStop(0, 'rgba(0,0,0,0)');
    edge.addColorStop(1, 'rgba(60,50,30,.25)');
    c.fillStyle = edge;
    c.fillRect(0, 0, width, height);
    grain(c, width, height, 26, rnd);
    return canvas;
  };

  // A signature written with a pen: a few strokes of varying width.
  const signature = (paper, seed) => {
    const rnd = random(seed);
    const [width, height] = [900, 330];
    const canvas = canvasOf(width, height);
    const c = canvas.getContext('2d', { willReadFrequently: true });
    if (paper) {
      c.fillStyle = '#ece9e2';
      c.fillRect(0, 0, width, height);
      grain(c, width, height, 22, rnd);
    }
    c.strokeStyle = '#14246b';
    c.lineCap = 'round';
    c.lineJoin = 'round';
    const stroke = (points, base) => {
      for (let i = 1; i < points.length; i++) {
        c.lineWidth = base * (0.6 + 0.8 * Math.abs(Math.sin(i * 0.55)));
        c.beginPath();
        c.moveTo(...points[i - 1]);
        c.lineTo(...points[i]);
        c.stroke();
      }
    };
    const curve = (fn, from, to, steps) => Array.from({ length: steps + 1 }, (_, i) => fn(from + ((to - from) * i) / steps));
    stroke(curve((t) => [120 + 70 * Math.sin(t * 2) * Math.cos(t * 0.5), 175 - 95 * Math.sin(t) + 20 * Math.cos(t * 3)], 0, 6.5, 120), 7);
    stroke(curve((t) => [230 + t * 520, 190 + Math.sin(t * 9) * 38 * (1 - t * 0.5) - t * 40], 0, 1, 140), 6);
    stroke(curve((t) => [300 + t * 480, 275 - t * 20 + Math.sin(t * 5) * 6], 0, 1, 60), 4);
    return canvas;
  };

  const out = {};

  const landscape = scene(3000, 2000, 1);
  const portrait = scene(2000, 3000, 2);
  const third = scene(3000, 2000, 3);
  out['photo-paysage.jpg'] = await encode(landscape, 'image/jpeg', 0.92);
  out['photo-portrait.jpg'] = await encode(portrait, 'image/jpeg', 0.92);
  out['pdf-photo-1.jpg'] = out['photo-paysage.jpg'];
  out['pdf-photo-2.jpg'] = out['photo-portrait.jpg'];
  out['pdf-photo-3.jpg'] = await encode(third, 'image/jpeg', 0.92);
  out['pdf-photo-compacte.jpg'] = await encode(scene(900, 600, 4), 'image/jpeg', 0.35);
  out['pdf-photo-moyenne.jpg'] = await encode(scene(2400, 1600, 5), 'image/jpeg', 0.9);
  out['photo.webp'] = await encode(scene(2400, 1600, 6), 'image/webp', 0.9);
  out['tres-grande-photo.jpg'] = await encode(scene(6000, 4000, 7), 'image/jpeg', 0.9);

  // A portrait picture stored on its side (the way a phone does), to be turned upright by the EXIF flag added by the caller.
  const upright = canvasOf(1500, 2000);
  const u = upright.getContext('2d');
  u.drawImage(scene(1500, 2000, 8), 0, 0);
  u.fillStyle = 'rgba(255,255,255,.88)';
  u.fillRect(0, 0, 1500, 330);
  u.fillStyle = '#c0261e';
  u.font = 'bold 230px sans-serif';
  u.textAlign = 'center';
  u.fillText('HAUT', 750, 250);
  const stored = canvasOf(2000, 1500);
  const s = stored.getContext('2d');
  s.setTransform(0, -1, 1, 0, 0, 1500);
  s.drawImage(upright, 0, 0);
  out['photo-telephone-couchee.jpg'] = await encode(stored, 'image/jpeg', 0.9);

  const screen = canvasOf(1280, 800);
  const sc = screen.getContext('2d');
  sc.fillStyle = '#f4f6fa';
  sc.fillRect(0, 0, 1280, 800);
  sc.fillStyle = '#1f2a44';
  sc.fillRect(0, 0, 1280, 56);
  ['#ff5f57', '#febc2e', '#28c840'].forEach((color, i) => {
    sc.fillStyle = color;
    sc.beginPath();
    sc.arc(28 + i * 26, 28, 8, 0, Math.PI * 2);
    sc.fill();
  });
  sc.fillStyle = '#ffffff';
  sc.fillRect(0, 56, 220, 744);
  sc.fillStyle = '#1f2a44';
  sc.font = 'bold 26px sans-serif';
  sc.fillText('Tableau de bord', 260, 120);
  sc.font = '20px sans-serif';
  ['Accueil', 'Clients', 'Factures', 'Réglages'].forEach((label, i) => sc.fillText(label, 36, 120 + i * 48));
  [[260, 160], [560, 160], [860, 160]].forEach(([x, y], i) => {
    sc.fillStyle = '#ffffff';
    sc.fillRect(x, y, 270, 120);
    sc.fillStyle = '#2563eb';
    sc.font = 'bold 40px sans-serif';
    sc.fillText(['12 480 €', '342', '98 %'][i], x + 20, y + 62);
    sc.fillStyle = '#6b778c';
    sc.font = '18px sans-serif';
    sc.fillText(['Chiffre du mois', 'Clients actifs', 'Satisfaction'][i], x + 20, y + 96);
  });
  for (let i = 0; i < 12; i++) {
    sc.fillStyle = '#2563eb';
    const bar = 60 + ((i * 53) % 200);
    sc.fillRect(270 + i * 80, 700 - bar, 48, bar);
  }
  out['capture-ecran.png'] = await encode(screen, 'image/png');

  const logo = canvasOf(600, 600);
  const l = logo.getContext('2d');
  l.shadowColor = 'rgba(0,0,0,.35)';
  l.shadowBlur = 30;
  l.shadowOffsetY = 12;
  const fill = l.createLinearGradient(100, 100, 500, 500);
  fill.addColorStop(0, '#7c3aed');
  fill.addColorStop(1, '#2563eb');
  l.fillStyle = fill;
  l.beginPath();
  l.arc(300, 290, 200, 0, Math.PI * 2);
  l.fill();
  l.shadowColor = 'transparent';
  l.fillStyle = '#ffffff';
  l.font = 'bold 240px sans-serif';
  l.textAlign = 'center';
  l.fillText('O', 300, 372);
  out['logo-transparent.png'] = await encode(logo, 'image/png');

  const colors = ['#d9482b', '#2b8a3e', '#2563eb', '#a855c7', '#d99a1c'];
  for (let n = 1; n <= 5; n++) {
    const tile = canvasOf(n % 2 ? 800 : 600, n % 2 ? 600 : 800);
    const t = tile.getContext('2d');
    t.fillStyle = colors[n - 1];
    t.fillRect(0, 0, tile.width, tile.height);
    t.fillStyle = '#ffffff';
    t.font = 'bold 360px sans-serif';
    t.textAlign = 'center';
    t.fillText(String(n), tile.width / 2, tile.height / 2 + 125);
    out[`ordre-${n}.png`] = await encode(tile, 'image/png');
  }

  out['signature-scan.png'] = await encode(signature(true, 11), 'image/png');
  out['signature-scan.jpg'] = await encode(signature(true, 12), 'image/jpeg', 0.85);
  out['signature-transparente.png'] = await encode(signature(false, 13), 'image/png');

  const letters = [
    ['Paris, le 1er novembre 2026', '', 'Objet : confirmation de votre rendez-vous', '', 'Madame, Monsieur,', '', 'Nous vous confirmons votre rendez-vous du jeudi 12 novembre à 14 h 30 dans nos locaux.', 'Merci de vous munir d’une pièce d’identité, de votre dernier avis d’imposition', 'et de l’ensemble des justificatifs listés dans le courrier précédent.', '', 'Si vous ne pouvez pas vous présenter, prévenez-nous au moins deux jours à l’avance', 'afin que nous puissions proposer ce créneau à une autre personne.', '', 'Nous restons à votre disposition pour toute question complémentaire et vous prions', 'd’agréer, Madame, Monsieur, l’expression de nos salutations distinguées.', '', 'Jean Dupont'],
    ['Annexe 1 : liste des pièces à fournir', '', '1. Pièce d’identité en cours de validité (recto et verso)', '2. Justificatif de domicile de moins de trois mois', '3. Dernier avis d’imposition sur le revenu', '4. Trois derniers bulletins de salaire', '5. Relevé d’identité bancaire au nom du demandeur', '6. Le formulaire de demande, daté et signé', '', 'Les copies doivent être lisibles : un texte flou ou coupé peut entraîner un rejet', 'du dossier. Les originaux ne sont pas conservés et vous sont rendus sur place.'],
    ['Annexe 2 : conditions générales', '', 'Article 1. Le présent document fixe les conditions dans lesquelles le cabinet', 'traite les dossiers qui lui sont confiés.', '', 'Article 2. Les informations recueillies sont utilisées pour le seul traitement', 'du dossier et conservées pendant la durée légale.', '', 'Article 3. Toute réclamation doit être adressée par écrit à l’adresse du cabinet', 'dans un délai de trente jours à compter de la réception du présent courrier.', '', 'Article 4. Le droit français est seul applicable.'],
  ];
  for (const [i, lines] of letters.entries()) out[`pdf-scan-${i + 1}.jpg`] = await encode(scannedLetter(lines, 20 + i), 'image/jpeg', 0.85);

  return out;
}
