/*
 * Construit data/guide.json à partir des fichiers de contenu de build/.
 *
 *     node build/construire.mjs            construit, et dit ce qui cloche
 *     node build/construire.mjs --strict   échoue au moindre avertissement
 *
 * Le format des fichiers est décrit dans build/format.txt. Ce script :
 *   - lit les fiches (régions, appellations, cépages, accords, millésimes, guide) ;
 *   - vérifie chaque fiche contre les plans (plan-appellations.txt, plan-cepages.txt),
 *     les listes fermées (niveaux, couleurs, styles, familles, rubriques) et les renvois ;
 *   - met la typographie au propre (apostrophes courbes, espaces insécables) ;
 *   - résout les renvois [[id]] en [[t:id]] (a = appellation, c = cépage, g = guide,
 *     r = région, p = plat) : l'application n'a plus qu'à les suivre ;
 *   - écrit data/guide.json et data/manifeste.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BUILD = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.dirname(BUILD);
const STRICT = process.argv.includes('--strict');

const avertissements = [];
const avertir = (ou, quoi) => avertissements.push(ou + ' : ' + quoi);

/* ————— les listes fermées ————— */

export const REGIONS = ['alsace', 'beaujolais', 'bordeaux', 'bourgogne', 'champagne', 'corse', 'jura',
  'languedoc', 'loire', 'provence', 'rhone', 'roussillon', 'savoie-bugey', 'sud-ouest'];

export const STYLES = [
  ['blanc-vif', 'Blanc sec et vif', 'Léger, tendu, désaltérant : Muscadet, Sancerre, Chablis, Picpoul de Pinet.'],
  ['blanc-aromatique', 'Blanc sec aromatique', 'Très parfumé : riesling, gewurztraminer, muscat sec, viognier.'],
  ['blanc-ample', 'Blanc sec ample', 'Riche, souvent élevé en fût : Meursault, Hermitage blanc, Pessac-Léognan.'],
  ['blanc-moelleux', 'Blanc demi-sec ou moelleux', 'Tendre, d’une douceur légère : Vouvray demi-sec, Jurançon, Coteaux du Layon.'],
  ['liquoreux', 'Blanc liquoreux', 'Très doux et concentré : Sauternes, sélections de grains nobles, vins de paille.'],
  ['rose-leger', 'Rosé léger', 'Pâle et frais : Côtes de Provence, Rosé de Loire.'],
  ['rose-vineux', 'Rosé de repas', 'Coloré et structuré : Tavel, Bandol, Rosé des Riceys.'],
  ['rouge-leger', 'Rouge léger et fruité', 'Peu tannique, à boire frais : Beaujolais, gamays de Loire, poulsard.'],
  ['rouge-souple', 'Rouge souple', 'De corps moyen : Chinon, Côtes du Rhône, bourgognes de village.'],
  ['rouge-elegant', 'Rouge fin et de garde', 'La finesse avant la puissance : grands bourgognes, Côte Rôtie, Margaux.'],
  ['rouge-charpente', 'Rouge charpenté', 'Tannique et puissant : Pauillac, Madiran, Cahors, Cornas, Bandol.'],
  ['rouge-solaire', 'Rouge généreux du Midi', 'Chaleureux et épicé : Châteauneuf-du-Pape, Gigondas, Languedoc, Roussillon.'],
  ['effervescent-brut', 'Effervescent brut', 'Bulles sèches : Champagne, crémants.'],
  ['effervescent-doux', 'Effervescent doux', 'Bulles douces et légères : Clairette de Die, Cerdon.'],
  ['vdn-blanc', 'Vin doux naturel blanc', 'Muscats et blancs mutés : Muscat de Rivesaltes, Beaumes-de-Venise.'],
  ['vdn-rouge', 'Vin doux naturel rouge ou ambré', 'Banyuls, Maury, Rasteau, Rivesaltes.'],
  ['vin-jaune', 'Vin jaune et oxydatif', 'Sec, élevé sous voile : vin jaune, Château-Chalon.'],
  ['vin-de-liqueur', 'Vin de liqueur', 'Moût muté à l’eau-de-vie : Pineau des Charentes, Floc de Gascogne, Macvin du Jura.'],
];

