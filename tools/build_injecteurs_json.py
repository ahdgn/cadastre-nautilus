# -*- coding: utf-8 -*-
"""
Rafraîchit data/injecteurs-biomethane.json depuis ODRÉ (Open Data Réseaux Énergies).

Jeu de données : points-dinjection-de-biomethane-en-france
Usage : python tools/build_injecteurs_json.py
Aucune dépendance externe (urllib seulement).
"""
import json
import os
import sys
import urllib.request

URL = ("https://odre.opendatasoft.com/api/explore/v2.1/catalog/datasets/"
       "points-dinjection-de-biomethane-en-france/exports/json")

SORTIE = os.path.join(os.path.dirname(__file__), "..", "data", "injecteurs-biomethane.json")


def main():
    print(f"Téléchargement : {URL}")
    try:
        with urllib.request.urlopen(URL, timeout=120) as r:
            data = json.loads(r.read().decode("utf-8"))
    except Exception as e:
        sys.exit(f"Échec du téléchargement ODRÉ : {e}\n"
                 f"Le snapshot existant dans data/ reste utilisable.")

    geo = [d for d in data
           if isinstance(d.get("coordonnees"), dict)
           and d["coordonnees"].get("lon") is not None]

    with open(os.path.abspath(SORTIE), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)

    print(f"{len(data)} points ({len(geo)} géolocalisés) → {os.path.abspath(SORTIE)}")


if __name__ == "__main__":
    main()
