#!/usr/bin/env python3
"""Relevé des places MAX JEUNE à partir de l'open data SNCF (jeu « tgvmax »).

Chaque lancement télécharge la disponibilité à 30 jours, garde uniquement les
trajets Paris <> Grenoble, Lyon, Valence, Chambéry et Annecy, puis enregistre
une photo datée dans data/snapshots/. Si rien n'a changé depuis la dernière
photo, aucun fichier n'est modifié.
"""

from __future__ import annotations

import datetime as dt
import json
import sys
import unicodedata
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

API = "https://data.sncf.com/api/explore/v2.1/catalog/datasets/tgvmax"
ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
SNAPSHOTS = DATA / "snapshots"
PARIS_TZ = ZoneInfo("Europe/Paris")

# Mot clé recherché dans le nom de gare (sans accents, en majuscules) -> nom affiché
VILLES = {
    "GRENOBLE": "Grenoble",
    "LYON": "Lyon",
    "VALENCE": "Valence",
    "CHAMBERY": "Chambéry",
    "ANNECY": "Annecy",
}

# Noms de champs possibles dans le jeu de données (le premier trouvé gagne)
CHAMPS = {
    "date": ["date"],
    "train": ["train_no", "train", "numero_train"],
    "origine": ["origine", "origin"],
    "destination": ["destination"],
    "depart": ["heure_depart", "depart"],
    "arrivee": ["heure_arrivee", "arrivee"],
    "dispo": ["od_happy_card", "disponibilite", "dispo"],
}


def normaliser(texte: str) -> str:
    sans_accents = unicodedata.normalize("NFKD", texte or "").encode("ascii", "ignore").decode()
    return sans_accents.upper()


def ville_de(nom_gare: str) -> str | None:
    n = normaliser(nom_gare)
    for cle in VILLES:
        if cle in n:
            return cle
    return None


def heure(valeur) -> str:
    return str(valeur or "")[:5]


def resoudre_champs(exemple: dict) -> dict:
    trouves = {}
    for role, candidats in CHAMPS.items():
        for c in candidats:
            if c in exemple:
                trouves[role] = c
                break
    manquants = [r for r in CHAMPS if r not in trouves]
    if manquants:
        print(f"Champs introuvables : {manquants}")
        print(f"Champs disponibles : {sorted(exemple.keys())}")
        sys.exit(1)
    return trouves


def date_maj_sncf() -> str | None:
    """Date de la dernière mise à jour du jeu côté SNCF, si l'API la donne."""
    try:
        r = requests.get(API, timeout=60)
        r.raise_for_status()
        metas = r.json().get("metas", {}).get("default", {})
        return metas.get("data_processed")
    except Exception as e:  # la photo reste utile même sans cette info
        print(f"Métadonnées indisponibles : {e}")
        return None


def telecharger() -> list[dict]:
    r = requests.get(f"{API}/exports/json", params={"timezone": "Europe/Paris"}, timeout=300)
    r.raise_for_status()
    return r.json()


def filtrer(enregistrements: list[dict]) -> list[dict]:
    if not enregistrements:
        print("Le jeu de données est vide.")
        sys.exit(1)
    f = resoudre_champs(enregistrements[0])
    vus, trains = set(), []
    gares_vues = set()
    for rec in enregistrements:
        origine, destination = str(rec[f["origine"]]), str(rec[f["destination"]])
        if "PARIS" in normaliser(origine):
            sens, ville = "aller", ville_de(destination)
        elif "PARIS" in normaliser(destination):
            sens, ville = "retour", ville_de(origine)
        else:
            continue
        if not ville:
            continue
        gares_vues.add(destination if sens == "aller" else origine)
        ligne = {
            "date": str(rec[f["date"]])[:10],
            "train": str(rec[f["train"]]),
            "sens": sens,
            "ville": VILLES[ville],
            "origine": origine,
            "destination": destination,
            "depart": heure(rec[f["depart"]]),
            "arrivee": heure(rec[f["arrivee"]]),
            "zero": str(rec[f["dispo"]]).strip().upper() in {"OUI", "TRUE", "1", "YES"},
        }
        cle = (ligne["date"], ligne["train"], origine, destination)
        if cle in vus:
            continue
        vus.add(cle)
        trains.append(ligne)
    print(f"Gares retenues : {sorted(gares_vues)}")
    trains.sort(key=lambda t: (t["date"], t["depart"], t["train"], t["origine"]))
    return trains


def cle_train(t: dict) -> tuple:
    return (t["date"], t["train"], t["origine"], t["destination"])


def comparer(avant: list[dict], apres: list[dict]) -> list[dict]:
    """Trains passés à 0€ ou qui ne le sont plus depuis la photo précédente."""
    precedent = {cle_train(t): t["zero"] for t in avant}
    changements = []
    for t in apres:
        ancien = precedent.get(cle_train(t))
        if ancien is not None and ancien != t["zero"]:
            changements.append({**t, "avant": ancien})
        elif ancien is None and t["zero"]:
            changements.append({**t, "avant": None})
    return changements


def derniere_photo(sauf: str | None = None) -> tuple[Path | None, dict | None]:
    fichiers = sorted(p for p in SNAPSHOTS.glob("*.json") if p.stem != sauf)
    if not fichiers:
        return None, None
    return fichiers[-1], json.loads(fichiers[-1].read_text(encoding="utf-8"))


def main() -> None:
    SNAPSHOTS.mkdir(parents=True, exist_ok=True)
    maj = date_maj_sncf()
    trains = filtrer(telecharger())
    print(f"{len(trains)} trains retenus, dont {sum(t['zero'] for t in trains)} à 0€")

    jour = (maj or dt.datetime.now(PARIS_TZ).isoformat())[:10]

    _, derniere = derniere_photo()
    if derniere and derniere.get("trains") == trains:
        print("Aucun changement depuis la dernière photo.")
        return

    _, precedente = derniere_photo(sauf=jour)
    photo = {
        "jour": jour,
        "releve": dt.datetime.now(PARIS_TZ).isoformat(timespec="minutes"),
        "maj_sncf": maj,
        "changements": comparer(precedente["trains"], trains) if precedente else [],
        "trains": trains,
    }
    texte = json.dumps(photo, ensure_ascii=False, separators=(",", ":"))
    (SNAPSHOTS / f"{jour}.json").write_text(texte, encoding="utf-8")
    (DATA / "latest.json").write_text(texte, encoding="utf-8")
    print(f"Photo enregistrée : data/snapshots/{jour}.json")


if __name__ == "__main__":
    main()
