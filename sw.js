'use strict';
/*
 * Service worker.
 *
 * Tout ce qu'il faut à l'application — pages, feuilles de style, scripts,
 * icônes, le guide et les tracés de la carte, région par région — est rangé
 * d'un seul bloc, dans un cache propre à la version : « cache d'abord », et
 * hors ligne dès le premier lancement.
 *
 * Une version suivante se prépare dans un autre cache et ne prend la main
 * qu'au feu vert du bandeau (js/demarrage.js) : une page ne reçoit jamais
 * qu'un jeu complet d'une seule version.
 *
 * ⚠ La liste ci-dessous doit rester celle des fichiers que la page charge :
 * `build/essais_statiques.mjs` compare les deux et échoue à la moindre différence.
 */

const VERSION = 'v1.1.4';
const COQUILLE = 'terroirs-coquille-' + VERSION;

const FICHIERS = [
  './',
  'index.html',
  'confidentialite.html',
  'manifest.webmanifest',
  'css/theme.css',
  'css/app.css',
  'css/carte.css',
  'css/album.css',
  'js/outils.js',
  'js/memoire.js',
  'js/donnees.js',
  'js/rendu.js',
  'js/fiche.js',
  'js/vins.js',
  'js/cepages.js',
  'js/carte.js',
  'js/accords.js',
  'js/millesimes.js',
  'js/guide.js',
  'js/lecture.js',
  'js/album.js',
  'js/etiquettes.js',
  'js/reglages.js',
  'js/app.js',
  'js/demarrage.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'data/manifeste.json',
  'data/guide.json',
  'data/carte/fond.json',
  'data/carte/alsace.json',
  'data/carte/beaujolais.json',
  'data/carte/bordeaux.json',
  'data/carte/bourgogne.json',
  'data/carte/champagne.json',
  'data/carte/corse.json',
  'data/carte/jura.json',
  'data/carte/languedoc.json',
  'data/carte/loire.json',
  'data/carte/provence.json',
  'data/carte/rhone.json',
  'data/carte/roussillon.json',
  'data/carte/savoie-bugey.json',
  'data/carte/sud-ouest.json',
];

/* La marque des requêtes d'installation : une adresse que personne n'a
 * demandée est fraîche, même derrière le relais de GitHub Pages. */
const MARQUE = '?coquille=' + encodeURIComponent(VERSION);

async function installerLaCoquille(cache) {
  const manques = [];
  await Promise.all(FICHIERS.map(async (url) => {
    try {
      const reponse = await fetch(new Request(url + MARQUE, { cache: 'reload' }));
      if (!reponse.ok) { manques.push(url + ' : ' + reponse.status); return; }
      await cache.put(url, reponse);
    } catch (erreur) {
      manques.push(url + ' : ' + (erreur && erreur.message ? erreur.message : erreur));
    }
  }));
  if (manques.length) throw new Error('coquille incomplète — ' + manques.join(', '));
  const page = await cache.match('index.html');
  const html = page ? await page.text() : '';
  if (html.indexOf('name="application-version" content="' + VERSION + '"') === -1) {
    throw new Error('index.html n’est pas de la version ' + VERSION);
  }
}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(COQUILLE);
    try {
      await installerLaCoquille(cache);
    } catch (erreur) {
      await caches.delete(COQUILLE);
      throw erreur;
    }
    /* Pas de `skipWaiting()` ici : la nouvelle version attend le feu vert. */
  })());
});

self.addEventListener('message', (e) => {
  const message = e.data || {};
  if (message.type === 'passer-devant') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const nom of await caches.keys()) {
      if (nom.startsWith('terroirs-coquille-') && nom !== COQUILLE) await caches.delete(nom);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  e.respondWith((async () => {
    const coquille = await caches.open(COQUILLE);
    const enCache = await coquille.match(e.request, { ignoreSearch: true, ignoreVary: true });
    if (enCache) return enCache;
    try {
      const reponse = await fetch(e.request);
      if (!reponse.ok && e.request.mode === 'navigate') {
        const accueil = await coquille.match('index.html');
        if (accueil) return accueil;
      }
      return reponse;
    } catch (erreur) {
      if (e.request.mode === 'navigate') {
        const accueil = await coquille.match('index.html');
        if (accueil) return accueil;
      }
      throw erreur;
    }
  })());
});
