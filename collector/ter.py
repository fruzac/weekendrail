#!/usr/bin/env python3
"""Horaires TER pour les correspondances (Grenoble, Saint Marcellin).

Télécharge le GTFS de la SNCF (tous les trains et cars, horaires théoriques),
garde les TER entre quelques gares de correspondance et écrit data/ter.json :
pour chaque liaison et chaque jour des 35 prochains jours, la liste des
départs et arrivées.
"""

from __future__ import annotations

import csv
import datetime as dt
import io
import json
import math
import sys
import unicodedata
import zipfile
from collections import defaultdict
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

GTFS = "https://eu.ftp.opendatasoft.com/sncf/plandata/Export_OpenData_SNCF_GTFS_NewTripId.zip"
ROOT = Path(__file__).resolve().parent.parent
SORTIE = ROOT / "data" / "ter.json"
PARIS_TZ = ZoneInfo("Europe/Paris")
JOURS = 35

# Gare -> (mots qui doivent apparaître dans le nom, latitude, longitude)
GARES = {
    "LYON": (["LYON", "PART DIEU"], 45.7606, 4.8594),
    "VALENCE_TGV": (["VALENCE", "TGV"], 44.9913, 4.9786),
    "VALENCE_VILLE": (["VALENCE"], 44.9286, 4.8935),
    "CHAMBERY": (["CHAMBERY"], 45.5713, 5.9196),
    "GRENOBLE": (["GRENOBLE"], 45.1913, 5.7146),  # nom exact, voir NOMS_EXACTS
    "ST_MARCELLIN": (["MARCELLIN"], 45.1517, 5.3197),
}
RAYON_KM = 1.5
# Grenoble a plusieurs arrêts de car en ville : on ne garde que la gare.
NOMS_EXACTS = {"GRENOBLE": {"GRENOBLE", "GRENOBLE GARE ROUTIERE"}}

PAIRES = [
    ("LYON", "GRENOBLE"),
    ("VALENCE_TGV", "GRENOBLE"),
    ("VALENCE_VILLE", "GRENOBLE"),
    ("CHAMBERY", "GRENOBLE"),
    ("VALENCE_TGV", "ST_MARCELLIN"),
    ("VALENCE_VILLE", "ST_MARCELLIN"),
    ("GRENOBLE", "ST_MARCELLIN"),
]
LIAISONS = set(PAIRES) | {(b, a) for a, b in PAIRES}


def normaliser(texte: str) -> str:
    t = unicodedata.normalize("NFKD", texte or "").encode("ascii", "ignore").decode().upper()
    for c in "-'’.,()":
        t = t.replace(c, " ")
    return " ".join(t.split())


def distance_km(lat1, lon1, lat2, lon2) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def gare_de(nom: str, lat: float, lon: float) -> str | None:
    n = normaliser(nom)
    trouvees = []
    for cle, (mots, glat, glon) in GARES.items():
        if cle in NOMS_EXACTS and n not in NOMS_EXACTS[cle]:
            continue
        if all(m in n for m in mots) and distance_km(lat, lon, glat, glon) <= RAYON_KM:
            trouvees.append(cle)
    if "VALENCE_TGV" in trouvees:
        return "VALENCE_TGV"
    return trouvees[0] if trouvees else None


def lire(z: zipfile.ZipFile, nom: str):
    with z.open(nom) as f:
        yield from csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig", newline=""))


def secondes(hms: str) -> int:
    h, m, s = (int(x) for x in hms.split(":"))
    return h * 3600 + m * 60 + s


