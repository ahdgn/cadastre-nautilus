# -*- coding: utf-8 -*-
"""
Filet de sécurité : pré-télécharge le PCI Vecteur d'une commune dans data/
(utile si le navigateur ne supporte pas DecompressionStream, ou pour travailler
hors ligne / faire du batch SIG).

Usage :
    python tools/fetch_commune.py 35047
    python tools/fetch_commune.py 35047 --couches parcelles batiments sections

Sortie : data/pci/cadastre-<insee>-<couche>.json (GeoJSON décompressé)
"""
import argparse
import gzip
import io
import json
import os
import urllib.request

BASE = ("https://cadastre.data.gouv.fr/data/etalab-cadastre/latest/geojson/communes/"
        "{dep}/{insee}/cadastre-{insee}-{couche}.json.gz")

DEST = os.path.join(os.path.dirname(__file__), "..", "data", "pci")


def departement(insee: str) -> str:
    """Dossier département : 971xx -> 971, 2A004 -> 2A, sinon 2 premiers chiffres."""
    return insee[:3] if insee.startswith("97") else insee[:2]


def telecharger(insee: str, couche: str) -> str:
    url = BASE.format(dep=departement(insee), insee=insee, couche=couche)
    print(f"  {couche:12s} ← {url}")
    with urllib.request.urlopen(url, timeout=180) as r:
        brut = r.read()
    data = json.loads(gzip.decompress(brut).decode("utf-8"))

    os.makedirs(DEST, exist_ok=True)
    chemin = os.path.abspath(os.path.join(DEST, f"cadastre-{insee}-{couche}.json"))
    with open(chemin, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    print(f"  {len(data.get('features', []))} objets → {chemin}")
    return chemin


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("insee", help="code INSEE de la commune (ex. 35047)")
    ap.add_argument("--couches", nargs="+", default=["parcelles", "batiments"],
                    help="parcelles, batiments, sections, feuilles, lieux_dits")
    a = ap.parse_args()

    print(f"PCI Vecteur — commune {a.insee} (département {departement(a.insee)})")
    for c in a.couches:
        try:
            telecharger(a.insee, c)
        except Exception as e:
            print(f"  ! {c} : {e}")


if __name__ == "__main__":
    main()
