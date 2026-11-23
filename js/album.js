'use strict';
/*
 * L'album : les photos d'étiquettes et leurs dossiers, gardés dans l'appareil.
 *
 * Une base IndexedDB, trois tiroirs :
 *   photos   — la fiche de chaque étiquette et sa vignette (ce qu'il faut pour
 *              dessiner l'album sans ouvrir les grandes images) ;
 *   images   — la photo en grand, une par fiche, lue à la demande ;
 *   dossiers — les dossiers créés à la main (ceux des régions vont de soi).
 *
 * Le dossier d'une photo est une simple marque : « r:alsace » pour une région,
 * « d:… » pour un dossier créé à la main, « » tant qu'elle n'est pas classée.
 * Rien ne quitte l'appareil.
 */
(function (racine) {

  const BASE = 'terroirs-album';
  let ouverture = null;

  function ouvrir() {
    if (ouverture) return ouverture;
    ouverture = new Promise((oui, non) => {
      if (!racine.indexedDB) { non(new Error('stockage indisponible')); return; }
      let demande;
      try { demande = racine.indexedDB.open(BASE, 1); } catch (erreur) { non(erreur); return; }
      demande.onupgradeneeded = () => {
        const base = demande.result;
        if (!base.objectStoreNames.contains('photos')) base.createObjectStore('photos', { keyPath: 'id' });
        if (!base.objectStoreNames.contains('images')) base.createObjectStore('images');
        if (!base.objectStoreNames.contains('dossiers')) base.createObjectStore('dossiers', { keyPath: 'id' });
      };
      demande.onsuccess = () => oui(demande.result);
      demande.onerror = () => non(demande.error || new Error('stockage refusé'));
    });
    ouverture.catch(() => { ouverture = null; });
    return ouverture;
  }

  /* Une transaction : `travail` reçoit les tiroirs et rend, s'il veut un
   * résultat, une requête ; la promesse se tient quand tout est écrit. */
  async function transaction(tiroirs, mode, travail) {
    const base = await ouvrir();
    return new Promise((oui, non) => {
      const t = base.transaction(tiroirs, mode);
      const magasins = {};
      for (const nom of tiroirs) magasins[nom] = t.objectStore(nom);
      let requete = null;
      try { requete = travail(magasins); } catch (erreur) { non(erreur); return; }
      t.oncomplete = () => oui(requete ? requete.result : undefined);
      t.onerror = () => non(t.error || new Error('écriture refusée'));
      t.onabort = () => non(t.error || new Error('écriture interrompue'));
    });
  }

  const photos = () => transaction(['photos'], 'readonly', (m) => m.photos.getAll())
    .then((liste) => liste.sort((x, y) => y.cree - x.cree));
  const image = (id) => transaction(['images'], 'readonly', (m) => m.images.get(id));
  const dossiers = () => transaction(['dossiers'], 'readonly', (m) => m.dossiers.getAll())
    .then((liste) => liste.sort((x, y) => x.nom.localeCompare(y.nom, 'fr')));

  function ajouter(photo, grande) {
    /* Demander au navigateur de ne pas faire le ménage dans l'album. */
    try { if (racine.navigator.storage && racine.navigator.storage.persist) racine.navigator.storage.persist().catch(() => {}); } catch (e) { /* rien */ }
    return transaction(['photos', 'images'], 'readwrite', (m) => { m.photos.put(photo); m.images.put(grande, photo.id); });
  }

  const modifier = (photo) => transaction(['photos'], 'readwrite', (m) => { m.photos.put(photo); });
  const supprimer = (id) => transaction(['photos', 'images'], 'readwrite', (m) => { m.photos.delete(id); m.images.delete(id); });
  const ecrireDossier = (dossier) => transaction(['dossiers'], 'readwrite', (m) => { m.dossiers.put(dossier); });

  /* Supprimer un dossier ne supprime pas ses photos : elles redeviennent « à classer ». */
  async function supprimerDossier(id) {
    const liste = await photos();
    return transaction(['photos', 'dossiers'], 'readwrite', (m) => {
      for (const p of liste) if (p.dossier === id) m.photos.put(Object.assign({}, p, { dossier: '' }));
      m.dossiers.delete(id);
    });
  }

  const vider = () => transaction(['photos', 'images', 'dossiers'], 'readwrite', (m) => {
    m.photos.clear(); m.images.clear(); m.dossiers.clear();
  });

  /* Le nombre d'étiquettes et la place qu'elles prennent. */
  async function bilan() {
    const liste = await photos();
    const grandes = await transaction(['images'], 'readonly', (m) => m.images.getAll());
    let octets = 0;
    for (const p of liste) octets += p.vignette ? p.vignette.size : 0;
    for (const g of grandes) octets += g ? g.size : 0;
    return { nombre: liste.length, octets };
  }

  racine.Album = { photos, image, dossiers, ajouter, modifier, supprimer, ecrireDossier, supprimerDossier, vider, bilan };

})(window);
