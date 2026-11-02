Fichiers de test pour Oblitero
==============================

Regenerer : node scripts/make-test-files.mjs <dossier>   (depuis le depot oblitero)
Les images (JPEG, WebP, PNG) sont dessinees par le Chromium de Playwright.

Tout est fictif : les noms, IBAN, cartes et numeros sont inventes.


fusion/        Plusieurs PDF sur le meme ecran
------------------------------------------------
fusion-A.pdf, fusion-B.pdf, fusion-C.pdf
    Deux pages chacune : fond rouge (A1 A2), vert (B1 B2), bleu (C1 C2).
    Depose-les ensemble, passe en vue Files, reordonne les lignes, cache-en
    un, ouvre ses pages, puis reviens a Files : l'ordre des pages du resultat
    est celui de l'ecran. Depose aussi une photo du dossier images avec eux.


pages/         Pages : un PDF, ses pages, ses outils
-----------------------------------------------------
simple-1-page.pdf
    Une page. Rotate, Move, Hide doivent se desactiver a bon escient.

120-pages.pdf
    120 pages numerotees. Les miniatures se dessinent au defilement.
    Clic page 10, Maj+clic page 30 : 21 pages selectionnees.
    "Cut every 10 pages" puis Download parts : un ZIP de 12 fichiers.

lot-de-3-factures.pdf
    9 pages : trois factures de trois pages (rouge, verte, bleue).
    "Cut every 3 pages" : trois parties, une par facture.

formats-mixtes.pdf
    A4 portrait, A4 paysage, Letter, A3, 200x200, 300x1200.
    Les miniatures gardent leurs proportions.

pages-tournees.pdf
    Quatre pages avec /Rotate 0, 90, 180, 270 et le mot HAUT.
    Pivote, caviarde, telecharge : chaque page reste dans son sens.

contrat-donnees-sensibles.pdf
    3 pages avec faux IBAN, telephone, email, numero de securite sociale, carte.
    Titre "Contrat Dupont CONFIDENTIEL", auteur "Jean Dupont".
    Cas principal de Redact et de Find and redact.

banc-essai-caviardage.pdf
    Le meme mot SECRET dans plusieurs polices et tailles, un texte minuscule,
    un texte a 45 degres, un texte BLANC invisible, du texte colle aux bords,
    deux textes superposes. Tout ce qui est sous un rectangle doit disparaitre.

images-et-vecteurs.pdf
    Image PNG en degrade, rectangle, cercle transparent, ligne.
    Apres un caviardage, le reste de la page reste fidele.

liens-et-formulaire.pdf
    Page 1 : lien, champ texte "Jean Dupont", case a cocher. Page 2 : un lien.
    Caviarde la page 1 : liens et champs disparaissent. La page 2 garde son lien.

formulaire-a-remplir.pdf
    Une attestation SANS champ actif : lignes a remplir, cases, cadre de signature.
    Cas de "Add text" (nom, date, croix) et de "Sign".

formulaire-champs.pdf
    Deux pages avec de vrais champs : texte (avec un nom lisible), texte sur
    plusieurs lignes, case a cocher, boutons radio, liste deroulante, liste a
    choix, un champ en lecture seule et un bouton. "Fill form" les liste et les
    remplit ; les valeurs sont ecrites sur les pages du PDF telecharge, plus
    aucun champ n'y reste. Le bouton est signale comme non remplissable.

scan-avec-dos-blancs.pdf
    8 pages-images : texte, blanc pur, texte, blanc avec bruit de scanner, texte,
    blanc avec 3 poussieres, texte, page avec un petit tampon (vrai contenu).
    "Hide blank pages" cache les pages 2, 4 et 6 et garde la 8.

scan-image-seule.pdf
    Deux pages qui ne sont qu'une image (comme un scan). Pas de texte a extraire :
    Find and redact et Extract text le signalent.

rapport-10-pages.pdf
    Une couverture et 9 chapitres de texte.
    Numbers and watermark : saute la couverture (premier numero 1 a la page 2).

deux-colonnes.pdf
    Deux pages en deux colonnes avec un tableau. Extract text : titre, colonne
    de gauche, colonne de droite, puis le tableau ligne par ligne.

