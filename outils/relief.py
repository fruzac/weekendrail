"""Calcul ponctuel : courbes de niveau réelles de la région (tuiles d'altitude publiques Terrarium, zoom 9)."""
import io, json, math
import numpy as np
import requests
from PIL import Image
from skimage import measure
from shapely.geometry import LineString

Z = 9
LON0, LON1, LAT0, LAT1 = 3.6, 6.9, 44.55, 46.45


def tuile(lon, lat):
    n = 2 ** Z
    x = (lon + 180) / 360 * n
    y = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
    return x, y


x0, y0 = tuile(LON0, LAT1)
x1, y1 = tuile(LON1, LAT0)
tx0, ty0, tx1, ty1 = int(x0), int(y0), int(x1), int(y1)
L, H = (tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256
alt = np.zeros((H, L), dtype=np.float32)
for tx in range(tx0, tx1 + 1):
    for ty in range(ty0, ty1 + 1):
        url = f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{tx}/{ty}.png'
        im = np.asarray(Image.open(io.BytesIO(requests.get(url, timeout=60).content)).convert('RGB')).astype(np.float32)
        h = im[:, :, 0] * 256 + im[:, :, 1] + im[:, :, 2] / 256 - 32768
        alt[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = h
alt = np.maximum(alt, 0)


def vers_geo(r, c):
    n = 2 ** Z
    x = tx0 + c / 256
    y = ty0 + r / 256
    lon = x / n * 360 - 180
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    return round(lat, 4), round(lon, 4)


# léger lissage pour des courbes plus douces
from scipy.ndimage import gaussian_filter
lisse = gaussian_filter(alt, 1.2)
courbes = {}
for niveau in range(100, 4801, 100):
    lignes = []
    for c in measure.find_contours(lisse, niveau):
        if len(c) < 6:
            continue
        geo = [vers_geo(r, cc) for r, cc in c]
        ls = LineString([(lo, la) for la, lo in geo]).simplify(0.004)
        pts = [[round(la, 4), round(lo, 4)] for lo, la in ls.coords]
        if len(pts) >= 3:
            lignes.append(pts)
    courbes[niveau] = lignes

# grille réduite (pas de 0,01°) pour ombrages ou hachures
lats = np.arange(LAT1, LAT0, -0.01)
lons = np.arange(LON0, LON1, 0.01)
grille = []
for la in lats:
    ligne = []
    for lo in lons:
        x, y = tuile(lo, la)
        c = int((x - tx0) * 256)
        r = int((y - ty0) * 256)
        ligne.append(int(lisse[min(r, H - 1), min(c, L - 1)]))
    grille.append(ligne)

json.dump({'bbox': [LON0, LON1, LAT0, LAT1], 'courbes': courbes}, open('outils/courbes.json', 'w'), separators=(',', ':'))
json.dump({'lat0': float(lats[0]), 'lon0': float(lons[0]), 'pas': 0.01, 'alt': grille}, open('outils/grille.json', 'w'), separators=(',', ':'))
print('ok', {k: len(v) for k, v in courbes.items() if k % 500 == 0})
