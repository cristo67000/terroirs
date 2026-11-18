'use strict';
/*
 * Le guide en mémoire : régions, appellations, cépages, plats, millésimes,
 * fiches du guide — et les index qui les relient.
 *
 * Une fiche se désigne partout par son type et son identifiant :
 *   a = appellation, c = cépage, r = région, p = plat, g = fiche du guide.
 */
(function (racine) {

  const { normaliser } = Outils;

  const G = {
    regions: [], appellations: [], cepages: [], plats: [], millesimes: [], guide: [],
    styles: [], familles: [], rubriques: [],
  };
  const parType = { a: new Map(), c: new Map(), r: new Map(), p: new Map(), g: new Map() };
  const index = {
    appsDeRegion: new Map(), appsDeCepage: new Map(), platsDeApp: new Map(), platsDeStyle: new Map(),
    appsDeStyle: new Map(), zonesDeRegion: new Map(),
  };
  let recherche = [];

  const NOMS_TYPE = { a: 'Appellation', c: 'Cépage', r: 'Région', p: 'Accord', g: 'Guide' };

  function ajouter(carte, cle, valeur) {
    if (!carte.has(cle)) carte.set(cle, []);
    carte.get(cle).push(valeur);
  }

  async function charger() {
    const reponse = await fetch('data/guide.json');
    if (!reponse.ok) throw new Error('guide : ' + reponse.status);
    Object.assign(G, await reponse.json());

    for (const r of G.regions) parType.r.set(r.id, r);
    for (const a of G.appellations) parType.a.set(a.id, a);
    for (const c of G.cepages) parType.c.set(c.id, c);
    for (const p of G.plats) parType.p.set(p.id, p);
    for (const g of G.guide) parType.g.set(g.id, g);

    for (const a of G.appellations) {
      ajouter(index.appsDeRegion, a.r, a);
      for (const [c, principal] of a.cep) ajouter(index.appsDeCepage, c, { a, principal: !!principal });
      for (const s of a.sty) ajouter(index.appsDeStyle, s, a);
    }
    for (const p of G.plats) {
      for (const v of p.vins) ajouter(index.platsDeApp, v, { p, audace: false });
      for (const v of p.aud) ajouter(index.platsDeApp, v, { p, audace: true });
      for (const s of p.sty) ajouter(index.platsDeStyle, s, p);
    }
    for (const z of G.millesimes) ajouter(index.zonesDeRegion, z.r, z);

    const fr = (x, y) => x.nom.localeCompare(y.nom, 'fr');
    G.cepages.sort(fr);
    G.plats.sort(fr);

    recherche = [];
    const entrer = (t, f, extra, poids) => recherche.push({
      t, f, nom: normaliser(f.nom), extra: normaliser(extra || ''), def: normaliser(f.def || f.conseil || ''), poids,
    });
    for (const r of G.regions) entrer('r', r, r.sous.map((s) => s[0]).join(' '), 5);
    for (const a of G.appellations) entrer('a', a, a.sous + ' ' + a.crus, 4);
    for (const c of G.cepages) entrer('c', c, c.alias, 4);
    for (const p of G.plats) entrer('p', p, '', 3);
    for (const g of G.guide) entrer('g', g, '', g.rub === 'lexique' ? 1 : 2);
  }

  /* Recherche dans tout le guide. Le nom d'abord (début, puis milieu), puis les
   * autres noms (alias, crus, sous-régions), puis la définition ; à défaut, les
   * noms à une faute de frappe près. */
  function chercher(requete, limite) {
    const q = normaliser(requete);
    if (q.length < 2) return [];
    const trouves = [];
    for (const e of recherche) {
      let note = 0;
      if (e.nom === q) note = 100;
      else if (e.nom.startsWith(q)) note = 80;
      else if ((' ' + e.nom).includes(' ' + q) || e.nom.includes('-' + q)) note = 65;
      else if (e.nom.includes(q)) note = 50;
      else if (e.extra.includes(q)) note = 35;
      else if (q.length >= 4 && e.def.includes(q)) note = 15;
      if (note) trouves.push({ t: e.t, f: e.f, note: note + e.poids, via: note === 35 ? 'extra' : (note === 15 ? 'def' : 'nom') });
    }
    if (!trouves.length && q.length >= 4) {
      const plafond = q.length >= 7 ? 2 : 1;
      for (const e of recherche) {
        for (const mot of e.nom.split(/[ -]/)) {
          if (mot.length >= 4 && Outils.distance(mot, q, plafond) <= plafond) {
            trouves.push({ t: e.t, f: e.f, note: 10 + e.poids, via: 'proche' });
            break;
          }
        }
      }
    }
    trouves.sort((x, y) => y.note - x.note || x.f.nom.localeCompare(y.f.nom, 'fr'));
    return trouves.slice(0, limite || 60);
  }

  /* Le nom d'une fiche tel qu'il se lit au fil d'une phrase : « le merlot »,
   * mais « Pauillac ». Les cépages perdent leur majuscule et leur parenthèse. */
  function nomCourant(t, f) {
    if (t !== 'c') return f.nom;
    const nu = f.nom.replace(/\s*\(.*\)$/, '');
    return nu.charAt(0).toLowerCase() + nu.slice(1);
  }

  racine.Guide = {
    charger, chercher, nomCourant, NOMS_TYPE,
    get: (t, id) => (parType[t] ? parType[t].get(id) : undefined),
    get donnees() { return G; },
    appsDeRegion: (id) => index.appsDeRegion.get(id) || [],
    appsDeCepage: (id) => index.appsDeCepage.get(id) || [],
    appsDeStyle: (id) => index.appsDeStyle.get(id) || [],
    platsDeApp: (id) => index.platsDeApp.get(id) || [],
    platsDeStyle: (id) => index.platsDeStyle.get(id) || [],
    zonesDeRegion: (id) => index.zonesDeRegion.get(id) || [],
    style: (id) => G.styles.find((s) => s[0] === id),
    famille: (id) => G.familles.find((s) => s[0] === id),
  };

})(window);