def main() -> None:
    print(f"Téléchargement de {GTFS}")
    r = requests.get(GTFS, timeout=600)
    r.raise_for_status()
    z = zipfile.ZipFile(io.BytesIO(r.content))
    print(f"{len(r.content) / 1e6:.1f} Mo, fichiers : {z.namelist()}")

    # 1. Arrêts TER des gares utiles
    arrets: dict[str, str] = {}
    noms_retenus: dict[str, set] = defaultdict(set)
    for s in lire(z, "stops.txt"):
        sid = s["stop_id"]
        if "TER-" not in sid.upper():  # « Train TER- », « Car TER- », pas « INTERCITES- »
            continue
        try:
            lat, lon = float(s["stop_lat"]), float(s["stop_lon"])
        except (KeyError, ValueError):
            continue
        cle = gare_de(s.get("stop_name", ""), lat, lon)
        if cle:
            arrets[sid] = cle
            noms_retenus[cle].add(f'{s.get("stop_name")} [{sid}]')
    for cle in GARES:
        print(f"{cle}: {sorted(noms_retenus[cle])}")
    manquantes = [c for c in GARES if not noms_retenus[c]]
    if manquantes:
        print(f"Gares introuvables : {manquantes}")
        sys.exit(1)

    # 2. Passages des trajets dans ces gares
    passages: dict[str, list] = defaultdict(list)
    for st in lire(z, "stop_times.txt"):
        cle = arrets.get(st["stop_id"])
        if cle:
            passages[st["trip_id"]].append(
                (int(st["stop_sequence"]), cle, st["arrival_time"], st["departure_time"], "Car" in st["stop_id"])
            )

    # 3. Trajets -> services
    services: dict[str, str] = {}
    for t in lire(z, "trips.txt"):
        if t["trip_id"] in passages:
            services[t["trip_id"]] = t["service_id"]

    # 4. Jours de circulation sur la fenêtre utile
    debut = dt.datetime.now(PARIS_TZ).date()
    fin = debut + dt.timedelta(days=JOURS)
    utiles = set(services.values())
    jours_service: dict[str, set] = defaultdict(set)
    noms = set(z.namelist())
    if "calendar.txt" in noms:
        cols = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        for c in lire(z, "calendar.txt"):
            if c["service_id"] not in utiles:
                continue
            d0 = dt.datetime.strptime(c["start_date"], "%Y%m%d").date()
            d1 = dt.datetime.strptime(c["end_date"], "%Y%m%d").date()
            d = max(d0, debut - dt.timedelta(days=1))
            while d <= min(d1, fin):
                if c[cols[d.weekday()]] == "1":
                    jours_service[c["service_id"]].add(d)
                d += dt.timedelta(days=1)
    if "calendar_dates.txt" in noms:
        for c in lire(z, "calendar_dates.txt"):
            if c["service_id"] not in utiles:
                continue
            d = dt.datetime.strptime(c["date"], "%Y%m%d").date()
            if c["exception_type"] == "1":
                jours_service[c["service_id"]].add(d)
            else:
                jours_service[c["service_id"]].discard(d)

    # 5. Liaisons par jour
    liaisons: dict[str, dict[str, set]] = defaultdict(lambda: defaultdict(set))
    for trip, arrets_trip in passages.items():
        if len(arrets_trip) < 2:
            continue
        arrets_trip.sort()
        jours = jours_service.get(services.get(trip, ""), set())
        if not jours:
            continue
        for i, (_, a, _, dep_a, car_a) in enumerate(arrets_trip):
            for _, b, arr_b, _, car_b in arrets_trip[i + 1:]:
                if (a, b) not in LIAISONS or a == b:
                    continue
                s_dep, s_arr = secondes(dep_a), secondes(arr_b)
                for j in jours:
                    jour = j + dt.timedelta(days=s_dep // 86400)
                    if not (debut <= jour <= fin):
                        continue
                    hd = (s_dep % 86400) // 60
                    ha = hd + (s_arr - s_dep) // 60
                    liaisons[f"{a}>{b}"][jour.isoformat()].add(
                        (f"{hd // 60:02d}:{hd % 60:02d}", f"{ha // 60:02d}:{ha % 60:02d}", 1 if (car_a or car_b) else 0)
                    )

    sortie = {
        "genere": dt.datetime.now(PARIS_TZ).isoformat(timespec="minutes"),
        "source": "SNCF, GTFS horaires théoriques",
        "gares": {c: sorted(v) for c, v in noms_retenus.items()},
        "liaisons": {
            k: {jour: [list(x) for x in sorted(v)] for jour, v in sorted(par_jour.items())}
            for k, par_jour in sorted(liaisons.items())
        },
    }
    for k, par_jour in sorted(sortie["liaisons"].items()):
        n = sum(len(v) for v in par_jour.values())
        print(f"{k}: {n} passages sur {len(par_jour)} jours")
    manquantes = [f"{a}>{b}" for a, b in LIAISONS if f"{a}>{b}" not in sortie["liaisons"]]
    if manquantes:
        print(f"Liaisons sans aucun train : {sorted(manquantes)}")

    texte = json.dumps(sortie, ensure_ascii=False, separators=(",", ":"))
    ancien = SORTIE.read_text(encoding="utf-8") if SORTIE.exists() else ""
    if ancien:
        a = json.loads(ancien)
        if a.get("liaisons") == sortie["liaisons"]:
            print("Horaires inchangés.")
            return
    SORTIE.write_text(texte, encoding="utf-8")
    print(f"Écrit : {SORTIE} ({len(texte) / 1000:.0f} ko)")


if __name__ == "__main__":
    main()