export const FAMILLES = [
  ['aperitif', 'Apéritif'], ['entrees', 'Entrées'], ['charcuterie', 'Charcuterie'],
  ['coquillages-crustaces', 'Coquillages et crustacés'], ['poissons', 'Poissons'], ['volailles', 'Volailles'],
  ['viandes-blanches', 'Viandes blanches'], ['viandes-rouges', 'Viandes rouges'], ['gibier', 'Gibier'],
  ['abats', 'Abats'], ['legumes', 'Légumes et plats végétariens'], ['pates-riz-oeufs', 'Pâtes, riz et œufs'],
  ['cuisines-du-monde', 'Cuisines du monde'], ['fromages', 'Fromages'], ['desserts', 'Desserts'],
];

export const RUBRIQUES = [
  ['etiquette', 'Lire une étiquette'], ['classements', 'Classements'], ['service', 'Servir et accorder'],
  ['conservation', 'Conserver'], ['degustation', 'Déguster'], ['vinification', 'Faire le vin'], ['lexique', 'Lexique'],
];

const NIVEAUX = ['régionale', 'sous-régionale', 'communale', 'cru', 'grand cru', 'IGP'];
const COULEURS = ['rouge', 'rosé', 'blanc', 'effervescent', 'moelleux', 'liquoreux', 'vin doux naturel',
  'vin jaune', 'vin de paille', 'vin de liqueur'];
const ETATS = ['garder', 'boire', 'apogee', 'passe'];
const ANNEES = [];
for (let a = 2025; a >= 1990; a -= 1) ANNEES.push(a);

/* ————— lecture ————— */

function lireFiches(dossierOuFichier) {
  const chemin = path.join(BUILD, dossierOuFichier);
  if (!fs.existsSync(chemin)) return [];
  const fichiers = fs.statSync(chemin).isDirectory()
    ? fs.readdirSync(chemin).filter((f) => f.endsWith('.txt')).sort().map((f) => path.join(chemin, f))
    : [chemin];
  const fiches = [];
  for (const fichier of fichiers) {
    const nomFichier = path.relative(BUILD, fichier).replace(/\\/g, '/');
    let fiche = null;
    const lignes = fs.readFileSync(fichier, 'utf8').replace(/^﻿/, '').split(/\r?\n/);
    lignes.forEach((ligne, n) => {
      const l = ligne.trim();
      if (!l || l.startsWith('#')) return;
      if (l.startsWith('@')) {
        fiche = { id: l.slice(1).trim(), fichier: nomFichier, champs: [] };
        fiches.push(fiche);
        return;
      }
      const m = /^([a-zà-ÿ0-9_-]+)\s*:\s?(.*)$/i.exec(l);
      if (!m || !fiche) { avertir(nomFichier + ':' + (n + 1), 'ligne illisible « ' + l.slice(0, 60) + ' »'); return; }
      fiche.champs.push([m[1].toLowerCase(), m[2].trim()]);
    });
  }
  return fiches;
}

const un = (fiche, cle) => { const c = fiche.champs.find((x) => x[0] === cle); return c ? c[1] : ''; };
const tous = (fiche, cle) => fiche.champs.filter((x) => x[0] === cle).map((x) => x[1]).filter(Boolean);
const liste = (texte) => String(texte || '').split(',').map((s) => s.trim()).filter(Boolean);
const ou = (fiche) => fiche.fichier + ' @' + fiche.id;

function lirePlan(nom) {
  return fs.readFileSync(path.join(BUILD, nom), 'utf8').split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith('#')).map((l) => l.split('|').map((s) => s.trim()));
}

/* ————— typographie ————— */

