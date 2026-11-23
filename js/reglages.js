'use strict';
/*
 * L'écran « Réglages » : l'apparence, la mémoire, et ce qu'il faut savoir du
 * guide — ses sources, ses limites, ce qu'il ne fait pas.
 */
(function (racine) {

  const { element, bouton } = Outils;
  let manifeste = null;

  function segments(cle, choix) {
    const groupe = element('div', 'segments');
    groupe.setAttribute('role', 'group');
    for (const [valeur, nom] of choix) {
      const b = bouton(null, nom, () => {
        App.ecrireReglage(cle, valeur);
        App.appliquerReglages();
        dessiner();
      });
      b.setAttribute('aria-pressed', App.reglages[cle] === valeur ? 'true' : 'false');
      groupe.appendChild(b);
    }
    return groupe;
  }

  function bloc(titre) {
    const b = element('section', 'bloc');
    b.appendChild(element('h3', null, titre));
    return b;
  }

  function dessiner() {
    const zone = document.getElementById('reglages-contenu');
    zone.textContent = '';
    zone.appendChild(element('h2', null, 'Réglages'));

    const apparence = bloc('Apparence');
    apparence.appendChild(element('h4', null, 'Ambiance'));
    apparence.appendChild(segments('theme', [['auto', 'Automatique'], ['clair', 'Craie'], ['sombre', 'Cave']]));
    apparence.appendChild(element('h4', null, 'Taille du texte'));
    apparence.appendChild(segments('taille', [[0, 'Petit'], [1, 'Normal'], [2, 'Grand'], [3, 'Très grand']]));
    apparence.appendChild(element('h4', null, 'Police des fiches'));
    apparence.appendChild(segments('police', [['serif', 'À empattements'], ['sans', 'Sans empattements']]));
    zone.appendChild(apparence);

    const memoire = bloc('Votre lecture');
    memoire.appendChild(element('p', null, Outils.pluriel(Memoire.favoris.nombre(), 'fiche gardée', 'fiches gardées') + ', '
      + Outils.pluriel(Memoire.lus.nombre(), 'fiche ouverte', 'fiches ouvertes') + '.'));
    memoire.appendChild(bouton('bouton-discret espace-haut', 'Tout oublier', () => {
      if (!racine.confirm('Oublier les fiches gardées et les fiches lues ? Les réglages d’apparence sont remis à zéro.')) return;
      Memoire.toutEffacer();
      App.rechargerReglages();
      document.dispatchEvent(new CustomEvent('favoris-changes'));
      dessiner();
      Outils.annoncer('Mémoire effacée.');
    }));
    memoire.appendChild(element('p', 'discret petit', 'Tout cela reste dans cet appareil : rien n’est envoyé nulle part.'));
    zone.appendChild(memoire);

    const album = bloc('Votre album d’étiquettes');
    const bilan = album.appendChild(element('p', null, '…'));
    album.appendChild(element('p', 'discret petit', 'Les photos restent dans cet appareil, réduites pour prendre peu de place. « Tout oublier » ne touche pas à l’album ; désinstaller l’application l’efface.'));
    zone.appendChild(album);
    Album.bilan().then(({ nombre, octets }) => {
      bilan.textContent = nombre ? Outils.pluriel(nombre, 'étiquette', 'étiquettes') + ', ' + Outils.humain(octets) + '.' : 'Aucune étiquette pour l’instant.';
      if (!nombre) return;
      album.insertBefore(bouton('bouton-discret', 'Vider l’album', async () => {
        if (!racine.confirm('Supprimer toutes les étiquettes et tous les dossiers de l’album ? C’est définitif.')) return;
        await Album.vider();
        dessiner();
        Outils.annoncer('Album vidé.');
      }), bilan.nextSibling);
    }).catch(() => { bilan.textContent = 'L’album n’est pas disponible dans ce navigateur.'; });

    const guide = bloc('Ce que contient le guide');
    if (manifeste) {
      guide.appendChild(element('p', null, manifeste.appellations + ' appellations dans ' + manifeste.regions + ' régions, '
        + manifeste.cepages + ' cépages, ' + manifeste.plats + ' accords mets-vins, les millésimes de ' + manifeste.zones
        + ' vignobles depuis 1990 et ' + manifeste.guide + ' fiches pratiques et mots du lexique.'));
    }
    guide.appendChild(element('p', null, 'Les textes sont originaux. Les cépages, les couleurs et les règles de chaque appellation suivent les cahiers des charges publiés par l’INAO ; les surfaces sont des ordres de grandeur. Les règles changent : en cas de doute, le cahier des charges de l’appellation fait foi.'));
    guide.appendChild(element('p', null, 'Les notes de millésime et les accords sont des appréciations : ils résument l’avis général, pas une vérité. Le guide ne vend rien, ne cite aucun prix et n’est lié à aucun producteur.'));
    zone.appendChild(guide);

    const sources = bloc('La carte et ses sources');
    sources.appendChild(element('p', null, 'La carte est dessinée par l’application elle-même et ne charge aucune tuile. Les vignes viennent de la « Délimitation parcellaire des AOC viticoles » publiée par l’INAO sur data.gouv.fr (Licence Ouverte 2.0), simplifiée pour le téléphone : c’est l’aire où l’appellation peut être produite, pas le relevé des vignes plantées. Elle est indicative ; seuls les plans déposés en mairie font foi.'));
    sources.appendChild(element('p', null, 'Quelques appellations dont le parcellaire n’est pas encore publié (la Champagne, Cassis, Bellet…) sont dessinées d’après la liste de leurs communes (INAO, « Aires géographiques des AOC/AOP ») : elles sont marquées « communes ». Les contours des départements et des communes viennent d’Etalab (contours administratifs, Licence Ouverte) ; les fleuves et les pays voisins de Natural Earth (domaine public).'));
    zone.appendChild(sources);

    const sante = bloc('Avec modération');
    sante.appendChild(element('p', null, 'L’abus d’alcool est dangereux pour la santé. À consommer avec modération. Ce guide s’adresse aux adultes ; la vente d’alcool aux mineurs est interdite. Pendant la grossesse, zéro alcool.'));
    zone.appendChild(sante);

    const prive = bloc('Vie privée');
    prive.appendChild(element('p', null, 'Pas de compte, pas de publicité, pas de mesure d’audience. L’application fonctionne hors ligne et ne contacte aucun serveur ; elle ne demande ni votre position, ni aucune autorisation. Les photos de l’album sont prises par l’appareil photo du téléphone et ne quittent pas l’appareil.'));
    const lien = element('a', null, 'Lire la page de confidentialité');
    lien.href = 'confidentialite.html';
    prive.appendChild(element('p', null)).appendChild(lien);
    zone.appendChild(prive);

    const version = bloc('Version');
    version.appendChild(element('p', null, 'Terroirs ' + (manifeste ? manifeste.version + ' — guide du ' + Outils.dateLisible(manifeste.construit) : '') + '.'));
    zone.appendChild(version);
  }

  racine.Reglages = {
    dessiner,
    brancher(donnees) { manifeste = donnees.manifeste; },
  };

})(window);
