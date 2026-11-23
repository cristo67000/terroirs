'use strict';
/*
 * Lire une étiquette : retrouver, dans quelques lignes de texte, ce que le
 * guide connaît — l'appellation, les cépages, la région, le millésime.
 *
 * Le texte peut venir de ce que l'on tape soi-même (« Riesling grand cru
 * Schlossberg 2019 ») ou d'une lecture automatique de la photo : il est donc
 * comparé sans accents ni majuscules, et à une lettre près pour les mots
 * assez longs. Rien ne sort de l'appareil : on ne fait que comparer avec les
 * noms du guide déjà en mémoire.
 */
(function (racine) {

  const { normaliser, distance } = Outils;

  /* « Crémant d’Alsace » -> ['cremant', 'd', 'alsace'] */
  function mots(texte) {
    return normaliser(texte).replace(/œ/g, 'oe').replace(/æ/g, 'ae')
      .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  }

  const IGNORES_REGION = new Set(['vallee', 'ouest', 'sud']);
  let index = null;
  let source = null;

  function preparer(donnees) {
    if (index && source === donnees) return index;
    const entrees = [];
    const entrer = (t, f, nom) => {
      const m = mots(nom);
      const lettres = m.join('').length;
      if (m.length && lettres >= 4) entrees.push({ t, f, mots: m, lettres });
    };
    for (const a of donnees.appellations) {
      entrer('a', a, a.nom);
      /* Sur la bouteille, le cépage s'intercale : « Riesling grand cru Schlossberg ». */
      if (/^Alsace grand cru ./.test(a.nom)) entrer('a', a, a.nom.replace(/^Alsace /, ''));
    }
    for (const c of donnees.cepages) entrer('c', c, c.nom.replace(/\s*\(.*\)$/, ''));
    for (const r of donnees.regions) {
      entrer('r', r, r.nom);
      for (const m of mots(r.nom)) if (m.length >= 4 && !IGNORES_REGION.has(m)) entrer('r', r, m);
      if (r.id === 'sud-ouest') entrer('r', r, 'sud ouest');
    }
    index = entrees;
    source = donnees;
    return index;
  }

  /* Combien de fautes tolérer dans un mot : aucune s'il est court. */
  function tolerance(mot) { return mot.length >= 10 ? 2 : (mot.length >= 6 ? 1 : 0); }

  /* Les endroits du texte où se lit un nom du guide : [{ debut, fin, fautes }]. */
  function occurrences(entree, texte) {
    const k = entree.mots.length;
    const trouvees = [];
    for (let i = 0; i + k <= texte.length; i += 1) {
      let fautes = 0;
      let bon = true;
      for (let j = 0; j < k && bon; j += 1) {
        const attendu = entree.mots[j];
        const lu = texte[i + j];
        if (attendu === lu) continue;
        const t = tolerance(attendu);
        const d = t ? distance(attendu, lu, t) : 1;
        if (!t || d > t) bon = false; else fautes += d;
      }
      if (bon && fautes <= 2) trouvees.push({ debut: i, fin: i + k, fautes });
    }
    return trouvees;
  }

  function lire(texte, donnees) {
    const vide = { appellations: [], cepages: [], region: null, annee: null, nom: null };
    const brut = String(texte || '');
    const lus = mots(brut);
    if (!lus.length || !donnees) return vide;

    let trouves = [];
    for (const e of preparer(donnees)) {
      for (const o of occurrences(e, lus)) {
        trouves.push({ t: e.t, f: e.f, debut: o.debut, fin: o.fin, fautes: o.fautes, note: e.lettres - 3 * o.fautes });
      }
    }
    /* « Alsace » dans « Alsace grand cru », « clairette » dans « Clairette de Die » :
     * un nom pris dans un nom plus long, mieux lu, s'efface. */
    trouves = trouves.filter((x) => !trouves.some((y) => y !== x && y.f !== x.f
      && y.debut <= x.debut && y.fin >= x.fin && (y.fin - y.debut > x.fin - x.debut || (y.fin - y.debut === x.fin - x.debut && y.note > x.note))));
    trouves.sort((x, y) => y.note - x.note || x.debut - y.debut);

    const uniques = (t) => {
      const vus = new Set();
      return trouves.filter((x) => x.t === t && !vus.has(x.f.id) && vus.add(x.f.id)).map((x) => ({ f: x.f, exact: x.fautes === 0 }));
    };
    const appellations = uniques('a').slice(0, 4);
    const cepages = uniques('c').slice(0, 4);
    const regions = uniques('r');
    const region = appellations.length ? appellations[0].f.r : (regions.length ? regions[0].f.id : null);

    /* Le millésime : l'année la plus récente (« depuis 1885 » est plus ancien). */
    const cetteAnnee = new Date().getFullYear();
    let annee = null;
    for (const m of lus) {
      if (!/^(19|20)\d\d$/.test(m)) continue;
      const n = Number(m);
      if (n <= cetteAnnee && (annee === null || n > annee)) annee = n;
    }

    /* Le nom du producteur, s'il se présente : « Domaine … », « Château … ». */
    let nom = null;
    for (const ligne of brut.split(/\r?\n/)) {
      const propre = ligne.replace(/\s+/g, ' ').trim();
      if (propre.length >= 6 && propre.length <= 60 && /^(domaine|chateau|clos|mas|maison|caves?|vignobles?) /.test(normaliser(propre))) { nom = propre; break; }
    }

    return { appellations, cepages, region, annee, nom };
  }

  racine.Lecture = { lire, mots };

})(window);
