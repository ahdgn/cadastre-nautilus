# Cadastre France — Explorateur foncier

Application statique (aucun backend, aucune dépendance à installer) pour explorer
le **PCI Vecteur / cadastre Etalab** commune par commune : géométrie des parcelles,
contenance, bâti cadastré, et **destination au PLU** via le Géoportail de l'urbanisme.

Outil **généraliste** : il ne présume d'aucune filière. Il répond à « montre-moi le
foncier de cette commune, sa taille, son bâti, ce que le PLU y autorise » — ce qui
vaut pour du solaire, du stockage, un site industriel, une due diligence ou une
simple vérification avant réunion. Aucun seuil métier n'est câblé par défaut.

Même socle que [`biomethane-france`](https://github.com/ahdgn/biomethane-france) :
HTML + JS vanilla, Leaflet, `js/config.js` comme source unique de vérité,
ETL Python optionnel dans `tools/`, et **la même feuille de style** — thème clair
institutionnel à la charte Nautilus (Masterbook).

## Lancer

```bash
python -m http.server 8010
```

puis http://localhost:8010 — tapez une commune ou un code INSEE (ex. `Bruz`, `35047`).
En ligne : **https://ahdgn.github.io/cadastre-nautilus/**

Aucune clé d'API, aucun compte. Tout est chargé à la volée depuis les serveurs publics.

## Ce que fait l'outil

1. **Charge le PCI Vecteur** d'une commune à la demande (GeoJSON gzippé de
   `cadastre.data.gouv.fr`, décompressé dans le navigateur via `DecompressionStream`).
2. **Enrichit chaque parcelle** : centroïde, nombre de bâtiments cadastrés
   (parcelle nue ou non), distance au site le plus proche de la couche de référence.
3. **Rattache le zonage PLU** — bouton *Charger le zonage PLU* : une requête
   API Carto IGN (module GPU) sur l'emprise communale, puis affectation par
   point-dans-polygone.
4. **Filtre, cartographie, exporte** : contenance, section, bâti, type de zone
   (U / AUc / AUs / A / N) → bandeau KPI, carte, onglet *Parcelle* (fiche + liens
   Géoportail / GPU / Géorisques), onglet *Données* (tableau trié, paginé, export CSV).
   L'état des filtres est dans l'URL (vue partageable).

Ordres de grandeur mesurés : Bruz (10 020 parcelles) charge en ~5 s et s'affiche
en entier ; Rennes (38 807 parcelles, 45 958 bâtiments) en ~20 s.

## Couches de référence

Une couche de référence est un jeu de points auquel on mesure la distance de chaque
parcelle. Une seule est fournie pour l'instant — les **sites d'injection biométhane**
(ODRÉ, 818 points) — **décochée par défaut** : c'est un exemple, pas le sujet de l'outil.
Postes sources, ICPE, friches viendront s'ajouter au même endroit.

## Sources

| Donnée | Source | Licence / MAJ |
|---|---|---|
| Parcelles, bâtiments | PCI Vecteur — DGFiP via `cadastre.data.gouv.fr` | Licence Ouverte, trimestrielle |
| Communes, contours, INSEE | `geo.api.gouv.fr` | Licence Ouverte |
| Couche de référence (exemple) | ODRÉ — sites d'injection biométhane | données au 01/01/2025 |
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
- **Carte plafonnée à 12 000 polygones** (`CONFIG.RENDU`) : au-delà, elle affiche
  les plus grandes parcelles et l'annonce. Le tableau et l'export restent complets.
  Mesure : 38 000 polygones = ~4 s de rendu, 12 000 = ~1,5 s.
- **Une commune à la fois.** C'est la principale limite fonctionnelle aujourd'hui.

## Structure

```
index.html            coquille : header, sidebar de filtres, KPI, carte, panneau bas
css/style.css         thème Biométhane France + section Cadastre
js/config.js          palette, sources, seuils, formateurs   ← source unique de vérité
js/geo.js             centroïde, bbox, haversine, point-dans-polygone (sans Turf)
js/api.js             geo.api.gouv.fr, PCI Vecteur (gzip), couche de référence, API Carto GPU
js/filters.js         état des filtres, contrôles, synchro URL
js/map.js             Leaflet, couches, légende, popups
js/table.js           tri aria-sort, pagination, export CSV
js/app.js             orchestration, enrichissement, KPI, fiche parcelle
data/                 jeux de référence
tools/                ETL Python optionnels
vendor/, assets/      Leaflet, fonte Roboto, logo — rien via CDN
```

## Règles de conception

- **Rester généraliste.** Aucun seuil, filtre par défaut ou vocabulaire propre à une
  filière dans le cœur de l'outil. Ce qui est spécifique à un usage se met dans une
  couche de référence optionnelle ou dans un filtre que l'utilisateur pose lui-même.
- **Ne jamais poser d'écouteur ni construire de popup par parcelle** : une commune
  peut en compter 40 000. Les événements vivent sur le groupe Leaflet, les popups
  sont construits à l'ouverture.
- **Toute couche de la sidebar qui passe en surcouche sous 860 px** doit démarrer
  fermée et se refermer sur le voile — sinon elle masque la carte.

## Outils

```bash
python tools/fetch_commune.py 35047                  # pré-télécharge le PCI dans data/pci/
python tools/build_injecteurs_json.py                # rafraîchit le jeu de référence ODRÉ
```

## Contribution

`main` est protégée : **toute modification passe par une pull request**
(pas de push direct, pas de force-push, historique linéaire).

```bash
git checkout -b feat/ma-brique
git commit -am "feat: ma brique"
git push -u origin feat/ma-brique
gh pr create --fill
```

## Prochaines briques

1. **Multi-commune** — charger un EPCI ou un rayon de X km autour d'un point.
2. **Couches de contrainte** — Géorisques (ICPE, PPRi, SIS) et INPN (Natura 2000),
   affichées et filtrables comme le zonage.
3. **Autres couches de référence** — postes sources électriques, friches, ICPE.
4. **Propriétaires** — Fichiers fonciers ou service tiers, sur une sélection réduite.
5. **Comparaison de communes** — mettre deux territoires côte à côte.
