'use strict';
/*
 * L'onglet « Cépages » : la liste, filtrée par couleur de baie.
 */
(function (racine) {

  const { element } = Outils;
  let couleur = 'tous';
  let pret = false;

  function dessiner() {
    const tous = Guide.donnees.cepages;
    const compte = (c) => tous.filter((x) => x.coul === c).length;
    Rendu.filtres(document.getElementById('cepages-filtres'), [
      ['tous', 'Tous', tous.length], ['noir', 'Noirs', compte('noir')], ['blanc', 'Blancs', compte('blanc')],
      ['gris', 'Gris et roses', compte('gris') + compte('rose')],
    ], couleur, (v) => { couleur = v; dessiner(); });

    const zone = document.getElementById('cepages-liste');
    zone.textContent = '';
    const liste = tous.filter((c) => couleur === 'tous' || c.coul === couleur || (couleur === 'gris' && c.coul === 'rose'));
    let lettre = '';
    let groupe = null;
    for (const c of liste) {
      const l = Outils.normaliser(c.nom).charAt(0).toUpperCase();
      if (l !== lettre) {
        lettre = l;
        zone.appendChild(element('h3', 'lettre', l));
        groupe = zone.appendChild(element('div', 'groupe'));
      }
      const emplois = Guide.appsDeCepage(c.id).length;
      groupe.appendChild(Rendu.ligne('c', c, { marque: emplois ? Outils.pluriel(emplois, 'appellation', 'appellations') : undefined }));
    }
  }

  racine.Cepages = {
    brancher() { document.addEventListener('favoris-changes', () => { if (pret) dessiner(); }); },
    montrer() { pret = true; dessiner(); },
  };

})(window);
