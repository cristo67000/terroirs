# -*- coding: utf-8 -*-
"""
Étape 2 de la carte : allège les tracés et écrit les fichiers que lit l'application.

    python build/carte/etape2_tracer.py

Entrées (build/.sources-carte/) : unions.pickle (étape 1), communes.geojson et
departements.geojson (Etalab, contours administratifs), communes-ao.csv (INAO,
communes des aires d'appellation), Natural Earth 10 m (pays voisins, fleuves, lacs).

Sorties (data/carte/) :
  fond.json        terres, départements, fleuves, villes, emprise de chaque région
  <région>.json    les appellations de la région et leurs dénominations

Les coordonnées sont des entiers (degrés × 100 000 pour les vignes, × 10 000
pour le fond), chaque anneau codé en écarts successifs : [x0, y0, dx, dy, …].
"""
import csv, glob, json, math, os, pickle, sys, unicodedata, re
import shapefile
from pyproj import Transformer
from shapely import wkb
from shapely.geometry import shape, box, Polygon, MultiPolygon, LineString, MultiLineString
from shapely.ops import unary_union, transform, polylabel
from shapely.validation import make_valid

ICI = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.dirname(ICI)
SOURCES = os.path.join(BUILD, '.sources-carte')
SORTIE = os.path.join(os.path.dirname(BUILD), 'data', 'carte')
sys.path.insert(0, ICI)
import plan as Plan  # noqa: E402

vers_l93 = Transformer.from_crs(4326, 2154, always_xy=True).transform
vers_wgs = Transformer.from_crs(2154, 4326, always_xy=True).transform

CADRE = (-6.2, 40.9, 10.6, 51.8)   # ce que montre le fond : la France et ses abords


def propre(g):
    if not g.is_valid:
        g = make_valid(g)
    if g.geom_type == 'GeometryCollection':
        g = unary_union([p for p in g.geoms if p.geom_type in ('Polygon', 'MultiPolygon')])
    return g


def polygones(g):
    if g.is_empty:
        return []
    if g.geom_type == 'Polygon':
        return [g]
    if g.geom_type == 'MultiPolygon':
        return list(g.geoms)
    return [p for p in getattr(g, 'geoms', []) if p.geom_type == 'Polygon']


def paliers(aire_ha):
    """(fermeture, simplification) en mètres, selon la taille de l'aire."""
    if aire_ha > 30000: return 120, 100
    if aire_ha > 3000: return 60, 50
    if aire_ha > 300: return 30, 20
    if aire_ha > 30: return 12, 8
    return 4, 3


def alleger(g, ferm=None, simp=None):
    """Soude les parcelles voisines, bouche les trous infimes, simplifie."""
    g = propre(g)
    aire_ha = g.area / 1e4
    f, s = paliers(aire_ha)
    f, s = ferm or f, simp or s
    g = propre(g.simplify(s / 3.0))
    g = propre(g.buffer(f, resolution=2, join_style=2).buffer(-f, resolution=2, join_style=2))
    morceaux = []
    plus_grand = max((p.area for p in polygones(g)), default=0)
    for p in polygones(g):
        if p.area < (1.5 * f) ** 2 and p.area < plus_grand:
            continue
        trous = [t for t in p.interiors if Polygon(t).area >= (3 * f) ** 2]
        morceaux.append(Polygon(p.exterior, trous))
    g = propre(MultiPolygon(morceaux)) if morceaux else g
    g = propre(g.simplify(s))
    return g, aire_ha


def point_etiquette(g):
    plus = max(polygones(g), key=lambda p: p.area)
    try:
        pt = polylabel(plus, tolerance=max(5.0, math.sqrt(plus.area) / 50))
    except Exception:
        pt = plus.representative_point()
    return pt


def coder_anneau(coords, echelle):
    sortie, px, py = [], 0, 0
    dernier = None
    for x, y in coords:
        ix, iy = int(round(x * echelle)), int(round(y * echelle))
        if dernier == (ix, iy):
            continue
        sortie += [ix - px, iy - py]
        px, py, dernier = ix, iy, (ix, iy)
    return sortie


def coder_polygones(g_l93, echelle=100000):
    g = transform(vers_wgs, g_l93)
    sortie = []
    for p in polygones(g):
        anneaux = [coder_anneau(p.exterior.coords, echelle)] + [coder_anneau(t.coords, echelle) for t in p.interiors]
        anneaux = [a for a in anneaux if len(a) >= 8]
        if anneaux:
            sortie.append(anneaux)
    return sortie


