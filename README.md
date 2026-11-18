# Terroirs — vins et cépages de France

Application web installable (PWA), hors ligne, sans compte ni publicité : les appellations de
France région par région, une centaine de cépages, une carte détaillée des vignobles, les accords
mets-vins dans les deux sens, les millésimes depuis 1990 et un guide pratique avec lexique.

## Construire

    python build/generer-icones.py        # icônes
    node build/construire.mjs             # build/*.txt -> data/guide.json (format : build/format.txt)
    node build/essais_statiques.mjs       # épreuves sans navigateur

La carte se recalcule seulement si les sources changent (dossier `build/.sources-carte/`, hors
dépôt : parcellaire INAO, communes Etalab, Natural Earth) :

    python build/carte/plan.py            # liste canonique des appellations
    python build/carte/etape1_unions.py   # réunion des parcelles par appellation (≈ 5 min)
    python build/carte/etape2_tracer.py   # simplification -> data/carte/*.json (≈ 10 min)

Toute retouche publiée : changer `VERSION` dans `sw.js` et `application-version` dans `index.html`.

## Sources et licences

- Vignes : « Délimitation parcellaire des AOC viticoles », INAO, Licence Ouverte 2.0 (data.gouv.fr) ;
  « Aires géographiques des AOC/AOP » pour les appellations sans parcellaire publié.
- Contours administratifs : Etalab, Licence Ouverte. Fleuves, lacs, pays voisins : Natural Earth.
- Textes : originaux.

L'abus d'alcool est dangereux pour la santé. À consommer avec modération.
