/* =============================================================================
   Nautilus — Explorateur cadastral
   Source unique de vérité : palette, sources de données, seuils, liens externes.
   Toute constante partagée vit ici (même principe que biomethane-france/js/config.js).
   ========================================================================== */

const CONFIG = {

  app: {
    nom: "Nautilus — Explorateur cadastral",
    version: "0.1.0",
    sousTitre: "PCI Vecteur (cadastre Etalab) × injection biométhane × PLU",
  },

  /* ---- Charte Nautilus ---------------------------------------------------- */
  palette: {
    encre:      "#1E4260",   // texte, header
    primaire:   "#004B87",   // bleu Nautilus
    acier:      "#3E6B96",
    bleuClair:  "#9BB4D2",
    violet:     "#503C64",
    or:         "#CDAC81",
    sauge:      "#6F8F6D",
    terracotta: "#D9844A",
    ambre:      "#FBAE40",
  },

  /* ---- Sources de données ------------------------------------------------- */
  sources: {
    // Recherche de communes (code INSEE, centre, département)
    communes: "https://geo.api.gouv.fr/communes",

    // PCI Vecteur — cadastre Etalab, GeoJSON gzippé par commune, MAJ trimestrielle.
    // couche ∈ {parcelles, batiments, sections, feuilles, lieux_dits}
    pci: (codeDep, insee, couche) =>
      `https://cadastre.data.gouv.fr/data/etalab-cadastre/latest/geojson/communes/` +
      `${codeDep}/${insee}/cadastre-${insee}-${couche}.json.gz`,

    // Points d'injection biométhane (ODRÉ) — snapshot local, cf. tools/build_injecteurs_json.py
    injecteurs: "data/injecteurs-biomethane.json",

    // API Carto IGN — module GPU : zonage PLU/PLUi intersectant une géométrie
    gpuZoneUrba: "https://apicarto.ign.fr/api/gpu/zone-urba",
    gpuCommune:  "https://apicarto.ign.fr/api/gpu/municipality",
  },

  /* ---- Fond de carte ------------------------------------------------------ */
  fond: {
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> ' +
      '&copy; <a href="https://carto.com/attributions">CARTO</a> — ' +
      'parcelles : PCI Vecteur / DGFiP (Licence Ouverte)',
    maxZoom: 20,
  },

  /* ---- Filtres par défaut -------------------------------------------------
     30 000 m² = 3 ha : ordre de grandeur d'une unité de méthanisation avec
     épuration + stockage + poste d'injection, extension comprise.            */
  filtresDefaut: {
    contenanceMin: 30000,
    contenanceMax: null,
    parcelleNue: false,          // aucun bâtiment cadastré sur la parcelle
    distanceInjecteurMax: null,  // km
    section: "",
    typeZone: "",                // U / AU / A / N (nécessite le zonage chargé)
  },

  /* ---- Zonage PLU (API Carto GPU) ----------------------------------------- */
  zonage: {
    couleurs: {
      U:   "#3E6B96",   // urbaine
      AUc: "#FBAE40",   // à urbaniser constructible
      AUs: "#CDAC81",   // à urbaniser strict
      A:   "#6F8F6D",   // agricole
      N:   "#503C64",   // naturelle
    },
    libelles: {
      U: "Urbaine", AUc: "À urbaniser (constructible)", AUs: "À urbaniser (strict)",
      A: "Agricole", N: "Naturelle",
    },
    defaut: "#C9D2DD",
  },

  /* ---- Classes de contenance (couleur des parcelles) ---------------------- */
  classesContenance: [
    { min: 0,      label: "< 0,5 ha",   couleur: "#9BB4D2" },
    { min: 5000,   label: "0,5 – 2 ha", couleur: "#3E6B96" },
    { min: 20000,  label: "2 – 5 ha",   couleur: "#FBAE40" },
    { min: 50000,  label: "5 – 10 ha",  couleur: "#D9844A" },
    { min: 100000, label: "≥ 10 ha",    couleur: "#503C64" },
  ],

  /* ---- Garde-fous de rendu ------------------------------------------------ */
  rendu: {
    maxPolygones: 4000,   // au-delà, on n'affiche pas (le tableau reste complet)
    maxLignesTable: 500,
  },

  /* ---- Liens externes (deep links vérifiés) ------------------------------- */
  liens: {
    geoportail: (lon, lat) =>
      `https://www.geoportail.gouv.fr/carte?c=${lon},${lat}&z=18&permalink=yes`,
    gpu: (lon, lat) =>
      `https://www.geoportail-urbanisme.gouv.fr/map/#tile=1&lon=${lon}&lat=${lat}&zoom=17`,
    georisques: (lon, lat) =>
      `https://www.georisques.gouv.fr/mes-risques/connaitre-les-risques-pres-de-chez-moi?lon=${lon}&lat=${lat}`,
  },
};
