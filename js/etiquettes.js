'use strict';
/*
 * L'onglet « Album » : photographier une étiquette, la ranger, la retrouver.
 *
 * Trois écrans dans le même onglet : les dossiers, un dossier, une étiquette.
 * Chaque pas en avant ajoute une entrée à l'historique, pour que le geste
 * « retour » du téléphone remonte d'un écran au lieu de quitter l'application.
 *
 * La photo est prise par l'appareil photo du téléphone (un simple champ
 * « fichier ») : l'application ne demande aucune autorisation. Elle est
 * réduite avant d'être rangée, pour que l'album reste léger.
 */
(function (racine) {

  const { element, bouton, normaliser } = Outils;

  const GRAND = 1600;     // le plus long côté de la photo gardée
  const PETIT = 360;      // celui de la vignette
  const TOUT = 'tout';

  let photos = [];
  let dossiers = [];
  let ou = { dossier: null, photo: null };   // dossier : null = la liste des dossiers
  let panne = null;
  const vignettes = new Map();               // id -> adresse de la vignette
  let adresseGrande = null;
  let tour = 0;

  const zone = () => document.getElementById('album-contenu');

  /* ————— les dossiers ————— */

  function nomDossier(id) {
    if (id === TOUT) return 'Toutes les étiquettes';
    if (!id) return 'À classer';
    if (id.startsWith('r:')) return (Guide.get('r', id.slice(2)) || {}).nom || 'Région';
    return (dossiers.find((d) => d.id === id) || {}).nom || 'Dossier';
  }
  const existe = (id) => id === TOUT || id === '' || (id.startsWith('r:') ? !!Guide.get('r', id.slice(2)) : dossiers.some((d) => d.id === id));
  const dans = (id) => (id === TOUT ? photos : photos.filter((p) => p.dossier === id));
  const classeRegion = (id) => (id && id.startsWith('r:') ? ' region-' + id.slice(2) : '');

  function titrePhoto(p) {
    const a = p.app ? Guide.get('a', p.app) : null;
    return p.nom || (a ? a.nom : 'Sans nom');
  }

  /* ————— les images ————— */

  function adresseVignette(p) {
    if (!vignettes.has(p.id)) vignettes.set(p.id, URL.createObjectURL(p.vignette));
    return vignettes.get(p.id);
  }
  function oublierVignette(id) {
    if (vignettes.has(id)) { URL.revokeObjectURL(vignettes.get(id)); vignettes.delete(id); }
  }
  function oublierGrande() {
    if (adresseGrande) { URL.revokeObjectURL(adresseGrande); adresseGrande = null; }
  }

  async function ouvrirImage(fichier) {
    if (racine.createImageBitmap) {
      try { return await racine.createImageBitmap(fichier, { imageOrientation: 'from-image' }); } catch (e) { /* on essaie autrement */ }
    }
    return new Promise((oui, non) => {
      const adresse = URL.createObjectURL(fichier);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(adresse); oui(img); };
      img.onerror = () => { URL.revokeObjectURL(adresse); non(new Error('image illisible')); };
      img.src = adresse;
    });
  }

  function reduire(img, cote, qualite) {
    const l = img.width || img.naturalWidth;
    const h = img.height || img.naturalHeight;
    const echelle = Math.min(1, cote / Math.max(l, h));
    const toile = document.createElement('canvas');
    toile.width = Math.max(1, Math.round(l * echelle));
    toile.height = Math.max(1, Math.round(h * echelle));
    const trait = toile.getContext('2d');
    trait.imageSmoothingQuality = 'high';
    trait.drawImage(img, 0, 0, toile.width, toile.height);
    return new Promise((oui, non) => toile.toBlob((b) => (b ? oui(b) : non(new Error('image non convertie'))), 'image/jpeg', qualite));
  }

  /* ————— ajouter ————— */

  async function recevoir(fichiers) {
    const liste = Array.from(fichiers || []).filter((f) => /^image\//.test(f.type) || !f.type);
    if (!liste.length) return;
    const dossier = ou.dossier && ou.dossier !== TOUT ? ou.dossier : '';
    let derniere = null;
    let rates = 0;
    for (const fichier of liste) {
      try {
        const img = await ouvrirImage(fichier);
        const grande = await reduire(img, GRAND, 0.86);
        const vignette = await reduire(img, PETIT, 0.8);
        if (img.close) img.close();
        const photo = { id: Outils.identifiant('e'), cree: Date.now(), dossier, nom: '', app: '', annee: null, note: '', vignette };
        await Album.ajouter(photo, grande);
        derniere = photo;
      } catch (erreur) {
        rates += 1;
        console.warn('Terroirs : photo non enregistrée —', erreur);
      }
    }
    await charger();
    if (rates) Outils.annoncer(rates === liste.length ? 'La photo n’a pas pu être enregistrée.' : Outils.pluriel(rates, 'photo n’a pas pu', 'photos n’ont pas pu') + ' être enregistrée' + (rates > 1 ? 's.' : '.'));
    /* Une seule photo : on l'ouvre, pour la nommer tant que la bouteille est là. */
    if (liste.length === 1 && derniere) avancer({ dossier: ou.dossier, photo: derniere.id });
    else { dessiner(); if (derniere && !rates) Outils.annoncer(Outils.pluriel(liste.length, 'étiquette ajoutée', 'étiquettes ajoutées') + '.'); }
  }

  function boutonsAjout() {
    const rangee = element('div', 'album-actions');
    const champ = (capture) => {
      const c = element('input');
      c.type = 'file';
      c.accept = 'image/*';
      c.hidden = true;
      if (capture) c.setAttribute('capture', 'environment'); else c.multiple = true;
      c.addEventListener('change', () => { const f = Array.from(c.files); c.value = ''; recevoir(f); });
      rangee.appendChild(c);
      return c;
    };
    const appareil = champ(true);
    const galerie = champ(false);
    rangee.appendChild(bouton('bouton-principal', 'Photographier une étiquette', () => appareil.click()));
    rangee.appendChild(bouton('bouton-discret', 'Choisir des images', () => galerie.click()));
    return rangee;
  }

  /* ————— l'écran des dossiers ————— */

  function carteDossier(id, classe) {
    const contenu = dans(id);
    const b = bouton('carte-region dossier ' + (classe || '') + classeRegion(id) + (contenu.length ? '' : ' vide'), null, () => avancer({ dossier: id, photo: null }));
    const texte = element('span', 'dossier-texte');
    texte.appendChild(element('span', 'carte-region-nom', nomDossier(id)));
    texte.appendChild(element('span', 'carte-region-nombre', Outils.pluriel(contenu.length, 'étiquette', 'étiquettes')));
    b.appendChild(texte);
    if (contenu.length) {
      const img = element('img', 'dossier-couverture');
      img.src = adresseVignette(contenu[0]);
      img.alt = '';
      b.appendChild(img);
    }
    return b;
  }

  async function nouveauDossier() {
    const nom = (racine.prompt('Le nom du dossier :', '') || '').trim().slice(0, 60);
    if (!nom) return null;
    const existant = dossiers.find((d) => normaliser(d.nom) === normaliser(nom));
    if (existant) return existant.id;
    const dossier = { id: Outils.identifiant('d:'), nom };
    await Album.ecrireDossier(dossier);
    dossiers = await Album.dossiers();
    return dossier.id;
  }

  function dessinerDossiers(z) {
    z.appendChild(element('h2', null, 'L’album d’étiquettes'));
    z.appendChild(element('p', 'discret intro-vue', photos.length
      ? 'Vos bouteilles, rangées par région ou dans vos propres dossiers.'
      : 'Photographiez l’étiquette d’une bouteille pour vous en souvenir : rangez-la par région ou dans vos propres dossiers, notez-y l’appellation, le millésime, ce que vous en avez pensé. Les photos restent dans cet appareil.'));
    z.appendChild(boutonsAjout());

    z.appendChild(Rendu.titre('Vos dossiers'));
    const perso = element('div', 'grille-dossiers');
    perso.appendChild(carteDossier(TOUT, 'dossier-tout'));
    if (dans('').length) perso.appendChild(carteDossier('', 'dossier-attente'));
    for (const d of dossiers) perso.appendChild(carteDossier(d.id, 'dossier-perso'));
    perso.appendChild(bouton('carte-region dossier nouveau', '+ Nouveau dossier', async () => {
      const id = await nouveauDossier();
      if (id) dessiner();
    }));
    z.appendChild(perso);

    z.appendChild(Rendu.titre('Par région'));
    const regions = element('div', 'grille-dossiers');
    const ordre = Guide.donnees.regions.slice().sort((x, y) => x.nom.localeCompare(y.nom, 'fr'));
    for (const r of ordre) regions.appendChild(carteDossier('r:' + r.id));
    z.appendChild(regions);
  }

  /* ————— l'écran d'un dossier ————— */

  function dessinerDossier(z) {
    const id = ou.dossier;
    const tete = element('div', 'album-tete' + classeRegion(id));
    tete.appendChild(bouton('fiche-fermer', '‹ Dossiers', reculer));
    tete.appendChild(element('h2', null, nomDossier(id)));
    z.appendChild(tete);

    if (id.startsWith('d:')) {
      const outils = element('div', 'album-outils');
      outils.appendChild(bouton('lien-discret', 'Renommer', async () => {
        const d = dossiers.find((x) => x.id === id);
        const nom = (racine.prompt('Le nom du dossier :', d.nom) || '').trim().slice(0, 60);
        if (!nom || nom === d.nom) return;
        await Album.ecrireDossier({ id, nom });
        await charger();
        dessiner();
      }));
      outils.appendChild(bouton('lien-discret', 'Supprimer le dossier', async () => {
        const n = dans(id).length;
        if (!racine.confirm('Supprimer le dossier « ' + nomDossier(id) + ' » ?' + (n ? ' Ses étiquettes ne sont pas supprimées : elles repassent « à classer ».' : ''))) return;
        await Album.supprimerDossier(id);
        await charger();
        reculer();
        Outils.annoncer('Dossier supprimé.');
      }));
      z.appendChild(outils);
    }

    z.appendChild(boutonsAjout());

    const contenu = dans(id);
    if (!contenu.length) {
      z.appendChild(element('p', 'rien discret', id === TOUT ? 'L’album est vide.' : 'Aucune étiquette dans ce dossier.'));
      return;
    }
    const grille = element('div', 'grille-photos');
    for (const p of contenu) {
      const b = bouton('vignette' + classeRegion(p.dossier), null, () => avancer({ dossier: id, photo: p.id }));
      const img = element('img');
      img.src = adresseVignette(p);
      img.alt = '';
      img.loading = 'lazy';
      b.appendChild(img);
      b.appendChild(element('span', 'vignette-nom', titrePhoto(p)));
      const a = p.app && p.nom ? Guide.get('a', p.app) : null;
      const sous = [a ? a.nom : '', p.annee || ''].filter(Boolean).join(' · ');
      b.appendChild(element('span', 'vignette-sous', sous || (id === TOUT ? nomDossier(p.dossier) : ' ')));
      grille.appendChild(b);
    }
    z.appendChild(grille);
  }

  /* ————— l'écran d'une étiquette ————— */

  function champ(libelle, controle) {
    const l = element('label', 'champ');
    l.appendChild(element('span', 'champ-nom', libelle));
    l.appendChild(controle);
    return l;
  }

  async function enregistrer(p, quoi) {
    Object.assign(p, quoi);
    try { await Album.modifier(p); } catch (erreur) { Outils.annoncer('La modification n’a pas pu être enregistrée.'); }
  }

  /* L'appellation tapée -> la fiche du guide, si elle existe. */
  function trouverAppellation(texte) {
    const q = normaliser(texte);
    if (!q) return null;
    const exacte = Guide.donnees.appellations.find((a) => normaliser(a.nom) === q);
    if (exacte) return exacte;
    const proche = Guide.chercher(texte, 20).find((r) => r.t === 'a' && r.via !== 'def');
    return proche ? proche.f : null;
  }

  async function partager(p) {
    const image = await Album.image(p.id);
    if (!image) return;
    const nom = (normaliser(titrePhoto(p)).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'etiquette') + (p.annee ? '-' + p.annee : '') + '.jpg';
    try {
      const fichier = new File([image], nom, { type: 'image/jpeg' });
      if (racine.navigator.canShare && racine.navigator.canShare({ files: [fichier] })) {
        await racine.navigator.share({ files: [fichier], title: titrePhoto(p) });
        return;
      }
    } catch (erreur) {
      if (erreur && erreur.name === 'AbortError') return;
    }
    const lien = element('a');
    const adresse = URL.createObjectURL(image);
    lien.href = adresse;
    lien.download = nom;
    document.body.appendChild(lien);
    lien.click();
    lien.remove();
    setTimeout(() => URL.revokeObjectURL(adresse), 30000);
  }

  async function supprimerPhoto(p) {
    const image = await Album.image(p.id);
    await Album.supprimer(p.id);
    await charger();
    reculer();
    Outils.annoncer('Étiquette supprimée.', async () => {
      await Album.ajouter(p, image);
      await charger();
      dessiner();
    });
  }

  function dessinerPhoto(z) {
    const p = photos.find((x) => x.id === ou.photo);
    const monTour = tour;

    const tete = element('div', 'album-tete');
    tete.appendChild(bouton('fiche-fermer', '‹ Retour', reculer));
    tete.appendChild(element('span', 'espace'));
    tete.appendChild(bouton('bouton-etat', 'Partager', () => partager(p)));
    tete.appendChild(bouton('bouton-etat danger', 'Supprimer', () => supprimerPhoto(p)));
    z.appendChild(tete);

    const img = element('img', 'photo-grande');
    img.alt = 'Étiquette : ' + titrePhoto(p);
    img.src = adresseVignette(p);
    z.appendChild(img);
    Album.image(p.id).then((image) => {
      if (monTour !== tour || !image) return;
      oublierGrande();
      adresseGrande = URL.createObjectURL(image);
      img.src = adresseGrande;
    }).catch(() => {});

    const propositions = element('div');
    z.appendChild(propositions);
    const fiche = element('div');
    const champs = element('div', 'champs');

    /* le nom */
    const nom = element('input');
    nom.type = 'text';
    nom.maxLength = 120;
    nom.autocomplete = 'off';
    nom.placeholder = 'Domaine, cuvée… ou tout ce qui est écrit';
    nom.value = p.nom;
    champs.appendChild(champ('Nom', nom));

    /* l'appellation, avec les noms du guide en suggestion */
    const liste = element('datalist');
    liste.id = 'album-appellations';
    for (const a of Guide.donnees.appellations) liste.appendChild(element('option')).value = a.nom;
    const app = element('input');
    app.type = 'text';
    app.autocomplete = 'off';
    app.setAttribute('list', liste.id);
    app.placeholder = 'Pauillac, Sancerre…';
    const ecrireApp = () => { app.value = p.app && Guide.get('a', p.app) ? Guide.get('a', p.app).nom : ''; };
    ecrireApp();
    champs.appendChild(champ('Appellation', app));
    champs.appendChild(liste);

    /* le millésime et le dossier, côte à côte */
    const deux = element('div', 'champs-deux');
    const annee = element('input');
    annee.type = 'number';
    annee.inputMode = 'numeric';
    annee.min = 1900;
    annee.max = new Date().getFullYear();
    annee.placeholder = '—';
    annee.value = p.annee || '';
    deux.appendChild(champ('Millésime', annee));

    const dossier = element('select');
    const remplirDossiers = () => {
      dossier.textContent = '';
      const option = (valeur, texte, parent) => { const o = element('option', null, texte); o.value = valeur; (parent || dossier).appendChild(o); };
      option('', 'À classer');
      if (dossiers.length) {
        const g = element('optgroup'); g.label = 'Vos dossiers';
        for (const d of dossiers) option(d.id, d.nom, g);
        dossier.appendChild(g);
      }
      const g = element('optgroup'); g.label = 'Régions';
      for (const r of Guide.donnees.regions.slice().sort((x, y) => x.nom.localeCompare(y.nom, 'fr'))) option('r:' + r.id, r.nom, g);
      dossier.appendChild(g);
      option('+', '+ Nouveau dossier…');
      dossier.value = existe(p.dossier) ? p.dossier : '';
    };
    remplirDossiers();
    deux.appendChild(champ('Dossier', dossier));
    champs.appendChild(deux);

    const note = element('textarea');
    note.rows = 3;
    note.maxLength = 2000;
    note.placeholder = 'Bue avec qui, avec quoi, ce que vous en avez pensé…';
    note.value = p.note;
    champs.appendChild(champ('Notes', note));
    z.appendChild(champs);
    z.appendChild(fiche);
    z.appendChild(element('p', 'discret petit', 'Ajoutée le ' + Outils.dateLisible(p.cree) + '.'));

    /* Choisir une appellation range aussi la photo dans sa région, si elle
     * n'est pas encore classée. */
    const choisirAppellation = async (a) => {
      const quoi = { app: a ? a.id : '' };
      if (a && !p.dossier) quoi.dossier = 'r:' + a.r;
      const range = quoi.dossier !== undefined;
      await enregistrer(p, quoi);
      ecrireApp();
      dossier.value = p.dossier;
      if (range) Outils.annoncer('Rangée dans « ' + nomDossier(p.dossier) + ' ».');
      liens();
      proposer();
    };

    /* Le lien vers la fiche du guide, et le millésime s'il est connu. */
    function liens() {
      fiche.textContent = '';
      const a = p.app ? Guide.get('a', p.app) : null;
      if (!a) return;
      const rangee = element('div', 'voisins album-liens');
      rangee.appendChild(bouton('voisin region-' + a.r, 'La fiche : ' + a.nom, () => Fiche.ouvrir('a', a.id)));
      const zones = Guide.zonesDeRegion(a.r);
      if (p.annee && zones.length === 1 && racine.Millesimes && Millesimes.montrerZone) {
        rangee.appendChild(bouton('voisin style', 'Les millésimes : ' + zones[0].nom, () => Millesimes.montrerZone(zones[0].id)));
      }
      fiche.appendChild(rangee);
    }

    /* Ce que le guide reconnaît dans le nom : une proposition, jamais d'office. */
    function proposer() {
      propositions.textContent = '';
      const lu = Lecture.lire(p.nom, Guide.donnees);
      const puces = [];
      for (const { f } of lu.appellations) {
        if (f.id !== p.app) puces.push(bouton('voisin region-' + f.r, 'Appellation : ' + f.nom, () => choisirAppellation(f)));
      }
      if (lu.annee && lu.annee !== p.annee) {
        puces.push(bouton('voisin style', 'Millésime : ' + lu.annee, async () => { await enregistrer(p, { annee: lu.annee }); annee.value = lu.annee; liens(); proposer(); }));
      }
      if (lu.region && !p.dossier && !lu.appellations.length) {
        puces.push(bouton('voisin region-' + lu.region, 'Ranger dans : ' + nomDossier('r:' + lu.region), async () => { await enregistrer(p, { dossier: 'r:' + lu.region }); dossier.value = p.dossier; proposer(); }));
      }
      if (!puces.length) return;
      const bloc = element('div', 'propositions');
      bloc.appendChild(element('p', 'propositions-titre', 'Reconnu dans le nom — touchez pour l’inscrire :'));
      const rangee = element('div', 'voisins');
      for (const b of puces) rangee.appendChild(b);
      bloc.appendChild(rangee);
      propositions.appendChild(bloc);
    }

    nom.addEventListener('change', async () => { await enregistrer(p, { nom: nom.value.trim() }); proposer(); });
    app.addEventListener('change', () => {
      const texte = app.value.trim();
      const a = trouverAppellation(texte);
      if (texte && !a) { Outils.annoncer('Cette appellation n’est pas dans le guide.'); ecrireApp(); return; }
      choisirAppellation(a);
    });
    annee.addEventListener('change', async () => {
      const n = Math.round(Number(annee.value));
      const bonne = n >= 1900 && n <= new Date().getFullYear() ? n : null;
      await enregistrer(p, { annee: bonne });
      annee.value = bonne || '';
      liens();
      proposer();
    });
    dossier.addEventListener('change', async () => {
      let id = dossier.value;
      if (id === '+') {
        id = await nouveauDossier();
        remplirDossiers();
        if (!id) return;
      }
      await enregistrer(p, { dossier: id });
      dossier.value = id;
      Outils.annoncer('Rangée dans « ' + nomDossier(id) + ' ».');
      proposer();
    });
    note.addEventListener('change', () => enregistrer(p, { note: note.value.trim() }));

    liens();
    proposer();
  }

  /* ————— l'ensemble ————— */

  async function charger() {
    try {
      [photos, dossiers] = await Promise.all([Album.photos(), Album.dossiers()]);
      panne = null;
    } catch (erreur) {
      photos = [];
      dossiers = [];
      panne = erreur;
    }
    const vivants = new Set(photos.map((p) => p.id));
    for (const id of Array.from(vignettes.keys())) if (!vivants.has(id)) oublierVignette(id);
    document.dispatchEvent(new CustomEvent('album-change'));
  }

  function dessiner() {
    tour += 1;
    const z = zone();
    z.textContent = '';
    if (panne) {
      z.appendChild(element('h2', null, 'L’album d’étiquettes'));
      z.appendChild(element('p', null, 'L’album ne peut pas s’ouvrir : ce navigateur refuse de garder des photos (navigation privée, peut-être).'));
      return;
    }
    /* un dossier ou une photo disparus entre-temps : on remonte d'un cran */
    if (ou.photo && !photos.some((p) => p.id === ou.photo)) ou.photo = null;
    if (ou.dossier !== null && !existe(ou.dossier)) ou.dossier = null;
    if (!ou.photo) oublierGrande();
    if (ou.photo) dessinerPhoto(z);
    else if (ou.dossier !== null) dessinerDossier(z);
    else dessinerDossiers(z);
  }

  function avancer(etat) {
    ou = { dossier: etat.dossier === undefined ? null : etat.dossier, photo: etat.photo || null };
    try { racine.history.pushState({ album: ou }, ''); } catch (e) { /* rien */ }
    dessiner();
    racine.scrollTo(0, 0);
  }

  function reculer() {
    if (racine.history.state && racine.history.state.album) { racine.history.back(); return; }
    /* pas d'entrée à défaire (page rechargée…) : on remonte à la main */
    ou = ou.photo ? { dossier: ou.dossier, photo: null } : { dossier: null, photo: null };
    dessiner();
  }

  /* « Retour » du téléphone : l'historique a déjà reculé. */
  function surRetour(etat) {
    const a = (etat && etat.album) || {};
    ou = { dossier: a.dossier === undefined ? null : a.dossier, photo: a.photo || null };
    dessiner();
    racine.scrollTo(0, 0);
  }

  async function montrer() {
    await charger();
    dessiner();
  }

  racine.Etiquettes = {
    montrer, surRetour,
    brancher() {
      /* quitter l'onglet ramène l'album à ses dossiers */
      document.addEventListener('vue-changee', () => { if (App.vue !== 'album') { ou = { dossier: null, photo: null }; oublierGrande(); } });
    },
  };

})(window);
