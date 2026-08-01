/* ============================================
   Config — source unique de vérité
   Palette (charte Nautilus / Masterbook), sources
   de données, seuils métier, formateurs partagés
   ============================================ */

const CONFIG = (() => {

  const PALETTE = {
    teal: '#22788C', navy: '#1E4260', deepNavy: '#002D5F', steel: '#3E6B96',
    lightBlue: '#9BB4D2', gold: '#CDAC81', sage: '#6F8F6D',
    terracotta: '#D9844A', amber: '#FBAE40', violet: '#503C64',
  };

  /* ---- Sources ---------------------------------------------------------- */
  const SOURCES = {
    // Communes : code INSEE, contour, centre
    communes: 'https://geo.api.gouv.fr/communes',

    // PCI Vecteur — cadastre Etalab, GeoJSON gzippé par commune, MAJ trimestrielle
    // couche ∈ {parcelles, batiments, sections, feuilles, lieux_dits}
    pci: (codeDep, insee, couche) =>
      `https://cadastre.data.gouv.fr/data/etalab-cadastre/latest/geojson/communes/` +
      `${codeDep}/${insee}/cadastre-${insee}-${couche}.json.gz`,

    // Points d'injection biométhane (ODRÉ) — cf. tools/build_injecteurs_json.py
    injecteurs: 'data/injecteurs-biomethane.json',

    // API Carto IGN — module GPU (zonage PLU/PLUi)
    gpuZoneUrba: 'https://apicarto.ign.fr/api/gpu/zone-urba',
  };

  const TUILES = {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> ' +
                 '&copy; <a href="https://carto.com/">CARTO</a> — parcelles : PCI Vecteur / DGFiP',
    subdomains: 'abcd',
    maxZoom: 20,
  };

  /* ---- Filtres par défaut -------------------------------------------------
     Aucun filtre au chargement : l'outil est généraliste, c'est à l'utilisateur
     de poser ses seuils selon ce qu'il cherche (foncier industriel, solaire,
     stockage, due diligence…). Ne recâblez pas de seuil métier ici.          */
  const FILTRES_DEFAUT = {
    contenanceMin: null,
    contenanceMax: null,
    distanceInjecteurMax: null,
    section: '',
    typeZone: '',
    bati: '',            // '' | 'nue'
  };

  /* ---- Classes de contenance (couleur des parcelles) --------------------- */
  const CLASSES_CONTENANCE = [
    { min: 0,      label: '< 0,5 ha',   couleur: PALETTE.lightBlue },
    { min: 5000,   label: '0,5 – 2 ha', couleur: PALETTE.steel },
    { min: 20000,  label: '2 – 5 ha',   couleur: PALETTE.teal },
    { min: 50000,  label: '5 – 10 ha',  couleur: PALETTE.terracotta },
    { min: 100000, label: '≥ 10 ha',    couleur: PALETTE.violet },
  ];

  /* ---- Zonage PLU -------------------------------------------------------- */
  const ZONAGE = {
    couleurs: {
      U:   PALETTE.steel,
      AUc: PALETTE.amber,
      AUs: PALETTE.gold,
      A:   PALETTE.sage,
      N:   PALETTE.violet,
    },
    libelles: {
      U: 'Urbaine', AUc: 'À urbaniser (constructible)', AUs: 'À urbaniser (strict)',
      A: 'Agricole', N: 'Naturelle',
    },
    defaut: '#C9D2DD',
  };

  /* Au-delà de ce nombre, la carte n'affiche que les plus grandes parcelles et
     le dit : redessiner 38 000 polygones prend ~4 s, 12 000 en prend ~1,5.
     Le tableau et l'export, eux, restent toujours complets.                   */
  const RENDU = { maxPolygones: 12000 };

  /* ---- Liens externes ---------------------------------------------------- */
  const LIENS = {
    geoportail: (lon, lat) => `https://www.geoportail.gouv.fr/carte?c=${lon},${lat}&z=18&permalink=yes`,
    gpu:        (lon, lat) => `https://www.geoportail-urbanisme.gouv.fr/map/#tile=1&lon=${lon}&lat=${lat}&zoom=17`,
    georisques: (lon, lat) => `https://www.georisques.gouv.fr/mes-risques/connaitre-les-risques-pres-de-chez-moi?lon=${lon}&lat=${lat}`,
    googleMaps: (lon, lat) => `https://www.google.com/maps?q=${lat},${lon}`,
  };

  /* ---- Formateurs partagés ----------------------------------------------- */
  const fmtNum = (v, dec = 0) =>
    v == null || Number.isNaN(v) ? '—'
      : v.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

  const fmtHa = (m2, dec = 2) => m2 == null ? '—' : fmtNum(m2 / 10000, dec);

  const escapeHtml = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const couleurContenance = (m2) => {
    let c = CLASSES_CONTENANCE[0].couleur;
    for (const cl of CLASSES_CONTENANCE) if (m2 >= cl.min) c = cl.couleur;
    return c;
  };

  const couleurZone = (typeZone) => ZONAGE.couleurs[typeZone] || ZONAGE.defaut;

  return {
    PALETTE, SOURCES, TUILES, FILTRES_DEFAUT, CLASSES_CONTENANCE, ZONAGE, RENDU, LIENS,
    fmtNum, fmtHa, escapeHtml, couleurContenance, couleurZone,
  };
})();