def coder_wgs(g, echelle=10000):
    sortie = []
    for p in polygones(g):
        anneaux = [coder_anneau(p.exterior.coords, echelle)] + [coder_anneau(t.coords, echelle) for t in p.interiors]
        anneaux = [a for a in anneaux if len(a) >= 8]
        if anneaux:
            sortie.append(anneaux)
    return sortie


def boite_wgs(g_l93):
    x0, y0, x1, y1 = transform(vers_wgs, g_l93).bounds
    return [round(x0, 4), round(y0, 4), round(x1, 4), round(y1, 4)]


def nu(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


# ————————————————————————————————————————————————— les appellations

def charger_communes():
    d = json.load(open(os.path.join(SOURCES, 'communes.geojson'), encoding='utf-8'))
    par_code, par_nom = {}, {}
    for f in d['features']:
        p = f['properties']
        par_code[p['code']] = f
        par_nom[(nu(p['nom']), p['departement'])] = f
    return par_code, par_nom


def aires_communales(par_code):
    """IDA du CSV INAO -> géométrie Lambert (réunion des communes)."""
    voulus = {int(l[4][1:]) for l in Plan.dresser() if l[4].startswith('c')}
    codes = {i: [] for i in voulus}
    with open(os.path.join(SOURCES, 'communes-ao.csv'), encoding='latin-1', newline='') as f:
        for ligne in csv.DictReader(f, delimiter=';'):
            ida = int(ligne['IDA'])
            if ida in codes:
                codes[ida].append(ligne['CI'])
    sortie = {}
    for ida, liste in codes.items():
        parts, manque = [], 0
        for c in liste:
            f = par_code.get(c)
            if f is None:
                manque += 1
                continue
            parts.append(propre(shape(f['geometry'])))
        if not parts:
            print('! aucune commune pour', ida)
            continue
        if manque:
            print('  ', ida, ':', manque, 'communes introuvables sur', len(liste))
        sortie[ida] = transform(vers_l93, propre(unary_union(parts)))
    return sortie


def tracer_appellations(par_code):
    unions = pickle.load(open(os.path.join(SOURCES, 'unions.pickle'), 'rb'))
    communales = aires_communales(par_code)
    regions = {}
    for reg, ident, nom, signe, trace, deps, officiel in Plan.dresser():
        if trace == '-':
            continue
        if trace.startswith('p'):
            brut = wkb.loads(unions['apps'][int(trace[1:])]['geom'])
            par_communes = False
        else:
            brut = communales.get(int(trace[1:]))
            par_communes = True
            if brut is None:
                continue
        if par_communes:
            g, aire = alleger(brut, ferm=50, simp=150)
        else:
            g, aire = alleger(brut)
        regions.setdefault(reg, []).append({
            'id': ident, 'nom': nom, 'geom': g, 'ha': aire, 'com': par_communes,
            'cle': int(trace[1:]) if not par_communes else None,
        })
        print(reg, ident, round(aire), 'ha', flush=True)
    # les dénominations
    denoms = {}
    for (cle, sorte), brut in unions['denoms'].items():
        denoms.setdefault(cle, {}).setdefault(sorte, []).append(wkb.loads(brut))
    return regions, denoms


def ecrire_regions(regions, denoms):
    emprises = {}
    resume = {}
    for reg, liste in regions.items():
        liste.sort(key=lambda a: -a['ha'])
        # aires identiques : la plus petite fiche renvoie au tracé de la première
        for i, a in enumerate(liste):
            a['meme'] = None
            for b in liste[:i]:
                if b['meme'] or abs(a['ha'] - b['ha']) > 0.04 * b['ha']:
                    continue
                if a['geom'].symmetric_difference(b['geom']).area < 0.05 * b['geom'].area:
                    a['meme'] = b['id']
                    break
        vraies = [a['geom'] for a in liste if not a['com'] or reg == 'champagne' or a['id'] in ('cassis', 'bellet', 'blaye', 'duche-d-uzes', 'saint-sardos')]
        tout = propre(unary_union(vraies))
        emprise, _ = alleger(tout, ferm=700, simp=350)
        emprise = propre(MultiPolygon([p for p in polygones(emprise) if p.area > 150e4]) if polygones(emprise) else emprise)
        emprises[reg] = emprise
        aire_region = tout.area / 1e4
        sortie = {'region': reg, 'appellations': [], 'denominations': []}
        for a in liste:
            pt = transform(vers_wgs, point_etiquette(a['geom']))
            fiche = {
                'id': a['id'], 'ha': round(a['ha']), 'b': boite_wgs(a['geom']),
                'c': [round(pt.x, 5), round(pt.y, 5)],
            }
            if a['com']:
                fiche['com'] = 1
            if a['ha'] > 0.3 * aire_region and len(liste) > 3 or a['id'] in ('pineau-des-charentes', 'floc-de-gascogne'):
                fiche['nappe'] = 1
            if a['meme']:
                fiche['meme'] = a['meme']
            else:
                fiche['g'] = coder_polygones(a['geom'])
            sortie['appellations'].append(fiche)
            resume[a['id']] = {'r': reg, 'ha': fiche['ha'], 'b': fiche['b'], 'c': fiche['c']}
            for sorte, geoms in (denoms.get(a['cle'], {}) if a['cle'] else {}).items():
                g, aire = alleger(propre(unary_union(geoms)))
                if g.is_empty:
                    continue
                pt = transform(vers_wgs, point_etiquette(g))
                sortie['denominations'].append({
                    'de': a['id'], 'pc': 1 if sorte == 'pc' else 0,
                    'nom': 'Premiers crus' if sorte == 'pc' else sorte,
                    'ha': round(aire), 'b': boite_wgs(g), 'c': [round(pt.x, 5), round(pt.y, 5)],
                    'g': coder_polygones(g),
                })
        chemin = os.path.join(SORTIE, reg + '.json')
        json.dump(sortie, open(chemin, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        print('→', reg, len(sortie['appellations']), 'appellations,', len(sortie['denominations']), 'dénominations,',
              round(os.path.getsize(chemin) / 1024), 'Ko')
    return emprises, resume


# ————————————————————————————————————————————————— le fond

VILLES = {
    1: ['Paris/75', 'Lyon/69', 'Marseille/13', 'Bordeaux/33', 'Toulouse/31', 'Nantes/44', 'Strasbourg/67',
        'Montpellier/34', 'Dijon/21', 'Reims/51', 'Nice/06', 'Lille/59', 'Rennes/35'],
    2: ['Clermont-Ferrand/63', 'Tours/37', 'Angers/49', 'Orléans/45', 'Avignon/84', 'Perpignan/66', 'Ajaccio/2A',
        'Bastia/2B', 'Pau/64', 'Limoges/87', 'Grenoble/38', 'Chambéry/73', 'Besançon/25', 'Metz/57', 'Nancy/54',
        'Toulon/83', 'Nîmes/30', 'Brest/29', 'Rouen/76', 'Caen/14', 'Poitiers/86', 'La Rochelle/17', 'Bayonne/64',
        'Troyes/10', 'Valence/26', 'Colmar/68', 'Mulhouse/68', 'Mâcon/71', 'Auxerre/89', 'Bourges/18', 'Cognac/16',
        'Angoulême/16', 'Beaune/21', 'Épernay/51', 'Libourne/33', 'Bergerac/24', 'Cahors/46', 'Saumur/49',
        'Narbonne/11', 'Béziers/34', 'Carcassonne/11', 'Aix-en-Provence/13', 'Annecy/74', 'Saint-Étienne/42',
        'Amiens/80', 'Le Mans/72', 'Agen/47', 'Albi/81', 'Auch/32', 'Périgueux/24', 'Blois/41', 'Nevers/58',
        'Chalon-sur-Saône/71', 'Lons-le-Saunier/39', 'Orange/84', 'Montauban/82', 'Mont-de-Marsan/40', 'Tarbes/65',
        'Rodez/12', 'Châlons-en-Champagne/51', 'Vienne/38', 'Montélimar/26', 'Arles/13', 'Fréjus/83', 'Calvi/2B',
        'Porto-Vecchio/2A', 'Corte/2B'],
    3: ['Nuits-Saint-Georges/21', 'Chablis/89', 'Saint-Émilion/33', 'Pauillac/33', 'Langon/33', 'Sauternes/33',
        'Blaye/33', 'Gaillac/81', 'Madiran/65', 'Jurançon/64', 'Chinon/37', 'Vouvray/37', 'Sancerre/18',
        'Pouilly-sur-Loire/58', 'Vallet/44', 'Clisson/44', "Tain-l'Hermitage/26", 'Ampuis/69', 'Condrieu/69',
        'Châteauneuf-du-Pape/84', 'Gigondas/84', 'Tavel/30', 'Die/26', 'Bandol/83', 'Cassis/13', 'Saint-Tropez/83',
        'Limoux/11', 'Banyuls-sur-Mer/66', 'Collioure/66', 'Maury/66', 'Rivesaltes/66', 'Riquewihr/68',
        'Ribeauvillé/68', 'Obernai/67', 'Guebwiller/68', 'Thann/68', 'Arbois/39', 'Château-Chalon/39',
        'Villefranche-sur-Saône/69', 'Fleurie/69', 'Villié-Morgon/69', 'Mercurey/71', 'Meursault/21',
        'Gevrey-Chambertin/21', 'Vosne-Romanée/21', 'Puligny-Montrachet/21', 'Pommard/21', 'Chagny/71', 'Tournus/71',
        'Fuissé/71', 'Patrimonio/2B', 'Sartène/2A', 'Bar-sur-Aube/10', 'Bar-sur-Seine/10', 'Aÿ-Champagne/51',
        'Château-Thierry/02', 'Toul/54', 'Saint-Pourçain-sur-Sioule/03', 'Roanne/42', 'Marmande/47', 'Fronton/31',
        'Irouléguy/64', 'Saint-Mont/32', 'Marcillac-Vallon/12', 'Montlouis-sur-Loire/37', 'Bourgueil/37', 'Amboise/37',
        'Vendôme/41', 'Cheverny/41', 'Menetou-Salon/18', 'Quincy/18', 'Reuilly/36', 'Savennières/49',
        'Ancenis-Saint-Géréon/44', 'Margaux-Cantenac/33', 'Saint-Estèphe/33', 'Saint-Julien-Beychevelle/33',
        'Pomerol/33', 'Pessac/33', 'Léognan/33', 'Cadillac-sur-Garonne/33', 'Monbazillac/24', 'Duras/47',
        'Buzet-sur-Baïse/47', 'Cornas/07', 'Saint-Péray/07', 'Vacqueyras/84', 'Beaumes-de-Venise/84', 'Rasteau/84',
        'Cairanne/84', 'Vinsobres/26', 'Nyons/26', 'Uzès/30', 'Lirac/30', 'Apt/84', 'Carpentras/84', 'Pézenas/34',
        'Faugères/34', 'Saint-Chinian/34', 'Frontignan/34', 'Pinet/34', 'Lunel/34', 'Fitou/11',
        'Lézignan-Corbières/11', 'Minerve/34', 'Montpeyroux/34', 'Saint-Jean-de-Minervois/34', 'Brignoles/83',
        'Les Baux-de-Provence/13', 'Vidauban/83', 'Apremont/73', 'Chignin/73', 'Seyssel/74', 'Belley/01',
        'Molsheim/67', 'Barr/67', 'Sélestat/67', 'Turckheim/68', 'Kaysersberg Vignoble/68', 'Eguisheim/68',
        'Rouffach/68', 'Wissembourg/67', 'Marlenheim/67', 'Pupillin/39', "L'Étoile/39", 'Irancy/89', 'Tonnerre/89',
        'Vézelay/89', 'Givry/71', 'Rully/71', 'Santenay/21', 'Aloxe-Corton/21', 'Juliénas/69', 'Listrac-Médoc/33',
        'Fronsac/33', 'Bourg/33', 'Lesparre-Médoc/33', 'Saint-Macaire/33', 'Barsac/33', 'Créon/33',
        'Sainte-Foy-la-Grande/33', 'Castillon-la-Bataille/33', 'Nérac/47', 'Condom/32', 'Eauze/32', 'Aire-sur-l\'Adour/40',
        'Saint-Jean-Pied-de-Port/64', 'Millau/12', 'Vertus/51', 'Sézanne/51', 'Les Riceys/10', 'Verzenay/51',
        'Bouzy/51', 'Avize/51', 'Le Mesnil-sur-Oger/51', 'Hautvillers/51', 'Mareuil-sur-Lay-Dissais/85', 'Thouars/79',
        'Doué-en-Anjou/49', 'Rochefort-sur-Loire/49', 'Azay-le-Rideau/37', 'Saint-Nicolas-de-Bourgueil/37',
        'Gien/45', 'Cosne-Cours-sur-Loire/58', 'Sainte-Cécile-les-Vignes/84', 'Vaison-la-Romaine/84', 'Bollène/84',
        'Pont-Saint-Esprit/30', 'Bagnols-sur-Cèze/30', 'Tournon-sur-Rhône/07', 'Saint-Joseph/42', 'Grignan/26',
        'Vallon-Pont-d\'Arc/07', 'Manosque/04', 'Pertuis/84', 'Aigues-Mortes/30', 'Sète/34', 'Clermont-l\'Hérault/34',
        'Lodève/34', 'Saint-Mathieu-de-Tréviers/34', 'Tautavel/66', 'Estagel/66', 'Thuir/66', 'Céret/66',
        'Hyères/83', 'La Londe-les-Maures/83', 'Le Luc/83', 'Draguignan/83', 'Trets/13', 'Salon-de-Provence/13',
        'Figari/2A', 'Bonifacio/2A', 'Aléria/2B', 'Saint-Florent/2B', 'Montmélian/73', 'Aix-les-Bains/73',
        'Thonon-les-Bains/74', 'Cerdon/01', 'Poligny/39', 'Dambach-la-Ville/67', 'Bergheim/68', 'Kientzheim/68',
        'Ammerschwihr/68', 'Bergbieten/67', 'Andlau/67', 'Mittelbergheim/67', 'Hunawihr/68', 'Wintzenheim/68',
        'Soultzmatt/68', 'Cleebourg/67', 'Morey-Saint-Denis/21', 'Chambolle-Musigny/21', 'Vougeot/21',
        'Marsannay-la-Côte/21', 'Fixin/21', 'Volnay/21', 'Chassagne-Montrachet/21', 'Savigny-lès-Beaune/21',
        'Saint-Aubin/21', 'Montagny-lès-Buxy/71', 'Bouzeron/71', 'Viré/71', 'Lugny/71', 'Cluny/71',
        'Solutré-Pouilly/71', 'Saint-Bris-le-Vineux/89', 'Joigny/89', 'Beaujeu/69', 'Chiroubles/69', 'Chénas/69',
        'Saint-Amour-Bellevue/71', 'Régnié-Durette/69', 'Odenas/69', 'Belleville-en-Beaujolais/69', 'L\'Arbresle/69',
        'Saint-Emilion/33'],
}


def villes(par_nom):
    sortie, manques = [], []
    for rang, liste in VILLES.items():
        for v in liste:
            nom, dep = v.rsplit('/', 1)
            f = par_nom.get((nu(nom), dep))
            if f is None:
                manques.append(v)
                continue
            g = propre(shape(f['geometry']))
            pt = max(polygones(g), key=lambda p: p.area).representative_point() if g.geom_type != 'Polygon' else g.representative_point()
            c = g.centroid if g.contains(g.centroid) else pt
            nom_affiche = f['properties']['nom']
            nom_affiche = {'Margaux-Cantenac': 'Margaux', 'Kaysersberg Vignoble': 'Kaysersberg', 'Cadillac-sur-Garonne': 'Cadillac',
                           'Ancenis-Saint-Géréon': 'Ancenis', 'Aÿ-Champagne': 'Aÿ', 'Mareuil-sur-Lay-Dissais': 'Mareuil-sur-Lay',
                           'Belleville-en-Beaujolais': 'Belleville', 'Saint-Amour-Bellevue': 'Saint-Amour',
                           'Saint-Julien-Beychevelle': 'Saint-Julien', 'Cosne-Cours-sur-Loire': 'Cosne-sur-Loire'}.get(nom_affiche, nom_affiche)
            sortie.append([nom_affiche, round(c.x, 4), round(c.y, 4), rang])
    if manques:
        print('villes introuvables :', ', '.join(manques))
    return sortie


def lignes_codees(g, echelle=10000):
    if g.is_empty:
        return []
    geoms = [g] if g.geom_type == 'LineString' else [l for l in getattr(g, 'geoms', []) if l.geom_type == 'LineString']
    return [coder_anneau(l.coords, echelle) for l in geoms if len(l.coords) >= 2]


def fond(par_nom, emprises, resume):
    cadre = box(*CADRE)
    deps = json.load(open(os.path.join(SOURCES, 'departements.geojson'), encoding='utf-8'))
    departements, formes = [], []
    for f in deps['features']:
        code = f['properties']['code']
        if len(code) > 2 and not code.startswith('2'):
            continue  # outre-mer
        if code in ('971', '972', '973', '974', '976'):
            continue
        g = propre(shape(f['geometry']))
        formes.append(g)
        g = propre(g.simplify(0.0025))
        departements.append({'code': code, 'nom': f['properties']['nom'], 'g': coder_wgs(g)})
    france = propre(unary_union(formes))

    r = shapefile.Reader(os.path.join(SOURCES, 'ne', 'ne_10m_admin_0_countries'), encoding='utf-8')
    voisins = []
    for sr in r.iterShapeRecords():
        d = sr.record.as_dict()
        if d.get('ADM0_A3') == 'FRA' or d.get('ADMIN') == 'France':
            continue
        b = sr.shape.bbox
        if b[2] < CADRE[0] or b[0] > CADRE[2] or b[3] < CADRE[1] or b[1] > CADRE[3]:
            continue
        g = propre(shape(sr.shape.__geo_interface__)).intersection(cadre)
        g = propre(g.difference(france.buffer(0.004))) if not g.is_empty else g
        g = propre(g.simplify(0.006))
        if not g.is_empty:
            voisins.append({'nom': d.get('NAME_FR') or d.get('NAME'), 'g': coder_wgs(g)})

    fleuves = {}
    for nom_fichier in ('ne_10m_rivers_lake_centerlines', 'ne_10m_rivers_europe'):
        r = shapefile.Reader(os.path.join(SOURCES, 'ne', nom_fichier), encoding='utf-8')
        for sr in r.iterShapeRecords():
            b = sr.shape.bbox
            if b[2] < CADRE[0] or b[0] > CADRE[2] or b[3] < CADRE[1] or b[1] > CADRE[3]:
                continue
            d = sr.record.as_dict()
            g = shape(sr.shape.__geo_interface__).intersection(cadre)
            if g.is_empty:
                continue
            nom = (d.get('name_fr') or d.get('name') or '').strip()
            rang = int(d.get('scalerank') or 12)
            cle = (nom, rang <= 9)
            fleuves.setdefault(cle, {'nom': nom, 'rang': rang, 'l': []})
            fleuves[cle]['rang'] = min(fleuves[cle]['rang'], rang)
            fleuves[cle]['l'] += lignes_codees(g.simplify(0.002))
    lacs = []
    r = shapefile.Reader(os.path.join(SOURCES, 'ne', 'ne_10m_lakes'), encoding='utf-8')
    for sr in r.iterShapeRecords():
        b = sr.shape.bbox
        if b[2] < CADRE[0] or b[0] > CADRE[2] or b[3] < CADRE[1] or b[1] > CADRE[3]:
            continue
        g = propre(shape(sr.shape.__geo_interface__)).intersection(cadre).simplify(0.003)
        lacs += coder_wgs(propre(g))

    regions = {}
    for reg, g in emprises.items():
        x0, y0, x1, y1 = transform(vers_wgs, g).bounds
        pt = transform(vers_wgs, point_etiquette(g))
        regions[reg] = {'b': [round(x0, 3), round(y0, 3), round(x1, 3), round(y1, 3)],
                        'c': [round(pt.x, 4), round(pt.y, 4)], 'g': coder_polygones(g, 10000)}

    sortie = {'cadre': list(CADRE), 'departements': departements, 'voisins': voisins,
              'fleuves': sorted(fleuves.values(), key=lambda f: f['rang']), 'lacs': lacs,
              'villes': villes(par_nom), 'regions': regions, 'appellations': resume}
    chemin = os.path.join(SORTIE, 'fond.json')
    json.dump(sortie, open(chemin, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('→ fond', round(os.path.getsize(chemin) / 1024), 'Ko ;', len(sortie['villes']), 'villes,', len(fleuves), 'cours d\'eau')


def main():
    os.makedirs(SORTIE, exist_ok=True)
    par_code, par_nom = charger_communes()
    regions, denoms = tracer_appellations(par_code)
    emprises, resume = ecrire_regions(regions, denoms)
    fond(par_nom, emprises, resume)


if __name__ == '__main__':
    main()
