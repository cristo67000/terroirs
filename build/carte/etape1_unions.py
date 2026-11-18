# -*- coding: utf-8 -*-
"""
Étape 1 de la carte : lit le parcellaire INAO (Lambert-93) et réunit les
parcelles par appellation et par dénomination géographique complémentaire.

Le résultat (géométries brutes, à peine allégées) est rangé dans
build/.sources-carte/unions.pickle : les étapes suivantes n'ont plus à relire
les 600 Mo du shapefile.

    python build/carte/etape1_unions.py
"""
import glob, os, pickle, re, sys, time
import shapefile
from shapely.geometry import shape
from shapely.ops import unary_union
from shapely.validation import make_valid

ICI = os.path.dirname(os.path.abspath(__file__))
SOURCES = os.path.join(os.path.dirname(ICI), '.sources-carte')


def propre(g):
    if not g.is_valid:
        g = make_valid(g)
    if g.geom_type == 'GeometryCollection':
        g = unary_union([p for p in g.geoms if p.geom_type in ('Polygon', 'MultiPolygon')])
    return g


def a_la_main(forme):
    """Reconstruit un polygone anneau par anneau (convention shapefile : les
    contours tournent dans le sens des aiguilles, les trous à l'inverse), en
    laissant tomber les anneaux sans surface."""
    from shapely.geometry import Polygon
    bornes = list(forme.parts) + [len(forme.points)]
    pleins, trous = [], []
    for i in range(len(bornes) - 1):
        pts = forme.points[bornes[i]:bornes[i + 1]]
        if len(pts) < 4:
            continue
        p = Polygon(pts)
        if p.area < 0.5:
            continue
        (trous if p.exterior.is_ccw else pleins).append(propre(p))
    g = unary_union(pleins)
    if trous:
        g = g.difference(unary_union(trous))
    return g


def sorte_de_denomination(app, denom):
    """None : à ignorer ; 'pc' : premier cru (agrégé par appellation) ; sinon le libellé."""
    if denom == app:
        return None
    if 'premier cru' in denom:
        return 'pc'
    if app == 'Corton' or '(' in denom or ' - ' in denom or 'complété' in denom:
        return None
    if denom in ('Alsace', 'Ladoix ou Ladoix Côte de Beaune', 'Rasteau Vin Doux Naturel', 'Rasteau Vin Tranquille'):
        return None
    if app == 'Beaujolais' and denom != 'Beaujolais Villages':
        return None
    libelle = re.split(r' ou ', denom)[0].strip()
    if denom.startswith('Vin de Corse ou Corse '):
        libelle = 'Vin de Corse ' + denom[len('Vin de Corse ou Corse '):]
    return libelle


def main():
    t0 = time.time()
    r = shapefile.Reader(glob.glob(os.path.join(SOURCES, 'parcellaire', '*.shp'))[0], encoding='utf-8')
    apps, denoms = {}, {}
    for n, sr in enumerate(r.iterShapeRecords()):
        d = sr.record.as_dict()
        if d['type_prod'] != 'Vins':
            continue
        try:
            try:
                g = shape(sr.shape.__geo_interface__)
            except Exception:
                g = a_la_main(sr.shape)   # un anneau dégénéré : pyshp renonce, pas nous
            g = propre(propre(g).simplify(2.0))
        except Exception as e:  # une géométrie illisible ne doit pas arrêter le tout
            print('!', d['app'], d['nomcom'], e, file=sys.stderr)
            continue
        if g.is_empty:
            continue
        cle = d['id_app']
        apps.setdefault(cle, {'app': d['app'], 'parts': []})['parts'].append(g)
        s = sorte_de_denomination(d['app'], d['denom'])
        if s:
            denoms.setdefault((cle, s), []).append(g)
        if n % 500 == 0:
            print(n, d['app'], round(time.time() - t0), 's', flush=True)
    sortie = {'apps': {}, 'denoms': {}}
    for cle, v in apps.items():
        sortie['apps'][cle] = {'app': v['app'], 'geom': propre(unary_union(v['parts'])).wkb}
    for (cle, s), parts in denoms.items():
        sortie['denoms'][(cle, s)] = propre(unary_union(parts)).wkb
    with open(os.path.join(SOURCES, 'unions.pickle'), 'wb') as f:
        pickle.dump(sortie, f)
    print('fini', len(sortie['apps']), 'appellations,', len(sortie['denoms']), 'dénominations,', round(time.time() - t0), 's')


if __name__ == '__main__':
    main()
