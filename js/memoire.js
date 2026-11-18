'use strict';
/*
 * La mémoire de l'application : les réglages, les fiches gardées, les fiches lues.
 *
 * Tout reste dans l'appareil (localStorage), sous le préfixe « terroirs: ». Une
 * navigation privée peut refuser d'écrire : on garde alors en mémoire vive, le
 * temps de la visite, sans rien dire.
 */
(function (racine) {

  const PREFIXE = 'terroirs:';
  const DEFAUTS = { theme: 'auto', taille: 1, police: 'serif' };
  const vive = {};

  function lire(cle, defaut) {
    try {
      const brut = racine.localStorage.getItem(PREFIXE + cle);
      if (brut === null) return cle in vive ? vive[cle] : defaut;
      return JSON.parse(brut);
    } catch (e) {
      return cle in vive ? vive[cle] : defaut;
    }
  }

  function ecrire(cle, valeur) {
    vive[cle] = valeur;
    try { racine.localStorage.setItem(PREFIXE + cle, JSON.stringify(valeur)); } catch (e) { /* mémoire vive seulement */ }
    return valeur;
  }

  function reglages() { return Object.assign({}, DEFAUTS, lire('reglages', {})); }
  function ecrireReglage(cle, valeur) {
    const r = reglages();
    r[cle] = valeur;
    ecrire('reglages', r);
    return r;
  }

  /* Un ensemble d'identifiants : les fiches gardées (« favoris »), les fiches lues. */
  function ensemble(cle) {
    const lu = () => new Set(lire(cle, []));
    return {
      a: (id) => lu().has(id),
      tous: () => Array.from(lu()),
      nombre: () => lu().size,
      basculer(id) { const s = lu(); if (s.has(id)) s.delete(id); else s.add(id); ecrire(cle, Array.from(s)); return s.has(id); },
      ajouter(id) { const s = lu(); if (!s.has(id)) { s.add(id); ecrire(cle, Array.from(s)); } },
      vider() { ecrire(cle, []); },
    };
  }

  function toutEffacer() {
    try {
      const cles = [];
      for (let i = 0; i < racine.localStorage.length; i += 1) {
        const c = racine.localStorage.key(i);
        if (c && c.startsWith(PREFIXE)) cles.push(c);
      }
      cles.forEach((c) => racine.localStorage.removeItem(c));
    } catch (e) { /* rien */ }
    for (const c of Object.keys(vive)) delete vive[c];
  }

  racine.Memoire = {
    DEFAUTS, lire, ecrire, reglages, ecrireReglage, toutEffacer,
    favoris: ensemble('favoris'),
    lus: ensemble('lus'),
  };

})(window);
