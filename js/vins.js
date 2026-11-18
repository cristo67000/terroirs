'use strict';
/*
 * L'onglet « Vins » : l'accueil du guide et la recherche.
 *
 * Sans requête : les régions, les styles de vin, les fiches gardées. Avec une
 * requête : les résultats de tout le guide, appellations, cépages, accords et
 * lexique mêlés, les plus proches d'abord.
 */
(function (racine) {

  const { element, bouton } = Outils;
  let style = null;
  let minuterie = null;

  function carteRegion(r) {
    const apps = Guide.appsDeRegion(r.id);
    const b = bouton('carte-region region-' + r.id, null, () => Fiche.ouvrir('r', r.id));
    b.appendChild(element('span', 'carte-region-nom', r.nom));
    b.appendChild(element('span', 'carte-region-nombre', Outils.pluriel(apps.length, 'appellation', 'appellations')));
    const cepages = r.cep.slice(0, 3).map((id) => Guide.get('c', id)).filter(Boolean).map((c) => Guide.nomCourant('c', c));
    if (cepages.length) b.appendChild(element('span', 'carte-region-cepages', cepages.join(', ')));
    return b;
  }

  function dessinerAccueil() {
    const zone = document.getElementById('vins-accueil');
    zone.textContent = '';
    const G = Guide.donnees;

    const favoris = Memoire.favoris.tous().map((cle) => { const [t, id] = cle.split(':'); return [t, Guide.get(t, id)]; }).filter((x) => x[1]);
    if (favoris.length) {
      zone.appendChild(Rendu.titre('Vos fiches gardées'));
      const groupe = element('div', 'groupe');
      for (const [t, f] of favoris.slice(0, 30)) groupe.appendChild(Rendu.ligne(t, f, { apercu: false }));
      zone.appendChild(groupe);
    }

    zone.appendChild(Rendu.titre('Les régions'));
    const grille = element('div', 'grille-regions');
    const ordre = G.regions.slice().sort((x, y) => x.nom.localeCompare(y.nom, 'fr'));
    for (const r of ordre) grille.appendChild(carteRegion(r));
    zone.appendChild(grille);

    zone.appendChild(Rendu.titre('Par genre de vin'));
    const filtres = element('div', 'filtres');
    Rendu.filtres(filtres, G.styles.map((s) => [s[0], s[1]]), style, (v) => { style = style === v ? null : v; dessinerAccueil(); if (style) document.getElementById('liste-style').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
    zone.appendChild(filtres);
    const listeStyle = element('div');
    listeStyle.id = 'liste-style';
    if (style) {
      const st = Guide.style(style);
      listeStyle.appendChild(element('p', 'discret', st[2]));
      const apps = Guide.appsDeStyle(style);
      for (const r of ordre) {
        const dans = apps.filter((a) => a.r === r.id).sort((x, y) => (x.sty.indexOf(style) - y.sty.indexOf(style)) || x.nom.localeCompare(y.nom, 'fr'));
        if (!dans.length) continue;
        listeStyle.appendChild(element('h4', 'titre-groupe region-' + r.id, r.nom));
        const groupe = element('div', 'groupe');
        for (const a of dans) groupe.appendChild(Rendu.ligne('a', a, { apercu: false, sous: a.sous }));
        listeStyle.appendChild(groupe);
      }
    }
    zone.appendChild(listeStyle);

    zone.appendChild(Rendu.titre('À découvrir'));
    const acces = element('div', 'acces');
    const porte = (titre, texte, action) => {
      const b = bouton('acces-bouton', null, action);
      b.appendChild(element('span', 'acces-titre', titre));
      b.appendChild(element('span', 'acces-texte', texte));
      acces.appendChild(b);
    };
    porte('Une appellation au hasard', 'Pour sortir de ses habitudes', () => {
      const a = G.appellations[Math.floor(Math.random() * G.appellations.length)];
      Fiche.ouvrir('a', a.id);
    });
    porte('La carte des vignobles', 'Les vignes, appellation par appellation', () => App.aller('carte'));
    porte('Que boire avec… ?', G.plats.length + ' plats et fromages', () => App.aller('accords'));
    porte('Le guide du vin', 'Étiquette, service, classements, lexique', () => App.aller('guide'));
    zone.appendChild(acces);

    zone.appendChild(element('p', 'sante', 'L’abus d’alcool est dangereux pour la santé. À consommer avec modération.'));
  }

  function dessinerResultats(q) {
    const zone = document.getElementById('vins-resultats');
    zone.textContent = '';
    const trouves = Guide.chercher(q, 80);
    if (!trouves.length) {
      const rien = element('div', 'rien');
      rien.appendChild(element('p', 'rien-titre', 'Rien ne correspond.'));
      rien.appendChild(element('p', 'discret', 'Essayez une autre orthographe, ou un mot plus court.'));
      zone.appendChild(rien);
      return;
    }
    zone.appendChild(element('p', 'discret compte', Outils.pluriel(trouves.length, 'résultat', 'résultats')));
    const groupe = element('div', 'groupe');
    for (const r of trouves) {
      groupe.appendChild(Rendu.ligne(r.t, r.f, { requete: q, marque: Guide.NOMS_TYPE[r.t] }));
    }
    zone.appendChild(groupe);
  }

  function surSaisie() {
    const champ = document.getElementById('q');
    const q = champ.value.trim();
    document.getElementById('q-vider').hidden = !champ.value;
    const chercher = q.length >= 2;
    document.getElementById('vins-accueil').hidden = chercher;
    document.getElementById('vins-resultats').hidden = !chercher;
    if (chercher) dessinerResultats(q);
  }

  function brancher() {
    const champ = document.getElementById('q');
    champ.addEventListener('input', () => {
      if (minuterie) clearTimeout(minuterie);
      minuterie = setTimeout(surSaisie, 120);
    });
    champ.addEventListener('keydown', (e) => { if (e.key === 'Enter') champ.blur(); });
    document.getElementById('q-vider').addEventListener('click', () => { champ.value = ''; surSaisie(); champ.focus(); });
    document.addEventListener('favoris-changes', dessinerAccueil);
    dessinerAccueil();
  }

  racine.Vins = {
    brancher,
    focaliser() { const c = document.getElementById('q'); c.focus(); c.select(); },
  };

})(window);
