# -*- coding: utf-8 -*-
"""
Dresse la liste canonique des appellations : build/plan-appellations.txt.

Source : l'inventaire du parcellaire INAO (inventaire.json, tiré du shapefile),
complété des AOC que le parcellaire ne contient pas encore (Champagne, Cassis…)
— celles-là seront dessinées à la commune — et de quelques IGP sans tracé.

    python build/carte/plan.py
"""
import json, os, re, unicodedata

ICI = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.dirname(ICI)
SOURCES = os.path.join(BUILD, '.sources-carte')


def slug(nom):
    s = unicodedata.normalize('NFKD', nom).encode('ascii', 'ignore').decode()
    s = re.sub(r"[^a-zA-Z0-9]+", '-', s).strip('-').lower()
    return s


def nom_court(app):
    n = re.split(r' ou |, ', app)[0].strip()
    return n


def region(o):
    dt, deps, app = o['dt'], set(d for d in o['deps'] if d), o['app']
    if dt in ('Angers', 'Tours'):
        return 'loire'
    if dt in ('Avignon', 'Valence'):
        return 'provence' if app == 'Pierrevert' else 'rhone'
    if dt == 'Bordeaux':
        return 'bordeaux' if deps == {'33'} else 'sud-ouest'
    if dt == 'Colmar':
        return 'alsace'  # la Lorraine (Toul, Moselle) est rangée avec l'Alsace
    if dt == 'Corse':
        return 'corse'
    if dt == 'Dijon':
        return 'jura' if deps == {'39'} else 'bourgogne'
    if dt in ('Gaillac', 'Pau'):
        return 'sud-ouest'
    if dt == 'La Valette du Var':
        return 'provence'
    if dt == 'Montpellier':
        return 'languedoc'
    if dt == 'Narbonne':
        return 'roussillon' if '66' in deps else 'languedoc'
    if dt == 'Mâcon':
        if deps & {'01', '73', '74', '38'}:
            return 'savoie-bugey'
        if '69' in deps or app in ('Saint-Amour',):
            return 'beaujolais'
        return 'bourgogne'
    raise SystemExit('région inconnue : ' + app)


# AOC sans parcellaire numérisé : dessinées d'après la liste des communes (IDA du CSV INAO)
HORS_PARCELLAIRE = [
    ('champagne', 'Champagne', 54, 'champagne'),
    ('coteaux-champenois', 'Coteaux champenois', 1963, 'champagne'),
    ('rose-des-riceys', 'Rosé des Riceys', 1961, 'champagne'),
    ('bellet', 'Bellet', 1318, 'provence'),
    ('cassis', 'Cassis', 1319, 'provence'),
    ('blaye', 'Blaye', 62, 'bordeaux'),
    ('duche-d-uzes', "Duché d'Uzès", 1836, 'rhone'),
    ('saint-sardos', 'Saint-Sardos', 2337, 'sud-ouest'),
    ('correze', 'Corrèze', 2419, 'sud-ouest'),
    ('floc-de-gascogne', 'Floc de Gascogne', 1347, 'sud-ouest'),
    ('pineau-des-charentes', 'Pineau des Charentes', 2137, 'sud-ouest'),
]

IGP = [
    ('igp-pays-d-oc', "Pays d'Oc", 'languedoc'),
    ('igp-cotes-de-gascogne', 'Côtes de Gascogne', 'sud-ouest'),
    ('igp-val-de-loire', 'Val de Loire', 'loire'),
    ('igp-mediterranee', 'Méditerranée', 'provence'),
    ('igp-collines-rhodaniennes', 'Collines Rhodaniennes', 'rhone'),
    ('igp-cotes-catalanes', 'Côtes Catalanes', 'roussillon'),
    ('igp-ile-de-beaute', 'Île de Beauté', 'corse'),
    ('igp-comte-tolosan', 'Comté Tolosan', 'sud-ouest'),
    ('igp-saint-guilhem-le-desert', 'Saint-Guilhem-le-Désert', 'languedoc'),
    ('igp-ardeche', 'Ardèche', 'rhone'),
    ('igp-atlantique', 'Atlantique', 'bordeaux'),
    ('igp-cotes-de-thongue', 'Côtes de Thongue', 'languedoc'),
    ('igp-vin-des-allobroges', 'Vin des Allobroges', 'savoie-bugey'),
    ('igp-franche-comte', 'Franche-Comté', 'jura'),
    ('igp-coteaux-de-l-auxois', "Coteaux de l'Auxois", 'bourgogne'),
    ('igp-alpilles', 'Alpilles', 'provence'),
    ('igp-vaucluse', 'Vaucluse', 'rhone'),
    ('igp-perigord', 'Périgord', 'sud-ouest'),
    ('igp-cotes-du-lot', 'Côtes du Lot', 'sud-ouest'),
    ('igp-charentais', 'Charentais', 'sud-ouest'),
]


def dresser():
    inv = json.load(open(os.path.join(SOURCES, 'inventaire.json'), encoding='utf-8'))
    lignes, vus = [], set()
    for o in inv:
        if o['app'] in ('Béa du Roussillon', 'Taureau de Camargue'):
            continue  # une pomme de terre et un bœuf
        nom = nom_court(o['app'])
        i = slug(nom)
        assert i not in vus, i
        vus.add(i)
        deps = ','.join(d for d in o['deps'] if d)
        lignes.append((region(o), i, nom, 'AOC', 'p%d' % o['id'], deps, o['app']))
    for i, nom, ida, reg in HORS_PARCELLAIRE:
        assert i not in vus, i
        vus.add(i)
        lignes.append((reg, i, nom, 'AOC', 'c%d' % ida, '', nom))
    for i, nom, reg in IGP:
        lignes.append((reg, i, nom, 'IGP', '-', '', nom))
    lignes.sort()
    return lignes


if __name__ == '__main__':
    lignes = dresser()
    with open(os.path.join(BUILD, 'plan-appellations.txt'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('# région | id | nom | signe | tracé (pN = parcellaire INAO, cN = communes, - = aucun) | départements | nom officiel complet\n')
        for l in lignes:
            f.write(' | '.join(l) + '\n')
    import collections
    print(len(lignes), collections.Counter(l[0] for l in lignes))
