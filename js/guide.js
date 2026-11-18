'use strict';
/*
 * L'écran « Guide du vin » : les fiches pratiques par rubrique, et le lexique.
 */
(function (racine) {

  const { element, normaliser } = Outils;
  let rubrique = 'etiquette';
  let requete = '';

  function dessiner() {
    const G = Guide.donnees;
    const presentes = G.rubriques.filter((r) => G.guide.some((g) => g.rub === r[0]));
    if (!presentes.some((r) => r[0] === rubrique) && presentes.length) rubrique = presentes[0][0];
    Rendu.filtres(document.getElementById('guide-rubriques'),
      presentes.map((r) => [r[0], r[1], G.guide.filter((g) => g.rub === r[0]).length]), rubrique,
      (v) => { rubrique = v; requete = ''; dessiner(); });

    const zone = document.getElementById('guide-contenu');
    zone.textContent = '';
    const fiches = G.guide.filter((g) => g.rub === rubrique);

    if (rubrique !== 'lexique') {
      const groupe = element('div', 'groupe');
      for (const g of fiches) groupe.appendChild(Rendu.ligne('g', g, { sous: '' }));
      zone.appendChild(groupe);
      return;
    }

    const bloc = element('div', 'champ-filtre');
    const champ = element('input');
    champ.type = 'search';
    champ.placeholder = 'Un mot du vin…';
    champ.setAttribute('aria-label', 'Chercher dans le lexique');
    champ.autocomplete = 'off';
    champ.value = requete;
    bloc.appendChild(champ);
    zone.appendChild(bloc);
    const liste = element('div');
    zone.appendChild(liste);

    const tri = fiches.slice().sort((x, y) => x.nom.localeCompare(y.nom, 'fr'));
    const lister = () => {
      liste.textContent = '';
      const q = normaliser(requete);
      const dans = tri.filter((g) => !q || normaliser(g.nom).includes(q) || (q.length >= 4 && normaliser(g.def).includes(q)));
      if (!dans.length) { liste.appendChild(element('p', 'rien-titre rien', 'Aucun mot ne correspond.')); return; }
      let lettre = '';
      let dl = null;
      for (const g of dans) {
        const l = normaliser(g.nom).charAt(0).toUpperCase();
        if (l !== lettre) {
          lettre = l;
          liste.appendChild(element('h3', 'lettre', l));
          dl = liste.appendChild(element('dl', 'lexique'));
        }
        const dt = element('dt');
        if (q) dt.appendChild(Outils.surligner(g.nom, requete)); else dt.textContent = g.nom;
        dl.appendChild(dt);
        const dd = element('dd');
        dd.appendChild(Rendu.fragment(g.def));
        for (const t of g.texte || []) dd.appendChild(element('p', 'lexique-suite')).appendChild(Rendu.fragment(t));
        dl.appendChild(dd);
      }
    };
    champ.addEventListener('input', () => { requete = champ.value.trim(); lister(); });
    lister();
  }

  racine.GuideVue = {
    brancher() { /* rien */ },
    montrer: dessiner,
  };

})(window);