function typo(texte) {
  if (!texte) return texte;
  let t = String(texte).replace(/\s+/g, ' ').trim();
  t = t.replace(/'/g, '’');
  t = t.replace(/« ?/g, '« ').replace(/ ?»/g, ' »');
  t = t.replace(/ ([;!?])/g, ' $1').replace(/ :/g, ' :');
  t = t.replace(/(\d) (ha|hl|km|m|%|°C|ans?|cl|l|g)\b/g, '$1 $2');
  t = t.replace(/(\d) (\d{3})\b/g, '$1 $2');
  t = t.replace(/\b([XVI]+)e\b/g, '$1ᵉ').replace(/\b(\d+)e\b/g, '$1ᵉ').replace(/\b1er\b/g, '1ᵉʳ');
  return t;
}

/* ————— assemblage ————— */

const planApp = lirePlan('plan-appellations.txt');   // région | id | nom | signe | tracé | deps | officiel
const planCep = lirePlan('plan-cepages.txt');        // id | nom | couleur
const idsApp = new Set(planApp.map((l) => l[1]));
const idsCep = new Set(planCep.map((l) => l[0]));
const idsStyle = new Set(STYLES.map((s) => s[0]));

const fRegions = lireFiches('regions');
const fApp = lireFiches('appellations');
const fCep = lireFiches('cepages');
const fPlats = lireFiches('accords');
const fMil = lireFiches('millesimes.txt');
const fGuide = lireFiches('guide');

const idsGuide = new Set(fGuide.map((f) => f.id));
const idsPlat = new Set(fPlats.map((f) => f.id));

/* Un renvoi [[id]] ou [[id|libellé]] devient [[t:id]] ou [[t:id|libellé]] ; un
 * renvoi vers rien retombe en texte simple, et le dit. */
function renvois(texte, lieu) {
  if (!texte) return texte;
  return texte.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (tout, cible, libelle) => {
    let id = cible.trim();
    let t = null;
    if (id.startsWith('region:')) { id = id.slice(7).trim(); t = REGIONS.includes(id) ? 'r' : null; }
    else if (idsApp.has(id)) t = 'a';
    else if (idsCep.has(id)) t = 'c';
    else if (idsGuide.has(id)) t = 'g';
    else if (idsPlat.has(id)) t = 'p';
    if (!t) {
      avertir(lieu, 'renvoi vers rien « ' + cible + ' »');
      return libelle ? libelle.trim() : id.replace(/-/g, ' ');
    }
    return '[[' + t + ':' + id + (libelle ? '|' + libelle.trim() : '') + ']]';
  });
}
const prose = (texte, lieu) => typo(renvois(texte, lieu));

function unique(fiches, quoi) {
  const vus = new Set();
  return fiches.filter((f) => {
    if (vus.has(f.id)) { avertir(ou(f), quoi + ' en double'); return false; }
    vus.add(f.id);
    return true;
  });
}

/* Régions */
const regions = [];
for (const id of REGIONS) {
  const f = fRegions.find((x) => x.id === id);
  if (!f) { avertir('regions', 'fiche manquante : ' + id); continue; }
  const sous = tous(f, 'sous').map((s) => {
    const i = s.indexOf('=');
    return i === -1 ? [typo(s), ''] : [typo(s.slice(0, i)), prose(s.slice(i + 1), ou(f))];
  });
  regions.push({
    id, nom: typo(un(f, 'nom')), def: prose(un(f, 'def'), ou(f)), chiffres: typo(un(f, 'chiffres')),
    climat: prose(un(f, 'climat'), ou(f)), sols: prose(un(f, 'sols'), ou(f)),
    cep: liste(un(f, 'cepages')).filter((c) => idsCep.has(c) || (avertir(ou(f), 'cépage inconnu ' + c), false)),
    sous, texte: tous(f, 'texte').map((t) => prose(t, ou(f))),
  });
}
const sousDe = new Map(regions.map((r) => [r.id, new Set(r.sous.map((s) => s[0]))]));

