'use strict';
/*
 * Du texte du guide aux éléments de la page.
 *
 * Le texte porte deux marques : [[t:id]] ou [[t:id|libellé]] pour un renvoi
 * vers une autre fiche, *mot* pour l'italique. Tout passe par des nœuds de
 * texte : rien n'est jamais interprété comme du HTML.
 */
(function (racine) {

  const { element, bouton } = Outils;

  const COULEURS = {
    rouge: ['rouge', 'Rouge'], 'rosé': ['rose', 'Rosé'], blanc: ['blanc', 'Blanc'],
    effervescent: ['effervescent', 'Effervescent'], moelleux: ['moelleux', 'Moelleux'],
    liquoreux: ['liquoreux', 'Liquoreux'], 'vin doux naturel': ['vdn', 'Vin doux naturel'],
    'vin jaune': ['jaune', 'Vin jaune'], 'vin de paille': ['paille', 'Vin de paille'],
    'vin de liqueur': ['liqueur', 'Vin de liqueur'],
  };
  const BAIES = { noir: 'Raisin noir', blanc: 'Raisin blanc', gris: 'Raisin gris', rose: 'Raisin rose' };
  const NIVEAUX = {
    'régionale': 'Appellation régionale', 'sous-régionale': 'Appellation sous-régionale',
    communale: 'Appellation communale', cru: 'Cru', 'grand cru': 'Grand cru', IGP: 'IGP',
  };

  function renvoi(t, id, libelle) {
    const f = Guide.get(t, id);
    if (!f) return document.createTextNode(libelle || id);
    const a = element('a', 'renvoi', libelle || Guide.nomCourant(t, f));
    a.href = '?fiche=' + t + ':' + id;
    a.addEventListener('click', (e) => { e.preventDefault(); Fiche.ouvrir(t, id); });
    return a;
  }

  /* Un fragment : le texte, ses renvois, son italique. */
  function fragment(texte) {
    const frag = document.createDocumentFragment();
    const motif = /\[\[([acrpg]):([^\]|]+)(?:\|([^\]]+))?\]\]|\*([^*]+)\*/g;
    let pos = 0;
    let m;
    const source = String(texte || '');
    while ((m = motif.exec(source)) !== null) {
      if (m.index > pos) frag.appendChild(document.createTextNode(source.slice(pos, m.index)));
      if (m[1]) frag.appendChild(renvoi(m[1], m[2], m[3]));
      else frag.appendChild(element('em', null, m[4]));
      pos = m.index + m[0].length;
    }
    if (pos < source.length) frag.appendChild(document.createTextNode(source.slice(pos)));
    return frag;
  }

  /* Le texte sans ses marques, pour un aperçu d'une ligne. */
  function nu(texte) {
    return String(texte || '')
      .replace(/\[\[([acrpg]):([^\]|]+)\|([^\]]+)\]\]/g, '$3')
      .replace(/\[\[([acrpg]):([^\]|]+)\]\]/g, (tout, t, id) => { const f = Guide.get(t, id); return f ? Guide.nomCourant(t, f) : id; })
      .replace(/\*([^*]+)\*/g, '$1');
  }

  function paragraphes(textes, classe) {
    const bloc = element('div', classe || 'article-texte');
    for (const t of textes || []) bloc.appendChild(element('p')).appendChild(fragment(t));
    return bloc;
  }

  /* Les pastilles de couleur d'une appellation : un rond par type de vin. */
  function pastillesCouleur(couleurs, avecNom) {
    const zone = element('span', 'couleurs');
    for (const c of couleurs || []) {
      const [classe, nom] = COULEURS[c] || ['blanc', c];
      const p = element('span', 'goutte v-' + classe);
      p.title = nom;
      p.setAttribute('aria-label', nom);
      p.setAttribute('role', 'img');
      zone.appendChild(p);
      if (avecNom) zone.appendChild(element('span', 'goutte-nom', nom.toLowerCase()));
    }
    return zone;
  }

  function pastilleBaie(couleur) {
    const p = element('span', 'baie b-' + couleur);
    p.title = BAIES[couleur] || '';
    p.setAttribute('role', 'img');
    p.setAttribute('aria-label', BAIES[couleur] || '');
    return p;
  }

  /* Une ligne de liste, pour n'importe quelle fiche. */
  function ligne(t, f, options) {
    const o = options || {};
    const b = bouton('fiche-ligne type-' + t + (t === 'a' || t === 'r' ? ' region-' + (t === 'r' ? f.id : f.r) : ''), null,
      o.action || (() => Fiche.ouvrir(t, f.id)));
    const tete = element('span', 'fiche-ligne-tete');
    if (t === 'c') tete.appendChild(pastilleBaie(f.coul));
    const nom = element('span', 'fiche-ligne-nom');
    if (o.requete) nom.appendChild(Outils.surligner(f.nom, o.requete)); else nom.textContent = f.nom;
    tete.appendChild(nom);
    if (t === 'a') tete.appendChild(pastillesCouleur(f.coul));
    if (o.marque) tete.appendChild(element('span', 'etiquette', o.marque));
    if (Memoire.favoris.a(t + ':' + f.id)) tete.appendChild(element('span', 'marque-favori', '★'));
    b.appendChild(tete);
    let sous = o.sous;
    if (sous === undefined) {
      if (t === 'a') sous = (Guide.get('r', f.r) || {}).nom + (f.sous ? ' · ' + f.sous : '');
      else if (t === 'p') sous = (Guide.famille(f.fam) || [])[1];
      else if (t === 'c' && f.alias) sous = 'ou ' + f.alias;
    }
    if (sous) b.appendChild(element('span', 'fiche-ligne-sous', sous));
    if (o.apercu !== false) {
      const texte = nu(f.def || f.conseil || '');
      if (texte) b.appendChild(element('span', 'apercu', texte));
    }
    return b;
  }

  function titre(texte, classe) { return element('h3', classe || 'rubrique', texte); }

  /* Une rangée de boutons-filtres. `choix` : [[valeur, nom, nombre?]…]. */
  function filtres(zone, choix, actif, action) {
    zone.textContent = '';
    for (const [valeur, nom, nombre] of choix) {
      const b = bouton('filtre' + (valeur === actif ? ' actif' : ''), null, () => action(valeur));
      b.appendChild(element('span', null, nom));
      if (nombre !== undefined) b.appendChild(element('span', 'nombre-filtre', String(nombre)));
      b.setAttribute('aria-pressed', valeur === actif ? 'true' : 'false');
      zone.appendChild(b);
    }
  }

  function segments(zone, choix, actif, action) {
    zone.textContent = '';
    for (const [valeur, nom] of choix) {
      const b = bouton(null, nom, () => action(valeur));
      b.setAttribute('aria-pressed', valeur === actif ? 'true' : 'false');
      zone.appendChild(b);
    }
  }

  racine.Rendu = {
    fragment, nu, paragraphes, pastillesCouleur, pastilleBaie, ligne, titre, filtres, segments, renvoi,
    COULEURS, BAIES, NIVEAUX,
  };

})(window);
