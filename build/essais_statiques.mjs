/*
 * Épreuves statiques : ce qui se vérifie sans navigateur.
 *
 *     node build/essais_statiques.mjs
 *
 * - la liste du service worker est exactement celle des fichiers que la page charge ;
 * - la version est la même dans sw.js, index.html et data/manifeste.json ;
 * - chaque fichier de la liste existe ; le guide et la carte se tiennent ;
 * - le manifeste et la page de confidentialité ont ce que demande le Play Store ;
 * - aucune adresse extérieure dans le code, aucun style en ligne.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const RACINE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
let reussis = 0;
const echecs = [];
function verifier(nom, condition, detail) {
  if (condition) reussis += 1; else echecs.push(nom + (detail ? ' — ' + detail : ''));
}

const sw = lire('sw.js');
const index = lire('index.html');
const version = /const VERSION = '([^']+)'/.exec(sw)[1];
const liste = Function('return ' + /const FICHIERS = (\[[\s\S]*?\]);/.exec(sw)[1])();

verifier('version identique dans index.html', index.includes('name="application-version" content="' + version + '"'));
const manifesteDonnees = JSON.parse(lire('data/manifeste.json'));
verifier('version identique dans data/manifeste.json', manifesteDonnees.version === version, manifesteDonnees.version);

for (const f of liste) {
  if (f === './') continue;
  verifier('fichier présent : ' + f, fs.existsSync(path.join(RACINE, f)));
}
const charges = new Set(['./', 'index.html', 'confidentialite.html', 'manifest.webmanifest', 'data/manifeste.json', 'data/guide.json']);
for (const m of index.matchAll(/(?:src|href)="([^"#?]+\.(?:js|css|png))"/g)) charges.add(m[1]);
for (const f of fs.readdirSync(path.join(RACINE, 'data', 'carte'))) charges.add('data/carte/' + f);
const man = JSON.parse(lire('manifest.webmanifest'));
for (const i of man.icons) charges.add(i.src);
for (const f of charges) verifier('dans la coquille : ' + f, liste.includes(f));
for (const f of liste) verifier('chargé par la page : ' + f, charges.has(f));

/* le manifeste d'application */
verifier('manifeste : nom court ≤ 12 signes', man.short_name.length <= 12);
verifier('manifeste : display standalone', man.display === 'standalone');
verifier('manifeste : icône 512', man.icons.some((i) => i.sizes === '512x512' && i.purpose === 'any'));
verifier('manifeste : icône masquable', man.icons.some((i) => i.purpose === 'maskable'));
verifier('manifeste : start_url et scope', man.start_url === './' && man.scope === './');