/* Appellations */
const appellations = [];
const parIdApp = new Map(unique(fApp, 'appellation').map((f) => [f.id, f]));
for (const [region, id, nomPlan, signe, trace] of planApp) {
  const f = parIdApp.get(id);
  if (!f) { avertir('appellations', 'fiche manquante : ' + id + ' (' + region + ')'); continue; }
  const lieu = ou(f);
  const niveau = un(f, 'niveau');
  if (!NIVEAUX.includes(niveau)) avertir(lieu, 'niveau inconnu « ' + niveau + ' »');
  const couleurs = liste(un(f, 'couleurs')).filter((c) => COULEURS.includes(c) || (avertir(lieu, 'couleur inconnue « ' + c + ' »'), false));
  const styles = liste(un(f, 'styles')).filter((s) => idsStyle.has(s) || (avertir(lieu, 'style inconnu « ' + s + ' »'), false));
  const cepages = liste(un(f, 'cepages')).map((c) => {
    const principal = c.endsWith('*');
    const idc = c.replace(/\*$/, '').trim();
    if (!idsCep.has(idc)) { avertir(lieu, 'cépage inconnu « ' + idc + ' »'); return null; }
    return principal ? [idc, 1] : [idc];
  }).filter(Boolean);
  const sous = typo(un(f, 'sous'));
  if (sousDe.has(region) && !sousDe.get(region).has(sous)) avertir(lieu, 'sous-région non déclarée dans la région : « ' + sous + ' »');
  if (!un(f, 'def') || !tous(f, 'texte').length) avertir(lieu, 'def ou texte manquant');
  if (!styles.length) avertir(lieu, 'aucun style');
  appellations.push({
    id, nom: typo(un(f, 'nom') || nomPlan), r: region, sous, niv: NIVEAUX.includes(niveau) ? niveau : (signe === 'IGP' ? 'IGP' : 'communale'),
    signe, trace: trace === '-' ? 0 : 1,
    coul: couleurs, sty: styles, cep: cepages,
    surf: typo(un(f, 'surface')), dep: un(f, 'depuis'),
    def: prose(un(f, 'def'), lieu), texte: tous(f, 'texte').map((t) => prose(t, lieu)),
    gout: typo(un(f, 'gout')), garde: typo(un(f, 'garde')), serv: typo(un(f, 'service')), crus: typo(un(f, 'crus')),
    voir: liste(un(f, 'voir')).filter((v) => idsApp.has(v) || (avertir(lieu, 'voir : appellation inconnue ' + v), false)),
  });
}
for (const f of fApp) if (!idsApp.has(f.id)) avertir(ou(f), 'appellation hors plan (ignorée)');

/* Cépages */
const cepages = [];
const parIdCep = new Map(unique(fCep, 'cépage').map((f) => [f.id, f]));
for (const [id, nomPlan, couleur] of planCep) {
  const f = parIdCep.get(id);
  if (!f) { avertir('cepages', 'fiche manquante : ' + id); continue; }
  const lieu = ou(f);
  cepages.push({
    id, nom: typo(un(f, 'nom') || nomPlan), coul: ['noir', 'blanc', 'gris', 'rose'].includes(un(f, 'couleur')) ? un(f, 'couleur') : couleur,
    alias: typo(un(f, 'alias')), def: prose(un(f, 'def'), lieu), orig: prose(un(f, 'origine'), lieu), surf: typo(un(f, 'surface')),
    texte: tous(f, 'texte').map((t) => prose(t, lieu)), aro: typo(un(f, 'aromes')),
    reg: liste(un(f, 'regions')).filter((r) => REGIONS.includes(r) || (avertir(lieu, 'région inconnue ' + r), false)),
    app: liste(un(f, 'appellations')).filter((a) => idsApp.has(a) || (avertir(lieu, 'appellation inconnue ' + a), false)),
    voir: liste(un(f, 'voir')).filter((v) => idsCep.has(v) || (avertir(lieu, 'voir : cépage inconnu ' + v), false)),
  });
}
for (const f of fCep) if (!idsCep.has(f.id)) avertir(ou(f), 'cépage hors plan (ignoré)');

/* Plats */
const idsFamille = new Set(FAMILLES.map((x) => x[0]));
const plats = [];
for (const f of unique(fPlats, 'plat')) {
  const lieu = ou(f);
  if (idsApp.has(f.id) || idsCep.has(f.id)) avertir(lieu, 'identifiant déjà pris par une appellation ou un cépage');
  const famille = un(f, 'famille');
  if (!idsFamille.has(famille)) { avertir(lieu, 'famille inconnue « ' + famille + ' »'); continue; }
  const garder = (cle) => liste(un(f, cle)).filter((v) => idsApp.has(v) || (avertir(lieu, cle + ' : appellation inconnue ' + v), false));
  plats.push({
    id: f.id, nom: typo(un(f, 'nom')), fam: famille,
    sty: liste(un(f, 'styles')).filter((s) => idsStyle.has(s) || (avertir(lieu, 'style inconnu ' + s), false)),
    vins: garder('vins'), aud: garder('audace'), conseil: prose(un(f, 'conseil'), lieu),
  });
}

