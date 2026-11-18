'use strict';
/*
 * L'onglet « Accords » : dans les deux sens.
 *
 * « J'ai un plat » : on cherche ou on feuillette les plats par famille ; la
 * fiche du plat dit quel genre de vin, et lesquels. « J'ai un vin » : on
 * choisit un genre de vin, et l'on voit ce qui lui va à table ; pour une
 * appellation précise, sa fiche a sa rubrique « À table ».
 */
(function (racine) {

  const { element, bouton, normaliser } = Outils;
  let sens = 'plat';
  let famille = 'toutes';
  let style = null;
  let requete = '';

  function dessinerPlats(zone) {
    const G = Guide.donnees;
    const bloc = element('div', 'champ-filtre');
    const champ = element('input');
    champ.type = 'search';
    champ.placeholder = 'Un plat, un fromage…';
    champ.setAttribute('aria-label', 'Chercher un plat');
    champ.autocomplete = 'off';
    champ.value = requete;
    bloc.appendChild(champ);
    zone.appendChild(bloc);

    const filtres = element('div', 'filtres');
    zone.appendChild(filtres);
    const liste = element('div');
    zone.appendChild(liste);

    const lister = () => {
      const q = normaliser(requete);
      Rendu.filtres(filtres, [['toutes', 'Tout']].concat(G.familles.filter((f) => G.plats.some((p) => p.fam === f[0])).map((f) => [f[0], f[1]])),
        famille, (v) => { famille = v; lister(); });
      liste.textContent = '';
      const dans = G.plats.filter((p) => (q ? normaliser(p.nom).includes(q) : (famille === 'toutes' || p.fam === famille)));
      if (!dans.length) {
        liste.appendChild(element('p', 'rien-titre rien', 'Aucun plat ne correspond.'));
        return;
      }
      const familles = q || famille !== 'toutes' ? [null] : G.familles.map((f) => f[0]);
      for (const fam of familles) {
        const groupeDe = fam ? dans.filter((p) => p.fam === fam) : dans;
        if (!groupeDe.length) continue;
        if (fam) liste.appendChild(element('h3', 'titre-groupe', Guide.famille(fam)[1]));
        const groupe = element('div', 'groupe');
        for (const p of groupeDe) {
          const styles = p.sty.map((s) => (Guide.style(s) || [])[1]).filter(Boolean).slice(0, 2).join(' · ');
          groupe.appendChild(Rendu.ligne('p', p, { requete: q ? requete : undefined, sous: styles, apercu: false }));
        }
        liste.appendChild(groupe);
      }
    };
    champ.addEventListener('input', () => { requete = champ.value.trim(); lister(); });
    lister();
  }

  function dessinerVins(zone) {
    const G = Guide.donnees;
    zone.appendChild(element('p', 'discret intro-vue', 'Choisissez un genre de vin pour voir ce qui lui va à table. Pour une appellation précise, ouvrez sa fiche : elle a sa rubrique « À table ».'));
    for (const s of G.styles) {
      const plats = Guide.platsDeStyle(s[0]);
      const ouvert = style === s[0];
      const b = bouton('style-ligne' + (ouvert ? ' ouvert' : ''), null, () => { style = ouvert ? null : s[0]; dessiner(); if (!ouvert) requestAnimationFrame(() => { const e = document.querySelector('.style-ligne.ouvert'); if (e) e.scrollIntoView({ block: 'start', behavior: 'smooth' }); }); });
      b.setAttribute('aria-expanded', ouvert ? 'true' : 'false');
      const tete = element('span', 'style-tete');
      tete.appendChild(element('span', 'style-nom', s[1]));
      tete.appendChild(element('span', 'nombre-filtre', Outils.pluriel(plats.length, 'plat', 'plats')));
      b.appendChild(tete);
      b.appendChild(element('span', 'apercu', s[2]));
      zone.appendChild(b);
      if (!ouvert) continue;
      const detail = element('div', 'style-detail');
      const apps = Guide.appsDeStyle(s[0]).filter((a) => a.sty[0] === s[0]);
      if (apps.length) {
        detail.appendChild(element('p', 'discret petit', 'Par exemple : ' + apps.slice().sort(() => 0.5 - Math.random()).slice(0, 6).map((a) => a.nom).sort((x, y) => x.localeCompare(y, 'fr')).join(', ') + '…'));
      }
      for (const f of G.familles) {
        const dans = plats.filter((p) => p.fam === f[0]).sort((x, y) => x.sty.indexOf(s[0]) - y.sty.indexOf(s[0]));
        if (!dans.length) continue;
        detail.appendChild(element('h4', 'titre-groupe', f[1]));
        const groupe = element('div', 'groupe');
        for (const p of dans) groupe.appendChild(Rendu.ligne('p', p, { sous: '', apercu: false, marque: p.sty[0] === s[0] ? 'premier choix' : undefined }));
        detail.appendChild(groupe);
      }
      zone.appendChild(detail);
    }
  }

  function dessiner() {
    Rendu.segments(document.getElementById('accords-sens'), [['plat', 'J’ai un plat'], ['vin', 'J’ai un vin']], sens,
      (v) => { sens = v; dessiner(); });
    const zone = document.getElementById('accords-contenu');
    zone.textContent = '';
    if (sens === 'plat') dessinerPlats(zone); else dessinerVins(zone);
  }

  racine.Accords = {
    brancher() { document.addEventListener('favoris-changes', () => { if (App.vue === 'accords') dessiner(); }); },
    montrer: dessiner,
    montrerStyle(id) {
      sens = 'vin';
      style = id;
      App.aller('accords');
      requestAnimationFrame(() => { const e = document.querySelector('.style-ligne.ouvert'); if (e) e.scrollIntoView({ block: 'start' }); });
    },
  };

})(window);