deux-colonnes-entrelacees.pdf
    Une page en deux colonnes dont le texte est dessine ligne par ligne, une
    ligne a gauche (G1, G2...), une a droite (D1, D2...). Extract text lit la
    colonne de gauche en entier, puis celle de droite : G1 a G12, puis D1 a D12.

metadonnees.pdf
    Titre, auteur, sujet, mots-cles, createur, producteur, dates, tous marques
    METADONNEE-. Apres telechargement, seul "Oblitero" reste.

proprietes-riches.pdf
    Piece jointe, script, signets, calque cache, commentaire, lien, champ de
    formulaire, XMP, metadonnees. Properties : le rapport liste tout ;
    le telechargement n'emporte rien du niveau document.

page-geante.pdf
    Une page de 14400 x 14400 points (la limite des lecteurs).
    Caviarder et telecharger : la resolution est reduite automatiquement.

accents-et-symboles.pdf
    Accents, oe, euro, livre, copyright, guillemets francais et anglais.


images/        Photos et captures, deposees avec ou sans PDF
----------------------------------------------------------------
ordre-1.png a ordre-5.png
    Cinq tuiles numerotees (paysage, portrait, paysage...). Depose-les, change
    l'ordre dans Files, regarde le PDF : les pages suivent la liste. Essaie
    "Fit", A4 et Letter, avec et sans marge (panneau Result, section Photos).

photo-paysage.jpg, photo-portrait.jpg
    Photos de 3000 x 2000 px, lourdes.

photo-telephone-couchee.jpg
    Photo de telephone enregistree couchee avec le drapeau EXIF 6.
    Le mot HAUT doit etre lisible, en haut, dans la vignette et dans le PDF.

photo.webp
    Un format que le PDF ne connait pas : converti en JPEG.

capture-ecran.png
    Une capture d'ecran (aplats, texte). Devient une page nette.

logo-transparent.png
    PNG avec transparence : le fond devient blanc dans le PDF.

gris.png, minuscule.png
    Un PNG en niveaux de gris, une image de 16 x 16 px.

tres-grande-photo.jpg
    6000 x 4000 px (24 millions de pixels) : observe le temps et la memoire.

faux-image.jpg, vide.png
    A refuser avec un message : texte renomme en .jpg, fichier de 0 octet.


compression/   Compression (panneau Result) : de quoi voir l'avant et l'apres
------------------------------------------------------------------------
album-photos.pdf
    3 pages, une grosse photo chacune. Le cas ideal : Balanced et Strong divisent
    le poids. Choisis un niveau, clique "See before and after", fais glisser la
    ligne de comparaison pour voir ce qui est perdu.

rapport-photo-et-texte.pdf
    Du texte et une photo par page. Le texte doit rester net (il n'est pas touche),
    seule la photo change.

scan-courrier-jpeg.pdf
    3 pages de courrier scanne en JPEG. Cas difficile : a Strong, le texte
    devient flou. C'est la qu'on juge le niveau Balanced.

photo-deja-compacte.pdf
    Une petite photo deja tres compressee : le message dit qu'il n'y a pas
    d'economie.

scan-gris-jpeg.pdf   (si le systeme sait ecrire un JPEG gris, macOS)
    Un JPEG en niveaux de gris : pris en charge.

png-et-vectoriel-sans-gain.pdf
    Aucun JPEG : le message dit que le fichier est deja compact.


signature/     Sign : images de signature a importer
-----------------------------------------------------
signature-scan.png, signature-scan.jpg
    Une signature sur papier gris (un scan). "Upload" rend le papier transparent.

signature-transparente.png
    La meme idee sans papier : elle est deja transparente.

Utilise-les avec formulaire-a-remplir.pdf (dossier pages).


a-refuser/     Fichiers que chaque outil doit refuser avec un message
----------------------------------------------------------------------
chiffre-mot-de-passe-secret.pdf   vrai PDF chiffre (mot de passe : secret)
tronque.pdf                       PDF coupe a 60 %
pas-un-pdf.pdf                    texte avec extension .pdf
vide.pdf                          0 octet
    Le document deja ouvert ne doit pas etre modifie par un refus.
