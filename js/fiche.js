'use strict';
/*
 * La fiche : une page qui s'ouvre par-dessus l'écran courant, pour une
 * appellation, un cépage, une région, un accord ou une fiche du guide.
 *
 * Chaque fiche ouverte ajoute une entrée à l'historique : le geste « retour »
 * du téléphone remonte de fiche en fiche, puis referme. « Fermer » referme
 * tout d'un coup.
 */
(function (racine) {

  const { element, bouton } = Outils;
  let ouverte = false;
  let profondeur = 0;
  let courante = null;

  const zone = () => document.getElementById('fiche');
  const contenu = () => document.getElementById('fiche-contenu');

  /* ————— les morceaux communs ————— */

  function tete(t, f) {
    const barre = element('div', 'fiche-tete');
    const retour = bouton('fiche-fermer', profondeur > 1 ? '‹ Retour' : '‹ Fermer', () => racine.history.back());
    barre.appendChild(retour);
    barre.appendChild(element('span', 'espace'));
    const cle = t + ':' + f.id;
    const garder = bouton('bouton-etat' + (Memoire.favoris.a(cle) ? ' actif' : ''), Memoire.favoris.a(cle) ? '★ Gardée' : '☆ Garder', () => {
      const oui = Memoire.favoris.basculer(cle);
      garder.textContent = oui ? '★ Gardée' : '☆ Garder';
      garder.classList.toggle('actif', oui);
      garder.classList.remove('pop');
      void garder.offsetWidth;
      garder.classList.add('pop');
      document.dispatchEvent(new CustomEvent('favoris-changes'));
    });
    barre.appendChild(garder);
    if (profondeur > 1) {
      const tout = bouton('bouton-rond', '✕', fermer);
      tout.setAttribute('aria-label', 'Tout fermer');
      barre.appendChild(tout);
    }
    return barre;
  }

  function pastille(texte, classe, action) {
    const p = action ? bouton('pastille ' + (classe || ''), texte, action) : element('span', 'pastille ' + (classe || ''), texte);
    return p;
  }

  function enBref(lignes) {
    const dl = element('dl', 'en-bref');
    for (const [terme, valeur] of lignes) {
      if (!valeur || (valeur.childNodes && !valeur.childNodes.length)) continue;
      dl.appendChild(element('dt', null, terme));
      const dd = element('dd');
      if (typeof valeur === 'string') dd.textContent = valeur; else dd.appendChild(valeur);
      dl.appendChild(dd);
    }
    return dl;
  }

  function definition(texte) {
    const d = element('div', 'definition');
    d.appendChild(element('p', 'definition-texte')).appendChild(Rendu.fragment(texte));
    return d;
  }

  function liensCepages(liste) {
    const frag = document.createDocumentFragment();
    liste.forEach(([id, principal], i) => {
      const c = Guide.get('c', id);
      if (!c) return;
      if (i) frag.appendChild(document.createTextNode(', '));
      const lien = Rendu.renvoi('c', id);
      if (principal) lien.classList.add('principal');
      frag.appendChild(lien);
    });
    return frag;
  }

  function puces(type, ids) {
    const zoneP = element('div', 'voisins');
    for (const id of ids) {
      const f = Guide.get(type, id);
      if (!f) continue;
      const b = bouton('voisin' + (type === 'a' ? ' region-' + f.r : (type === 'r' ? ' region-' + f.id : '')), f.nom.replace(/\s*\(.*\)$/, ''), () => ouvrir(type, id));
      zoneP.appendChild(b);
    }
    return zoneP;
  }

  function zonesMillesimes(regionId) {
    const zones = Guide.zonesDeRegion(regionId);
    if (!zones.length) return null;
    const bloc = element('section', 'bloc-fiche');
    bloc.appendChild(Rendu.titre('Les millésimes'));
    const z = element('div', 'voisins');
    for (const zoneM of zones) {
      z.appendChild(bouton('voisin', zoneM.nom, () => { fermer(); Millesimes.montrerZone(zoneM.id); }));
    }
    bloc.appendChild(z);
    return bloc;
  }

  /* ————— une fiche par type ————— */

  function appellation(a, page) {
    const region = Guide.get('r', a.r);
    page.classList.add('region-' + a.r);
    const infos = element('div', 'fiche-infos');
    if (region) infos.appendChild(pastille(region.nom, 'pastille-region', () => ouvrir('r', region.id)));
    if (a.sous) infos.appendChild(pastille(a.sous));
    infos.appendChild(pastille(a.signe === 'IGP' ? 'IGP' : (Rendu.NIVEAUX[a.niv] || 'AOC'), 'pastille-niveau'));
    page.appendChild(infos);
    page.appendChild(element('h2', 'article-nom', a.nom));
    page.appendChild(Rendu.pastillesCouleur(a.coul, true));
    page.appendChild(definition(a.def));

    if (a.trace) {
      const voir = bouton('bouton-principal bouton-carte-fiche', 'Voir sur la carte', () => { fermer(); Carte.montrerAppellation(a.id); });
      page.appendChild(voir);
    }

    page.appendChild(enBref([
      ['Cépages', liensCepages(a.cep)],
      ['Au nez, en bouche', a.gout],
      ['Garde', a.garde],
      ['Service', a.serv],
      ['Surface', a.surf],
      ['Reconnue en', a.dep],
      ['À connaître', a.crus],
    ]));
    if (a.cep.some((c) => c[1])) page.appendChild(element('p', 'discret petit note-cepages', 'Soulignés d’un trait plein : les cépages principaux.'));

    page.appendChild(Rendu.paragraphes(a.texte));

    const plats = Guide.platsDeApp(a.id);
    const table = element('section', 'bloc-fiche');
    table.appendChild(Rendu.titre('À table'));
    if (plats.length) {
      const classiques = plats.filter((x) => !x.audace).map((x) => x.p);
      const audaces = plats.filter((x) => x.audace).map((x) => x.p);
      if (classiques.length) table.appendChild(puces('p', classiques.map((p) => p.id)));
      if (audaces.length) {
        table.appendChild(element('p', 'discret petit', 'Plus inattendu :'));
        table.appendChild(puces('p', audaces.map((p) => p.id)));
      }
    }
    const styles = element('div', 'voisins');
    for (const s of a.sty) {
      const st = Guide.style(s);
      if (st) styles.appendChild(bouton('voisin style', 'Accords : ' + st[1].toLowerCase(), () => { fermer(); Accords.montrerStyle(s); }));
    }
    table.appendChild(styles);
    page.appendChild(table);

    const mil = zonesMillesimes(a.r);
    if (mil) page.appendChild(mil);

    if (a.voir.length) {
      const voisins = element('section', 'bloc-fiche');
      voisins.appendChild(Rendu.titre('Voir aussi'));
      voisins.appendChild(puces('a', a.voir));
      page.appendChild(voisins);
    }
  }

  function cepage(c, page) {
    const infos = element('div', 'fiche-infos');
    const p = pastille(Rendu.BAIES[c.coul] || 'Cépage');
    p.prepend(Rendu.pastilleBaie(c.coul));
    infos.appendChild(p);
    page.appendChild(infos);
    page.appendChild(element('h2', 'article-nom', c.nom));
    if (c.alias) page.appendChild(element('p', 'article-role', 'Aussi appelé : ' + c.alias));
    page.appendChild(definition(c.def));
    page.appendChild(enBref([
      ['Arômes', c.aro],
      ['Origine', c.orig ? Rendu.fragment(c.orig) : ''],
      ['Surface', c.surf],
    ]));
    page.appendChild(Rendu.paragraphes(c.texte));

    if (c.reg.length) {
      const b = element('section', 'bloc-fiche');
      b.appendChild(Rendu.titre('Ses régions'));
      b.appendChild(puces('r', c.reg));
      page.appendChild(b);
    }
    if (c.app.length) {
      const b = element('section', 'bloc-fiche');
      b.appendChild(Rendu.titre('Où il s’exprime le mieux'));
      b.appendChild(puces('a', c.app));
      page.appendChild(b);
    }
    const emplois = Guide.appsDeCepage(c.id);
    if (emplois.length) {
      const b = element('section', 'bloc-fiche');
      const principaux = emplois.filter((e) => e.principal).length;
      b.appendChild(Rendu.titre('Toutes les appellations qui l’emploient'));
      b.appendChild(element('p', 'discret petit', Outils.pluriel(emplois.length, 'appellation', 'appellations')
        + (principaux ? ', dont ' + principaux + ' comme cépage principal.' : '.')));
      const details = element('details', 'repli');
      details.appendChild(element('summary', null, 'Afficher la liste'));
      const tri = emplois.slice().sort((x, y) => (y.principal - x.principal) || x.a.r.localeCompare(y.a.r) || x.a.nom.localeCompare(y.a.nom, 'fr'));
      const groupe = element('div', 'groupe');
      for (const e of tri) groupe.appendChild(Rendu.ligne('a', e.a, { apercu: false, marque: e.principal ? 'principal' : undefined }));
      details.appendChild(groupe);
      b.appendChild(details);
      page.appendChild(b);
    }
    if (c.voir.length) {
      const b = element('section', 'bloc-fiche');
      b.appendChild(Rendu.titre('Cépages voisins'));
      b.appendChild(puces('c', c.voir));
      page.appendChild(b);
    }
  }

  function region(r, page) {
    page.classList.add('region-' + r.id);
    const apps = Guide.appsDeRegion(r.id);
    const infos = element('div', 'fiche-infos');
    infos.appendChild(pastille('Région viticole', 'pastille-region'));
    infos.appendChild(pastille(Outils.pluriel(apps.length, 'appellation', 'appellations')));
    page.appendChild(infos);
    page.appendChild(element('h2', 'article-nom', r.nom));
    page.appendChild(definition(r.def));
    page.appendChild(bouton('bouton-principal bouton-carte-fiche', 'Voir sur la carte', () => { fermer(); Carte.montrerRegion(r.id); }));
    page.appendChild(enBref([
      ['En chiffres', r.chiffres],
      ['Climat', r.climat ? Rendu.fragment(r.climat) : ''],
      ['Sols', r.sols ? Rendu.fragment(r.sols) : ''],
      ['Cépages', liensCepages(r.cep.map((c) => [c]))],
    ]));
    page.appendChild(Rendu.paragraphes(r.texte));

    const ordre = ['régionale', 'sous-régionale', 'communale', 'cru', 'grand cru', 'IGP'];
    const vus = new Set();
    const section = (nom, def) => {
      const dans = apps.filter((a) => a.sous === nom).sort((x, y) => (ordre.indexOf(x.niv) - ordre.indexOf(y.niv)) || x.nom.localeCompare(y.nom, 'fr'));
      if (!dans.length) return;
      dans.forEach((a) => vus.add(a.id));
      const b = element('section', 'bloc-fiche');
      b.appendChild(element('h3', 'titre-sous', nom));
      if (def) b.appendChild(element('p', 'discret def-sous')).appendChild(Rendu.fragment(def));
      const groupe = element('div', 'groupe');
      for (const a of dans) groupe.appendChild(Rendu.ligne('a', a, { sous: Rendu.NIVEAUX[a.niv] || '' }));
      b.appendChild(groupe);
      page.appendChild(b);
    };
    for (const [nom, def] of r.sous) section(nom, def);
    const autres = Array.from(new Set(apps.filter((a) => !vus.has(a.id)).map((a) => a.sous)));
    for (const nom of autres) section(nom, '');

    const mil = zonesMillesimes(r.id);
    if (mil) page.appendChild(mil);
  }

  function plat(p, page) {
    const infos = element('div', 'fiche-infos');
    infos.appendChild(pastille((Guide.famille(p.fam) || [])[1] || 'Accord'));
    page.appendChild(infos);
    page.appendChild(element('h2', 'article-nom', p.nom));
    page.appendChild(definition(p.conseil));
    if (p.sty.length) {
      const b = element('section', 'bloc-fiche');
      b.appendChild(Rendu.titre('Quel genre de vin ?'));
      for (const s of p.sty) {
        const st = Guide.style(s);
        if (!st) continue;
        const ligne = bouton('style-ligne', null, () => { fermer(); Accords.montrerStyle(s); });
        ligne.appendChild(element('span', 'style-nom', st[1]));
        ligne.appendChild(element('span', 'apercu', st[2]));
        b.appendChild(ligne);
      }
      page.appendChild(b);
    }
    const vins = (ids, titre) => {
      const liste = ids.map((id) => Guide.get('a', id)).filter(Boolean);
      if (!liste.length) return;
      const b = element('section', 'bloc-fiche');
      b.appendChild(Rendu.titre(titre));
      const groupe = element('div', 'groupe');
      for (const a of liste) groupe.appendChild(Rendu.ligne('a', a, { apercu: false }));
      b.appendChild(groupe);
      page.appendChild(b);
    };
    vins(p.vins, 'Les vins qui vont bien');
    vins(p.aud, 'Pour sortir des sentiers battus');
  }

  function guide(g, page) {
    const rub = Guide.donnees.rubriques.find((r) => r[0] === g.rub);
    const infos = element('div', 'fiche-infos');
    infos.appendChild(pastille(rub ? rub[1] : 'Guide'));
    page.appendChild(infos);
    page.appendChild(element('h2', 'article-nom', g.nom));
    if (g.def) page.appendChild(definition(g.def));
    page.appendChild(Rendu.paragraphes(g.texte));
    for (const [titre, items] of g.listes || []) {
      const b = element('section', 'bloc-fiche');
      b.appendChild(Rendu.titre(titre));
      const ul = element('ul', 'liste-guide');
      for (const it of items) ul.appendChild(element('li', null, it));
      b.appendChild(ul);
      page.appendChild(b);
    }
  }

  const DESSINS = { a: appellation, c: cepage, r: region, p: plat, g: guide };

  function dessiner(t, id) {
    const f = Guide.get(t, id);
    const c = contenu();
    c.textContent = '';
    c.className = 'type-' + t;
    if (!f) { c.appendChild(element('p', null, 'Fiche introuvable.')); return; }
    courante = { t, id };
    c.appendChild(tete(t, f));
    DESSINS[t](f, c);
    if (t === 'a' || t === 'c' || t === 'r') {
      c.appendChild(element('p', 'sante', 'L’abus d’alcool est dangereux pour la santé. À consommer avec modération.'));
    }
    Memoire.lus.ajouter(t + ':' + id);
    zone().scrollTop = 0;
    c.classList.remove('change');
    void c.offsetWidth;
    c.classList.add('change');
  }

  function ouvrir(t, id) {
    if (!Guide.get(t, id)) return;
    profondeur += 1;
    try { racine.history.pushState({ fiche: { t, id }, n: profondeur }, ''); } catch (e) { /* rien */ }
    if (!ouverte) {
      ouverte = true;
      zone().hidden = false;
      zone().classList.add('entree');
      document.body.classList.add('fiche-ouverte');
    }
    dessiner(t, id);
  }

  /* « Retour » du téléphone : l'historique a déjà reculé. */
  function revenirA(etat) {
    profondeur = etat.n || 1;
    dessiner(etat.fiche.t, etat.fiche.id);
  }

  function fermerSansHistorique() {
    ouverte = false;
    profondeur = 0;
    courante = null;
    zone().hidden = true;
    zone().classList.remove('entree');
    document.body.classList.remove('fiche-ouverte');
    document.dispatchEvent(new CustomEvent('fiche-fermee'));
  }

  function fermer() {
    if (!ouverte) return;
    const n = profondeur;
    fermerSansHistorique();
    Outils.reculer(n);
  }

  racine.Fiche = {
    ouvrir, fermer, fermerSansHistorique, revenirA,
    get ouverte() { return ouverte; },
    get courante() { return courante; },
    brancher() { /* rien à préparer : la fiche se dessine à la demande */ },
  };

})(window);
