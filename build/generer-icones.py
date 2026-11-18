"""
Dessine les icônes de l'application : une grappe claire sur fond lie-de-vin.

    python build/generer-icones.py

Écrit icons/icon-192.png, icon-512.png, icon-maskable-512.png (le motif plus
petit, pour le masque des téléphones) et apercu-1200x630.png (le lien partagé).
"""
import os
from PIL import Image, ImageDraw, ImageFont

ICI = os.path.dirname(os.path.abspath(__file__))
SORTIE = os.path.join(os.path.dirname(ICI), 'icons')
LIE, CRAIE, OR, ROSE = (92, 20, 42), (247, 242, 234), (225, 189, 98), (240, 138, 163)

# la grappe, dans un carré de 48 : les mêmes grains que la marque de index.html
GRAINS = [(17, 19), (31, 19), (24, 19), (20.5, 27.5), (27.5, 27.5), (24, 36)]


def motif(dessin, x0, y0, cote):
    e = cote / 48.0
    # la queue
    pts = [(24, 6), (23.6, 9), (25, 12), (29, 14)]
    dessin.line([(x0 + x * e, y0 + y * e) for x, y in pts], fill=OR, width=max(2, int(round(2.6 * e))), joint='curve')
    for (cx, cy) in GRAINS:
        r = 5.6 * e
        dessin.ellipse([x0 + cx * e - r, y0 + cy * e - r, x0 + cx * e + r, y0 + cy * e + r], fill=LIE)
        r = 4.7 * e
        dessin.ellipse([x0 + cx * e - r, y0 + cy * e - r, x0 + cx * e + r, y0 + cy * e + r], fill=CRAIE)
        r2 = 1.2 * e
        dessin.ellipse([x0 + (cx - 1.6) * e - r2, y0 + (cy - 1.8) * e - r2, x0 + (cx - 1.6) * e + r2, y0 + (cy - 1.8) * e + r2], fill=ROSE)


def icone(taille, part, nom, arrondi=True):
    sur = 4
    im = Image.new('RGBA', (taille * sur, taille * sur), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if arrondi:
        d.rounded_rectangle([0, 0, taille * sur - 1, taille * sur - 1], radius=int(taille * sur * 0.2), fill=LIE)
    else:
        d.rectangle([0, 0, taille * sur, taille * sur], fill=LIE)
    cote = taille * sur * part
    motif(d, (taille * sur - cote) / 2, (taille * sur - cote) / 2 + cote * 0.03, cote)
    im.resize((taille, taille), Image.LANCZOS).save(os.path.join(SORTIE, nom))


def apercu():
    sur = 2
    l, h = 1200 * sur, 630 * sur
    im = Image.new('RGB', (l, h), LIE)
    d = ImageDraw.Draw(im)
    motif(d, 90 * sur, 130 * sur, 370 * sur)

    def police(noms, taille):
        for n in noms:
            try:
                return ImageFont.truetype(n, taille)
            except OSError:
                continue
        return ImageFont.load_default()
    serif = police(['georgiab.ttf', 'timesbd.ttf', 'DejaVuSerif-Bold.ttf'], 120 * sur)
    petit = police(['georgiai.ttf', 'timesi.ttf', 'DejaVuSerif-Italic.ttf'], 44 * sur)
    d.text((500 * sur, 210 * sur), 'Terroirs', font=serif, fill=CRAIE)
    d.text((504 * sur, 360 * sur), 'vins et cépages', font=petit, fill=OR)
    d.text((504 * sur, 415 * sur), 'de France', font=petit, fill=OR)
    im.resize((1200, 630), Image.LANCZOS).save(os.path.join(SORTIE, 'apercu-1200x630.png'))


os.makedirs(SORTIE, exist_ok=True)
icone(192, 0.74, 'icon-192.png')
icone(512, 0.74, 'icon-512.png')
icone(512, 0.54, 'icon-maskable-512.png', arrondi=False)
apercu()
print('icônes écrites dans icons/')
