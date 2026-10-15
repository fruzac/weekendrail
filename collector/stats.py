#!/usr/bin/env python3
"""Chance qu'un train payant passe à 0€, calculée sur les photos déjà prises.

Pour chaque train régulier (même numéro, même trajet, même jour de la semaine),
on regarde ses départs passés : un départ compte comme « libéré » si le train
a été vu à 0€ dans au moins une photo avant de partir. Le pourcentage n'est
publié qu'à partir de MINIMUM départs observés, pour éviter les chiffres au
hasard. Résultat : data/stats.json.
"""

from __future__ import annotations

import datetime as dt
import json
from collections import defaultdict
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
SNAPSHOTS = DATA / "snapshots"
PARIS_TZ = ZoneInfo("Europe/Paris")
MINIMUM = 4


def main() -> None:
    aujourdhui = dt.datetime.now(PARIS_TZ).date().isoformat()
    vu_zero: dict[tuple, bool] = {}
    for fichier in sorted(SNAPSHOTS.glob("*.json")):
        photo = json.loads(fichier.read_text(encoding="utf-8"))
        for t in photo.get("trains", []):
            if t["date"] >= aujourdhui:
                continue
            cle = (t["date"], t["train"], t["origine"], t["destination"])
            vu_zero[cle] = vu_zero.get(cle, False) or bool(t["zero"])

    groupes: dict[str, list[bool]] = defaultdict(list)
    for (date, train, origine, destination), zero in vu_zero.items():
        jour_semaine = dt.date.fromisoformat(date).weekday()
        groupes[f"{train}|{origine}|{destination}|{jour_semaine}"].append(zero)

    trains = {
        cle: {"n": len(v), "pct": round(100 * sum(v) / len(v))}
        for cle, v in groupes.items()
        if len(v) >= MINIMUM
    }
    sortie = {
        "genere": dt.datetime.now(PARIS_TZ).isoformat(timespec="minutes"),
        "minimum": MINIMUM,
        "departs_observes": len(vu_zero),
        "trains": trains,
    }
    chemin = DATA / "stats.json"
    ancien = json.loads(chemin.read_text(encoding="utf-8")) if chemin.exists() else None
    if ancien and ancien.get("trains") == trains and ancien.get("departs_observes") == len(vu_zero):
        print("Statistiques inchangées.")
        return
    chemin.write_text(json.dumps(sortie, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(trains)} trains avec un pourcentage, sur {len(vu_zero)} départs observés.")


if __name__ == "__main__":
    main()
