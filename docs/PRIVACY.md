# Oblitero - Privacy policy

Last updated: 2026-11-05

This policy is in English, then in French (below). Both say the same thing.

## Summary

**No data ever leaves your computer.** Oblitero has no server, no account, no telemetry, no usage analytics, no advertising, and runs no downloaded code. It asks for no permission.

## What the extension does

When you click its icon, Oblitero opens a page of its own. You give it PDF files and pictures, it lets you organize and change them, and it gives you a new file back.

## Data handled

- **The files you open** (PDF, JPEG, PNG, WebP), which may hold personal or confidential information, and what you add to them: redactions, signatures, text, form values, properties. They are read and changed inside the open tab, in memory. They are never written anywhere by Oblitero, and they are gone when you close or reload the tab, signatures included.
- **Your language**, only if you choose one in the picker: kept in the extension's `localStorage`, on your computer.
- **About Oblitero itself**: the last version whose news you saw, and a count of the results you downloaded, so that a review is asked for at most twice. Kept in the extension's IndexedDB, on your computer; nothing about your files, and never sent.

Oblitero does not read your tabs, your pages, your browsing history or your clipboard. It sets no cookie and has no identifier of you or of your device.

## Files you save

When you download a result, the browser writes the file to your downloads folder, like any download. What you do with it then is your responsibility. A redacted page becomes a picture in that file, and the file does not carry the title, author and other properties of the source unless you write them.

## Sharing

None. Oblitero does not send, sell, share or transfer any data to anyone.

## Permissions used

None. The `permissions` list of `manifest.json` is empty, and the extension has no access to any website.

## Check it yourself

"No data leaves your computer" is enforced by the browser, not only promised.

- **The policy.** `manifest.json` carries a content security policy: scripts, styles, connections and images come from the extension itself, images may also be a `data:` or a `blob:` address, and frames and form targets are forbidden.
- **The proof.** `test/e2e/privacy.e2e.mjs` tries each channel (fetch, XHR, WebSocket, EventSource, beacon, image, stylesheet, font, media, object, worker, frame, form and more) from the page and from the service worker against a local server, and fails if the server receives a request. The same attempts from an ordinary web page do reach it, so the test cannot pass by accident. `manifest.test.js` fails if the code gains a permission, a network API or a remote address.
- **By hand.** Open the page, press F12 and watch the Network tab while you work: it should list only `chrome-extension://`, `data:` and `blob:` addresses.
- **One link.** The top of the page has a *Support Oblitero* link. It is an ordinary link that opens https://kodetix.fr/oblitero/soutenir in a new tab when you click it: Oblitero sends nothing, and nothing is loaded before the click. A test allows this one address in the code, and no other.
- **What a policy cannot stop.** For `<link rel="preconnect">` and for the navigation of a frame, the browser opens a bare connection to the host before it checks any policy, and no request follows. Oblitero's code has neither, and a test fails if it gains one.

## Changes

Any change to this policy will be dated above. Oblitero will remain local: a change that would send data off the device would be announced before it ships.

## Contact

Questions about this policy: support@kodetix.fr.

---

# Oblitero - Politique de confidentialité

Dernière mise à jour : 2026-11-05

## Résumé

**Aucune donnée ne quitte jamais ton ordinateur.** Oblitero n'a ni serveur, ni compte, ni télémétrie, ni mesure d'audience, ni publicité, et n'exécute aucun code téléchargé. L'extension ne demande aucune permission.

## Ce que fait l'extension

Quand tu cliques sur son icône, Oblitero ouvre une page qui lui est propre. Tu lui donnes des PDF et des images, tu les organises et les modifies, et elle te rend un nouveau fichier.

## Données traitées

- **Les fichiers que tu ouvres** (PDF, JPEG, PNG, WebP), qui peuvent contenir des informations personnelles ou confidentielles, et ce que tu y ajoutes : caviardages, signatures, texte, valeurs de formulaire, propriétés. Ils sont lus et modifiés dans l'onglet ouvert, en mémoire. Oblitero ne les écrit nulle part, et ils disparaissent quand tu fermes ou recharges l'onglet, signatures comprises.
- **Ta langue**, seulement si tu en choisis une dans le sélecteur : gardée dans le `localStorage` de l'extension, sur ton ordinateur.
- **Sur Oblitero lui-même** : la dernière version dont tu as vu les nouveautés, et le nombre de résultats téléchargés, pour qu'un avis ne soit demandé que deux fois au plus. Gardés dans l'IndexedDB de l'extension, sur ton ordinateur ; rien sur tes fichiers, et jamais envoyés.

Oblitero ne lit ni tes onglets, ni tes pages, ni ton historique, ni ton presse-papiers. L'extension ne pose aucun cookie et n'a aucun identifiant de toi ou de ton appareil.

## Fichiers que tu enregistres

Quand tu télécharges un résultat, le navigateur écrit le fichier dans ton dossier de téléchargements, comme tout téléchargement. Ce que tu en fais ensuite est de ta responsabilité. Une page caviardée devient une image dans ce fichier, et le fichier ne porte ni le titre, ni l'auteur, ni les autres propriétés de la source, sauf si tu les écris.

## Partage

Aucun. Oblitero n'envoie, ne vend, ne partage et ne transfère aucune donnée à qui que ce soit.

## Permissions utilisées

Aucune. La liste `permissions` de `manifest.json` est vide, et l'extension n'a accès à aucun site.

## Vérifie par toi-même

« Aucune donnée ne quitte ton ordinateur » est imposé par le navigateur, pas seulement promis.

- **La politique.** `manifest.json` porte une politique de sécurité du contenu : les scripts, les styles, les connexions et les images viennent de l'extension elle-même, les images peuvent aussi être une adresse `data:` ou `blob:`, et les cadres et les cibles de formulaire sont interdits.
- **La preuve.** `test/e2e/privacy.e2e.mjs` essaie chaque canal (fetch, XHR, WebSocket, EventSource, beacon, image, feuille de style, police, média, objet, worker, cadre, formulaire et d'autres) depuis la page et depuis le service worker vers un serveur local, et échoue si le serveur reçoit une requête. Les mêmes essais depuis une page web ordinaire l'atteignent bien : le test ne peut pas réussir par accident. `manifest.test.js` échoue si le code gagne une permission, une API réseau ou une adresse distante.
- **À la main.** Ouvre la page, appuie sur F12 et regarde l'onglet Réseau pendant que tu travailles : il ne doit lister que des adresses `chrome-extension://`, `data:` et `blob:`.
- **Un lien.** Le haut de la page a un lien *Soutenir Oblitero*. C'est un simple lien qui ouvre https://kodetix.fr/oblitero/soutenir dans un nouvel onglet quand tu cliques : Oblitero n'envoie rien, et rien n'est chargé avant le clic. Un test autorise cette seule adresse dans le code, et aucune autre.
- **Ce qu'une politique ne peut pas arrêter.** Pour `<link rel="preconnect">` et pour la navigation d'un cadre, le navigateur ouvre une connexion nue vers l'hôte avant de vérifier toute politique, et aucune requête ne suit. Le code d'Oblitero n'a ni l'un ni l'autre, et un test échoue s'il en gagne un.

## Modifications

Toute modification de cette politique sera datée ci-dessus. Oblitero restera local : un changement qui enverrait des données hors de l'appareil serait annoncé avant sa sortie.

## Contact

Questions sur cette politique : support@kodetix.fr.
