'use strict';
/*
 * Amorçage : le guide, puis le service worker.
 *
 * Le service worker est enregistré en dernier, une fois l'application à
 * l'écran : il sert au deuxième lancement, pas au premier. Quand une version
 * suivante est prête, un bandeau la propose ; elle ne prend la main qu'au feu
 * vert, pour ne pas changer l'application sous les doigts.
 */
(function () {

  function surveiller(enregistrement) {
    const bandeau = document.getElementById('mise-a-jour');
    const proposer = (travailleur) => {
      if (!travailleur || !navigator.serviceWorker.controller) return;
      bandeau.hidden = false;
      requestAnimationFrame(() => bandeau.classList.add('visible'));
      document.getElementById('b-mettre-a-jour').onclick = () => {
        travailleur.postMessage({ type: 'passer-devant' });
      };
      document.getElementById('b-maj-plus-tard').onclick = () => {
        bandeau.classList.remove('visible');
        setTimeout(() => { bandeau.hidden = true; }, 250);
      };
    };
    if (enregistrement.waiting) proposer(enregistrement.waiting);
    enregistrement.addEventListener('updatefound', () => {
      const nouveau = enregistrement.installing;
      if (!nouveau) return;
      nouveau.addEventListener('statechange', () => {
        if (nouveau.state === 'installed') proposer(nouveau);
      });
    });
    let recharge = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (recharge || !bandeau.classList.contains('visible')) return;
      recharge = true;
      location.reload();
    });
  }

  async function demarrer() {
    const ecran = document.getElementById('demarrage');
    try {
      const reponse = await fetch('data/manifeste.json');
      if (!reponse.ok) throw new Error('manifeste : ' + reponse.status);
      const manifeste = await reponse.json();
      await Guide.charger();
      App.brancher({ manifeste });
      ecran.classList.add('parti');
      setTimeout(() => { ecran.hidden = true; }, 300);
    } catch (erreur) {
      ecran.textContent = '';
      ecran.appendChild(Outils.element('p', null, 'Le guide n’a pas pu s’ouvrir.'));
      ecran.appendChild(Outils.element('p', 'discret', String(erreur && erreur.message ? erreur.message : erreur)));
      ecran.appendChild(Outils.bouton('bouton-discret', 'Réessayer', () => location.reload()));
      return;
    }

    /* « ?sans-sw » : pour travailler sur l'application sans que le cache serve
     * l'ancienne version de chaque fichier modifié. Il faut alors recharger une
     * fois encore : la page qui congédie le service worker a été servie par lui. */
    const sansSw = new URLSearchParams(location.search).has('sans-sw');
    if (sansSw && 'serviceWorker' in navigator) {
      // un service worker déjà installé servirait quand même son cache : on le congédie
      navigator.serviceWorker.getRegistrations().then((liste) => liste.forEach((e) => e.unregister())).catch(() => {});
      if (window.caches) {
        caches.keys().then((noms) => noms.filter((n) => n.startsWith('terroirs-coquille-')).forEach((n) => caches.delete(n))).catch(() => {});
      }
    }
    if ('serviceWorker' in navigator && !sansSw) {
      navigator.serviceWorker.register('sw.js')
        .then(surveiller)
        .catch((erreur) => console.warn('Terroirs : service worker non installé —', erreur));
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();

})();