/* sécurité et vie privée */
verifier('politique de sécurité stricte', index.includes("connect-src 'self'") && index.includes("script-src 'self'"));
for (const f of fs.readdirSync(path.join(RACINE, 'js'))) {
  const code = lire('js/' + f);
  verifier('aucune adresse extérieure dans js/' + f, !/https?:\/\/(?!www\.w3\.org)/.test(code));
  verifier('aucun innerHTML dans js/' + f, !/innerHTML|insertAdjacentHTML|document\.write/.test(code));
}
verifier('aucun attribut style dans index.html', !/\sstyle="/.test(index));
const confidentialite = lire('confidentialite.html');
verifier('confidentialité : aucune donnée collectée', confidentialite.includes('Aucune donnée'));
verifier('confidentialité : contact', /@/.test(confidentialite));
verifier('mention sanitaire', lire('js/reglages.js').includes('dangereux pour la santé') && lire('js/vins.js').includes('dangereux pour la santé'));

/* le guide */
const guide = JSON.parse(lire('data/guide.json'));
const plan = fs.readFileSync(path.join(RACINE, 'build', 'plan-appellations.txt'), 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#'));
verifier('toutes les appellations du plan', guide.appellations.length === plan.length, guide.appellations.length + ' / ' + plan.length);
verifier('14 régions', guide.regions.length === 14);
verifier('cépages', guide.cepages.length >= 95, String(guide.cepages.length));
verifier('plats', guide.plats.length >= 200, String(guide.plats.length));
verifier('18 zones de millésimes', guide.millesimes.length === 18, String(guide.millesimes.length));
for (const z of guide.millesimes) verifier('36 années pour ' + z.id, z.annees.length === 36, String(z.annees.length));
verifier('fiches de guide', guide.guide.length >= 150, String(guide.guide.length));
const idsA = new Set(guide.appellations.map((a) => a.id));
const idsC = new Set(guide.cepages.map((c) => c.id));
const idsG = new Set(guide.guide.map((g) => g.id));
const idsP = new Set(guide.plats.map((p) => p.id));
const idsR = new Set(guide.regions.map((r) => r.id));
const ensembles = { a: idsA, c: idsC, g: idsG, p: idsP, r: idsR };
let renvois = 0;
let casses = 0;
JSON.stringify(guide).replace(/\[\[([acrpg]):([^\]|]+)/g, (tout, t, id) => { renvois += 1; if (!ensembles[t].has(id)) casses += 1; return tout; });
verifier('aucun renvoi cassé (' + renvois + ' renvois)', casses === 0, String(casses));
verifier('aucune marque brute [[…]] non résolue', !/\[\[[a-z][a-z-]/.test(JSON.stringify(guide)));
for (const a of guide.appellations) {
  if (!a.def || !a.texte.length || !a.sty.length || !a.coul.length) echecs.push('appellation incomplète : ' + a.id);
  else reussis += 1;
}
for (const p of guide.plats) {
  if (!p.conseil || p.vins.length < 2) echecs.push('plat incomplet : ' + p.id); else reussis += 1;
}

/* la carte */
const fond = JSON.parse(lire('data/carte/fond.json'));
verifier('fond : 96 départements', fond.departements.length === 96, String(fond.departements.length));
verifier('fond : villes', fond.villes.length > 200, String(fond.villes.length));
let traces = 0;
for (const r of guide.regions) {
  const f = path.join(RACINE, 'data', 'carte', r.id + '.json');
  if (!fs.existsSync(f)) { echecs.push('carte absente : ' + r.id); continue; }
  const c = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const a of c.appellations) {
    traces += 1;
    if (!idsA.has(a.id)) echecs.push('tracé sans fiche : ' + a.id);
    if (!a.g && !a.meme) echecs.push('tracé vide : ' + a.id);
  }
  verifier('emprise de région : ' + r.id, !!fond.regions[r.id]);
}
const attendus = guide.appellations.filter((a) => a.trace).length;
verifier('un tracé par appellation qui en attend un', traces === attendus, traces + ' / ' + attendus);

/* la lecture d'une étiquette : le texte rapproché des noms du guide */
{
  const monde = { console };
  monde.window = monde;
  vm.createContext(monde);
  vm.runInContext(lire('js/outils.js'), monde);
  vm.runInContext(lire('js/lecture.js'), monde);
  const lu = (texte) => monde.Lecture.lire(texte, guide);
  const premiere = (texte) => (lu(texte).appellations[0] || { f: {} }).f.id;
  let r = lu('Domaine Weinbach\nRiesling Grand Cru Schlossberg 2019\nMis en bouteille au domaine depuis 1898');
  verifier('lecture : grand cru d’Alsace', r.appellations[0] && r.appellations[0].f.id === 'alsace-grand-cru-schlossberg', JSON.stringify(r.appellations.map((a) => a.f.id)));
  verifier('lecture : région', r.region === 'alsace', r.region);
  verifier('lecture : millésime le plus récent', r.annee === 2019, String(r.annee));
  verifier('lecture : cépage', r.cepages.some((c) => c.f.id === 'riesling'));
  verifier('lecture : producteur', r.nom === 'Domaine Weinbach', r.nom);
  verifier('lecture : sans accents ni majuscules', premiere('CHATEAUNEUF DU PAPE 2016') === 'chateauneuf-du-pape', premiere('CHATEAUNEUF DU PAPE 2016'));
  verifier('lecture : une lettre mal lue', premiere('Chateauneut-du-Pape') === 'chateauneuf-du-pape', premiere('Chateauneut-du-Pape'));
  verifier('lecture : le nom le plus long l’emporte', premiere('Côtes du Rhône Villages') === 'cotes-du-rhone-villages', premiere('Côtes du Rhône Villages'));
  r = lu('Grand vin de la vallée du Rhône');
  verifier('lecture : région seule', r.region === 'rhone' && !r.appellations.length, r.region);
  r = lu('Cuvée du patron, vin rouge, 13 % vol.');
  verifier('lecture : rien d’inventé', !r.appellations.length && !r.region && r.annee === null, JSON.stringify(r.appellations.map((a) => a.f.id)));
  verifier('confidentialité : l’album reste dans l’appareil', confidentialite.includes('album'));
  verifier('les images de l’album peuvent s’afficher', /img-src [^;]*blob:/.test(index));
}

console.log(reussis + ' vérifications réussies' + (echecs.length ? ', ' + echecs.length + ' échec(s) :' : '.'));
for (const e of echecs) console.log('  ✗ ' + e);
process.exit(echecs.length ? 1 : 0);
