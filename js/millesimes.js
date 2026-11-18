'use strict';
/*
 * L'onglet « Millésimes ».
 *
 * Deux présentations : un vignoble, année par année, avec sa note, son état
 * aujourd'hui et une phrase ; ou le tableau d'ensemble, vignobles en lignes et
 * années en colonnes, où la teinte dit la note.
 */
(function (racine) {

  const { element, bouton } = Outils;
  const ETATS = { garder: 'À garder', boire: 'À boire', apogee: 'À son apogée', passe: 'À boire sans attendre' };
  let sens = 'zone';
  let zoneId = null;

  function note(n) {
    const z = element('span', 'note');
    z.setAttribute('role', 'img');
    z.setAttribute('aria-label', n ? n + ' sur 5' : 'pas encore noté');
    for (let i = 1; i <= 5; i += 1) z.appendChild(element('span', 'grain' + (i <= n ? ' plein' : '')));
    return z;
  }

  function dessinerZone(zone) {
    const G = Guide.donnees;
    if (!zoneId || !G.millesimes.some((z) => z.id === zoneId)) zoneId = G.millesimes.length ? G.millesimes[0].id : null;
    const filtres = element('div', 'filtres');
    Rendu.filtres(filtres, G.millesimes.map((z) => [z.id, z.nom]), zoneId, (v) => { zoneId = v; dessiner(); });
    zone.appendChild(filtres);
    const z = G.millesimes.find((x) => x.id === zoneId);
    if (!z) { zone.appendChild(element('p', 'discret', 'Les millésimes ne sont pas encore renseignés.')); return; }
    requestAnimationFrame(() => { const actif = filtres.querySelector('.actif'); if (actif) actif.scrollIntoView({ inline: 'center', block: 'nearest' }); });

    const entete = element('div', 'definition');
    entete.appendChild(element('p', 'definition-texte')).appendChild(Rendu.fragment(z.porte));
    zone.appendChild(entete);
    const region = Guide.get('r', z.r);
    if (region) zone.appendChild(bouton('lien-discret', 'La région : ' + region.nom + ' ›', () => Fiche.ouvrir('r', region.id)));

    const liste = element('div', 'annees');
    for (const [an, n, etat, commentaire] of z.annees) {
      const ligne = element('div', 'annee n' + n);
      ligne.id = 'an-' + an;
      const tete = element('div', 'annee-tete');
      tete.appendChild(element('span', 'annee-chiffre', String(an)));
      tete.appendChild(note(n));
      tete.appendChild(element('span', 'etat etat-' + etat, ETATS[etat] || etat));
      ligne.appendChild(tete);
      ligne.appendChild(element('p', 'annee-texte')).appendChild(Rendu.fragment(commentaire));
      liste.appendChild(ligne);
    }
    zone.appendChild(liste);

    if (z.legendes.length) {
      zone.appendChild(Rendu.titre('Avant 1990 : les millésimes de légende'));
      const dl = element('dl', 'en-bref');
      for (const [an, texte] of z.legendes) {
        dl.appendChild(element('dt', null, an));
        dl.appendChild(element('dd')).appendChild(Rendu.fragment(texte));
      }
      zone.appendChild(dl);
    }
  }

  function dessinerTableau(zone) {
    const G = Guide.donnees;
    if (!G.millesimes.length) { zone.appendChild(element('p', 'discret', 'Les millésimes ne sont pas encore renseignés.')); return; }
    const legende = element('p', 'legende-notes');
    legende.appendChild(document.createTextNode('Petit '));
    for (let i = 1; i <= 5; i += 1) legende.appendChild(element('span', 'case-legende n' + i, String(i)));
    legende.appendChild(document.createTextNode(' exceptionnel'));
    zone.appendChild(legende);

    const cadre = element('div', 'tableau-cadre');
    const table = element('table', 'tableau-millesimes');
    const annees = G.millesimes[0].annees.map((a) => a[0]);
    const tete = element('tr');
    tete.appendChild(element('th', 'coin', ''));
    for (const an of annees) tete.appendChild(element('th', 'col-annee', String(an).slice(2)));
    table.appendChild(element('thead')).appendChild(tete);
    const corps = element('tbody');
    for (const z of G.millesimes) {
      const tr = element('tr');
      const th = element('th', 'ligne-zone');
      th.appendChild(bouton('lien-zone', z.nom, () => { zoneId = z.id; sens = 'zone'; dessiner(); racine.scrollTo(0, 0); }));
      tr.appendChild(th);
      const parAn = new Map(z.annees.map((a) => [a[0], a]));
      for (const an of annees) {
        const a = parAn.get(an);
        const td = element('td', 'case n' + (a ? a[1] : 0));
        if (a) {
          const b = bouton('case-bouton', a[1] ? String(a[1]) : '?', () => {
            zoneId = z.id; sens = 'zone'; dessiner();
            requestAnimationFrame(() => { const e = document.getElementById('an-' + an); if (e) { e.scrollIntoView({ block: 'center' }); e.classList.add('vise'); } });
          });
          b.setAttribute('aria-label', z.nom + ' ' + an + ' : ' + (a[1] ? a[1] + ' sur 5' : 'pas encore noté'));
          td.appendChild(b);
        }
        tr.appendChild(td);
      }
      corps.appendChild(tr);
    }
    table.appendChild(corps);
    cadre.appendChild(table);
    zone.appendChild(cadre);
    zone.appendChild(element('p', 'discret petit', 'Les colonnes sont les années (25 = 2025). Touchez une case pour lire le commentaire.'));
  }

  function dessiner() {
    Rendu.segments(document.getElementById('millesimes-sens'), [['zone', 'Par vignoble'], ['tableau', 'Tableau']], sens,
      (v) => { sens = v; dessiner(); });
    const zone = document.getElementById('millesimes-contenu');
    zone.textContent = '';
    if (sens === 'zone') dessinerZone(zone); else dessinerTableau(zone);
    zone.appendChild(element('p', 'discret petit avis-millesimes', 'Une note de millésime résume une région entière : elle dit la tendance de l’année, pas la valeur de chaque bouteille. Un bon vigneron réussit les petites années ; l’état indiqué vaut pour les bons vins de la zone, fin 2026.'));
  }

  racine.Millesimes = {
    brancher() { /* rien */ },
    montrer: dessiner,
    montrerZone(id) { zoneId = id; sens = 'zone'; App.aller('millesimes'); },
  };

})(window);
