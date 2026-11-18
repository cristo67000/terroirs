'use strict';
/*
 * Le chef d'orchestre : les réglages, les onglets, l'historique.
 *
 * Cinq onglets (Vins, Cépages, Carte, Accords, Millésimes), deux écrans
 * ouverts depuis l'en-tête (Guide, Réglages) et une fiche qui s'ouvre
 * par-dessus.
 */
(function (racine) {

  let reglages = Memoire.reglages();
  let vue = 'vins';
  const VUES = ['vins', 'cepages', 'carte', 'accords', 'millesimes', 'guide', 'reglages'];
  const TAILLES = [14.5, 16, 18, 20.5];

  function appliquerReglages() {
    const html = document.documentElement;
    if (reglages.theme === 'clair' || reglages.theme === 'sombre') html.setAttribute('data-theme', reglages.theme);
    else html.removeAttribute('data-theme');
    html.setAttribute('data-police', reglages.police === 'sans' ? 'sans' : 'serif');
    html.style.fontSize = (TAILLES[reglages.taille] || 16) + 'px';
    document.dispatchEvent(new CustomEvent('reglages-changes'));
  }

  function ecrireReglage(cle, valeur) {
    reglages = Memoire.ecrireReglage(cle, valeur);
    return valeur;
  }

  function rechargerReglages() {
    reglages = Memoire.reglages();
    appliquerReglages();
  }

  function aller(nom) {
    if (!VUES.includes(nom)) return;
    vue = nom;
    for (const v of VUES) document.getElementById('vue-' + v).hidden = v !== nom;
    for (const b of document.querySelectorAll('#onglets button, #barre button[data-vue]')) {
      if (b.getAttribute('data-vue') === nom) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    }
    document.body.setAttribute('data-vue', nom);
    if (nom === 'cepages') Cepages.montrer();
    if (nom === 'carte') Carte.montrer();
    if (nom === 'accords') Accords.montrer();
    if (nom === 'millesimes') Millesimes.montrer();
    if (nom === 'guide') GuideVue.montrer();
    if (nom === 'reglages') Reglages.dessiner();
    racine.scrollTo(0, 0);
    document.dispatchEvent(new CustomEvent('vue-changee'));
  }

  function surRetour(e) {
    /* Un recul que nous avons nous-mêmes provoqué, l'écran étant déjà fermé :
     * rien à défaire (voir Outils.reculer). */
    if (racine.reculsAttendus > 0) { racine.reculsAttendus -= 1; return; }
    const s = e.state || {};
    if (Fiche.ouverte) {
      if (s.fiche) Fiche.revenirA(s);
      else Fiche.fermerSansHistorique();
    }
  }

  /* Sur un ordinateur : « / » ou Ctrl+K pour chercher, Échap pour refermer. */
  function surTouche(e) {
    if (e.defaultPrevented || e.altKey) return;
    if (e.key === 'Escape') {
      if (Fiche.ouverte) { e.preventDefault(); Fiche.fermer(); }
      return;
    }
    const chercher = ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')
      || (e.key === '/' && !e.ctrlKey && !e.metaKey && !Outils.saisieEnCours(e));
    if (!chercher) return;
    e.preventDefault();
    if (Fiche.ouverte) Fiche.fermer();
    if (vue !== 'vins') aller('vins');
    Vins.focaliser();
  }

  function brancher(donnees) {
    appliquerReglages();

    Fiche.brancher();
    Vins.brancher();
    Cepages.brancher();
    Carte.brancher();
    Accords.brancher();
    Millesimes.brancher();
    GuideVue.brancher();
    Reglages.brancher({ manifeste: donnees.manifeste });

    for (const b of document.querySelectorAll('#onglets button, #barre button[data-vue]')) {
      b.addEventListener('click', () => {
        if (b.getAttribute('data-vue') === vue) racine.scrollTo({ top: 0, behavior: 'smooth' });
        else aller(b.getAttribute('data-vue'));
      });
    }
    racine.addEventListener('popstate', surRetour);
    document.addEventListener('keydown', surTouche);
    document.body.setAttribute('data-vue', vue);

    // « ?fiche=a:pauillac » ouvre directement la fiche ; « ?vue=carte » l'onglet
    const parametres = new URLSearchParams(racine.location.search);
    const demande = parametres.get('fiche');
    const vueDemandee = parametres.get('vue');
    try { racine.history.replaceState(null, '', racine.location.pathname + (parametres.has('sans-sw') ? '?sans-sw' : '')); } catch (e) { /* rien */ }
    if (vueDemandee && VUES.includes(vueDemandee)) aller(vueDemandee);
    if (demande && demande.includes(':')) {
      const [t, id] = demande.split(':');
      if (Guide.get(t, id)) Fiche.ouvrir(t, id);
    }
  }

  racine.App = {
    brancher, aller, appliquerReglages, ecrireReglage, rechargerReglages,
    get reglages() { return reglages; },
    get vue() { return vue; },
  };

})(window);
