# Terroirs — dossier Google Play

Ce qui est prêt dans l'application, et ce qu'il reste à faire pour la déposer sur le Play Store.
Même chemin que pour « Le Mot juste » et « Code en clair » : publier la PWA, puis l'emballer en
TWA (Trusted Web Activity) avec Bubblewrap.

## 1. Ce que l'application respecte déjà

| Exigence Google Play | Dans Terroirs |
|---|---|
| PWA installable (manifeste, icônes 192/512, icône masquable, `display: standalone`) | `manifest.webmanifest`, `icons/` |
| Fonctionne hors ligne | `sw.js` range toute l'application (guide + carte) au premier lancement |
| HTTPS | GitHub Pages |
| Politique de confidentialité à une adresse publique | `confidentialite.html` |
| Sécurité des données | aucune donnée collectée ni partagée ; aucune autorisation Android |
| Pas de publicité, pas d'achats | rien de tel |
| Contenu lié à l'alcool | guide d'information, sans vente ni lien marchand ; mention « L'abus d'alcool est dangereux pour la santé » à l'accueil, sur les fiches, dans les Réglages et la page de confidentialité |
| Propriété intellectuelle | textes originaux ; données INAO et Etalab sous Licence Ouverte, Natural Earth domaine public, crédits dans l'application |
| API cible récente | fixée par Bubblewrap au moment de la compilation |

## 2. Déclarations à faire dans la Play Console

- **Catégorie** : Cuisine et boissons (ou Livres et références).
- **Public cible** : 18 ans et plus uniquement. Ne pas cocher de tranche d'âge inférieure : une
  appli sur le vin ne doit pas viser les mineurs.
- **Classification du contenu (questionnaire IARC)** : répondre « oui » à la question sur les
  références à l'alcool ; « non » à tout le reste (violence, jeux d'argent, contenu généré par
  les utilisateurs, partage de position…).
- **Sécurité des données** : « Aucune donnée collectée », « Aucune donnée partagée ».
- **Annonces** : l'application ne contient pas d'annonces.
- **Politique de confidentialité** : `https://cristo67000.github.io/terroirs/confidentialite.html`
  (une fois le site publié).
- **Compte personnel récent** : test fermé de 12 testeurs pendant 14 jours avant la production.

## 3. Fiche du Store (proposition)

**Nom** (30 signes max) : `Terroirs : vins de France`

**Description courte** (80 signes max) :
`Appellations, cépages, carte des vignobles, accords et millésimes. Hors ligne.`

**Description complète** :

> Terroirs est un guide des vins de France qui tient dans la poche et fonctionne sans connexion —
> à la cave, au restaurant, chez le caviste.
>
> • Toutes les appellations, région par région : situation, cépages, style des vins, garde,
>   service, crus à connaître.
> • Une centaine de cépages : leur caractère, leurs arômes, les appellations où ils s'expriment.
> • Une carte détaillée des vignobles, dessinée d'après les délimitations officielles de l'INAO :
>   on zoome d'une région à un grand cru, on touche la carte pour savoir quelles appellations se
>   trouvent à cet endroit.
> • Les accords mets-vins dans les deux sens : « j'ai un plat », « j'ai un vin ». Plus de 250
>   plats et fromages.
> • Les millésimes de 18 vignobles depuis 1990 : la note de l'année, son style, et s'il faut
>   boire ou attendre.
> • Un guide pratique : lire une étiquette, les classements (1855, Saint-Émilion, grands crus de
>   Bourgogne et d'Alsace…), servir, conserver, déguster, et un lexique.
>
> Sans compte, sans publicité, sans collecte de données. Aucune autorisation demandée.
>
> L'abus d'alcool est dangereux pour la santé. À consommer avec modération.

**Visuels à fournir** : icône 512 × 512 (`icons/icon-512.png`), bannière 1024 × 500, au moins
quatre captures de téléphone (accueil, fiche d'appellation, carte, accords, millésimes).

## 4. Étapes restantes

1. Publier la PWA sur GitHub Pages (`cristo67000/terroirs`).
2. Générer le projet Android avec Bubblewrap depuis le manifeste publié (commande interactive, à
   lancer dans un vrai terminal) :
   `npx @bubblewrap/cli init --manifest https://cristo67000.github.io/terroirs/manifest.webmanifest`
   — identifiant proposé : `io.github.cristo67000.terroirs`.
3. Créer la clé de signature (elle reste chez vous), compiler l'AAB.
4. Déclarer l'empreinte SHA-256 dans `cristo67000.github.io/.well-known/assetlinks.json`
   (déclaration directe), puis celle de Play App Signing après le premier dépôt.
5. Play Console : fiche, déclarations ci-dessus, test fermé, puis production.