/* Millésimes */
const millesimes = [];
for (const f of unique(fMil, 'zone')) {
  const lieu = ou(f);
  const annees = [];
  for (const an of ANNEES) {
    const brut = un(f, String(an));
    if (!brut) { avertir(lieu, 'année manquante ' + an); continue; }
    const [note, etat, ...reste] = brut.split('|').map((s) => s.trim());
    const n = note === '?' ? 0 : Number(note);
    if (!(n >= 0 && n <= 5) || Number.isNaN(n)) { avertir(lieu, an + ' : note illisible « ' + note + ' »'); continue; }
    if (!ETATS.includes(etat)) { avertir(lieu, an + ' : état inconnu « ' + etat + ' »'); continue; }
    annees.push([an, n, etat, prose(reste.join(' | '), lieu)]);
  }
  const legendes = tous(f, 'legende').map((l) => {
    const i = l.indexOf('|');
    return [l.slice(0, i).trim(), prose(l.slice(i + 1), lieu)];
  });
  if (!REGIONS.includes(un(f, 'region'))) avertir(lieu, 'région inconnue « ' + un(f, 'region') + ' »');
  millesimes.push({ id: f.id, nom: typo(un(f, 'nom')), r: un(f, 'region'), porte: prose(un(f, 'porte'), lieu), annees, legendes });
}

/* Guide */
const idsRubrique = new Set(RUBRIQUES.map((x) => x[0]));
const guide = [];
for (const f of unique(fGuide, 'fiche du guide')) {
  const lieu = ou(f);
  if (idsApp.has(f.id) || idsCep.has(f.id)) { avertir(lieu, 'identifiant déjà pris par une appellation ou un cépage'); continue; }
  const rubrique = un(f, 'rubrique');
  if (!idsRubrique.has(rubrique)) { avertir(lieu, 'rubrique inconnue « ' + rubrique + ' »'); continue; }
  const listes = tous(f, 'liste').map((l) => {
    const i = l.indexOf('=');
    return [typo(l.slice(0, i)), l.slice(i + 1).split(';').map((s) => typo(s)).filter(Boolean)];
  });
  const fiche = { id: f.id, nom: typo(un(f, 'nom')), rub: rubrique, def: prose(un(f, 'def'), lieu), texte: tous(f, 'texte').map((t) => prose(t, lieu)) };
  if (listes.length) fiche.listes = listes;
  guide.push(fiche);
}

/* ————— écriture ————— */

const VERSION = /const VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(RACINE, 'sw.js'), 'utf8'))[1];
const dossier = {
  styles: STYLES, familles: FAMILLES, rubriques: RUBRIQUES,
  regions, appellations, cepages, plats, millesimes, guide,
};
fs.mkdirSync(path.join(RACINE, 'data'), { recursive: true });
fs.writeFileSync(path.join(RACINE, 'data', 'guide.json'), JSON.stringify(dossier));
const manifeste = {
  version: VERSION, construit: new Date().toISOString().slice(0, 10),
  regions: regions.length, appellations: appellations.length, cepages: cepages.length,
  plats: plats.length, zones: millesimes.length, guide: guide.length,
};
fs.writeFileSync(path.join(RACINE, 'data', 'manifeste.json'), JSON.stringify(manifeste));

const mots = JSON.stringify(dossier).split(/\s+/).length;
console.log(`${regions.length} régions, ${appellations.length} appellations, ${cepages.length} cépages, ${plats.length} plats, `
  + `${millesimes.length} zones de millésimes, ${guide.length} fiches de guide — environ ${mots} mots, `
  + `${Math.round(fs.statSync(path.join(RACINE, 'data', 'guide.json')).size / 1024)} Ko`);
if (avertissements.length) {
  console.log('\n' + avertissements.length + ' avertissement(s) :');
  for (const a of avertissements.slice(0, 400)) console.log('  - ' + a);
  if (STRICT) process.exit(1);
}
