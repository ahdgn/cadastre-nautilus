# Cadastre France — Explorateur foncier

Application statique (aucun backend, aucune dépendance à installer) pour explorer
le **PCI Vecteur / cadastre Etalab** commune par commune, le croiser avec les
**points d'injection biométhane** et le **zonage PLU** du Géoportail de l'urbanisme.

Même socle que [`biomethane-france`](https://github.com/ahdgn/biomethane-france) :
HTML + JS vanilla, Leaflet, `js/config.js` comme source unique de vérité,
ETL Python optionnel dans `tools/`, et **la même feuille de style** — thème clair
institutionnel à la charte Nautilus (Masterbook).

## Lancer

```bash
python -m http.server 8010
```

puis http://localhost:8010 — tapez une commune ou un code INSEE (ex. `Bruz`, `35047`).

Aucune clé d'API, aucun compte. Tout est chargé à la volée depuis les serveurs publics.

## Ce que fait l'outil

1. **Charge le PCI Vecteur** d'une commune à la demande (GeoJSON gzippé de
   `cadastre.data.gouv.fr`, décompressé dans le navigateur via `DecompressionStream`).
   Bruz (35047) : 10 020 parcelles + 9 809 bâtiments en ~1,3 s.
2. **Enrichit chaque parcelle** : centroïde, nombre de bâtiments cadastrés
   (parcelle nue ou non), distance à l'injecteur biométhane le plus proche.
3. **Rattache le zonage PLU** — bouton *Charger le zonage PLU* : une requête
   API Carto IGN (module GPU) sur l'emprise communale, puis affectation par
   point-dans-polygone. Bruz : 395 zones, 10 020/10 020 parcelles rattachées.
4. **Filtre, cartographie, exporte** : contenance, section, bâti, distance
   injecteur, type de zone (U / AUc / AUs / A / N) → bandeau KPI, carte,
   onglet *Parcelle* (fiche détaillée + liens Géoportail / GPU / Géorisques),
   onglet *Données* (tableau trié, paginé, export CSV). L'état des filtres est
   dans l'URL (vue partageable).

Exemple de requête métier, sur Bruz : *parcelle agricole, ≥ 3 ha, sans bâtiment,
à moins de 5 km d'un injecteur* → **16 parcelles**, 65,9 ha cumulés.

## Design

L'identité visuelle est celle du portail Biométhane France : `css/style.css` est
la feuille de style de ce dépôt, prolongée d'une section « Cadastre » qui réutilise
les mêmes jetons (`--teal`, `--navy`, `--radius`, `--shadow`…). Comme dans
`biomethane-france`, **rien n'est chargé depuis un CDN** : Leaflet et la fonte
Roboto sont vendorisés dans `vendor/`, le logo dans `assets/`.

Toute évolution du design doit rester alignée sur ce dépôt de référence.

## Sources

| Donnée | Source | Licence / MAJ |
|---|---|---|
| Parcelles, bâtiments | PCI Vecteur — DGFiP via `cadastre.data.gouv.fr` | Licence Ouverte, trimestrielle |
| Communes, contours, INSEE | `geo.api.gouv.fr` | Licence Ouverte |
| Points d'injection biométhane | ODRÉ (`data/injecteurs-biomethane.json`, 818 points) | données au 01/01/2025 |
| Zonage PLU / PLUi | API Carto IGN — module GPU | Géoportail de l'urbanisme |

## Limites à connaître

- **Le cadastre ne contient pas les propriétaires.** Le PCI Vecteur donne la
  géométrie et la contenance, pas la propriété. Cette couche passe par les
  Fichiers fonciers (Cerema, accès conventionné) ou un service tiers type Pappers.
- **Le zonage GPU n'est pas opposable** : seul le document approuvé en mairie
  fait foi. Couverture incomplète — une commune au RNU ou dont le document n'est
  pas versé au GPU renvoie 0 zone (message explicite dans l'app).
- **Rattachement au zonage par centroïde** : une parcelle à cheval sur deux zones
  reçoit celle de son centre. Les emprises à trous (enclaves) sont ignorées.
- **Contenance ≠ surface géométrique** : on affiche la contenance cadastrale
  officielle, qui peut différer de l'aire calculée sur le polygone.
- La carte plafonne à 4 000 polygones (cf. `CONFIG.RENDU`) ; au-delà le tableau
  et l'export CSV restent complets.

## Structure

```
index.html            coquille : header, sidebar de filtres, KPI, carte, panneau bas
css/style.css         thème Biométhane France + section Cadastre
js/config.js          palette, sources, seuils, formateurs   ← source unique de vérité
js/geo.js             centroïde, bbox, haversine, point-dans-polygone (sans Turf)
js/api.js             geo.api.gouv.fr, PCI Vecteur (gzip), ODRÉ, API Carto GPU
js/filters.js         état des filtres, contrôles, synchro URL
js/map.js             Leaflet, couches, légende, popups
js/table.js           tri aria-sort, pagination, export CSV
js/app.js             orchestration, enrichissement, KPI, fiche parcelle
data/                 snapshot ODRÉ
tools/                ETL Python optionnels
vendor/, assets/      Leaflet, fonte Roboto, logo — rien via CDN
```

## Outils

```bash
python tools/fetch_commune.py 35047                  # pré-télécharge le PCI dans data/pci/
python tools/build_injecteurs_json.py                # rafraîchit le snapshot ODRÉ
```

## Contribution

`main` est protégée : **toute modification passe par une pull request**
(pas de push direct, pas de force-push, historique linéaire).

```bash
git checkout -b feat/ma-brique
# … modifications …
git commit -am "feat: ma brique"
git push -u origin feat/ma-brique
gh pr create --fill
```

## Prochaines briques (par ordre d'utilité)

1. **Multi-commune** — charger un EPCI ou un rayon de X km autour d'un point,
   pas une commune à la fois.
2. **Contraintes rédhibitoires** — Géorisques (ICPE, PPRi, SIS) et INPN
   (Natura 2000) en couches de disqualification, + distance au bâti résidentiel
   (règle des 200 m de la rubrique ICPE 2781).
3. **Réseau gaz** — capacité résiduelle de la maille et communes desservies
   (Open Data GRDF), pour passer de « distance à l'injecteur » à « débouché réel ».
4. **Propriétaires** — branchement Pappers Immobilier sur la short-list seulement
   (quota), avec typologie de deal (foncier détenu par l'exploitant ou non).
5. **Score de site** — combiner les couches en une note unique et rejoindre la
   chaîne `qualification_sites.py` / `etage2_succession.py` du screening ACREnergy.
6. **Cogénérations** — superposer les 1 002 sites du radar conversion en plus des
   818 injecteurs.
