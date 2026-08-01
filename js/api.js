/* =============================================================================
   Accès aux données — tout est chargé côté navigateur, aucun backend.
   Le PCI Vecteur est servi en .json.gz sans Content-Encoding : on décompresse
   nous-mêmes via DecompressionStream (Chrome/Edge 80+, Firefox 113+, Safari 16.4+).
   ========================================================================== */

const API = {

  _cache: new Map(),

  /* ---- Recherche de communes (nom ou code INSEE) -------------------------- */
  async chercherCommunes(q) {
    const champs = "code,nom,codeDepartement,codesPostaux,population,centre,contour";
    const estCode = /^\d{4,5}$|^2[AB]\d{3}$/i.test(q.trim());
    const param = estCode ? `code=${encodeURIComponent(q.trim())}`
                          : `nom=${encodeURIComponent(q.trim())}&boost=population`;
    const url = `${CONFIG.sources.communes}?${param}&fields=${champs}&format=json&limit=12`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`geo.api.gouv.fr : HTTP ${res.status}`);
    return res.json();
  },

  /* ---- Couche PCI Vecteur d'une commune ----------------------------------- */
  async chargerCouche(commune, couche) {
    const cle = `${commune.code}:${couche}`;
    if (API._cache.has(cle)) return API._cache.get(cle);

    if (typeof DecompressionStream === "undefined") {
      throw new Error(
        "Ce navigateur ne sait pas décompresser le gzip (DecompressionStream absent). " +
        "Utilisez tools/fetch_commune.py pour pré-télécharger la commune dans data/."
      );
    }

    const url = CONFIG.sources.pci(commune.codeDepartement, commune.code, couche);
    const res = await fetch(url);
    if (res.status === 404) {          // couche absente (ex. commune sans bâti cadastré)
      const vide = { type: "FeatureCollection", features: [] };
      API._cache.set(cle, vide);
      return vide;
    }
    if (!res.ok) throw new Error(`PCI ${couche} : HTTP ${res.status}`);

    const flux = res.body.pipeThrough(new DecompressionStream("gzip"));
    const data = JSON.parse(await new Response(flux).text());
    API._cache.set(cle, data);
    return data;
  },

  /* ---- Points d'injection biométhane (snapshot ODRÉ) ---------------------- */
  async chargerInjecteurs() {
    if (API._cache.has("injecteurs")) return API._cache.get("injecteurs");
    const res = await fetch(CONFIG.sources.injecteurs);
    if (!res.ok) throw new Error(`Injecteurs : HTTP ${res.status}`);
    const brut = await res.json();
    const pts = brut
      .filter(d => d.coordonnees && d.coordonnees.lon != null && d.coordonnees.lat != null)
      .map(d => ({
        nom: d.nom_du_projet,
        commune: d.commune,
        type: d.site,
        capacite: d.capacite_de_production_gwh_an,
        annee: d.annee_mes,
        reseau: d.type_de_reseau,
        ouvert: String(d.site_ouvert).toLowerCase() === "true",
        lonlat: [d.coordonnees.lon, d.coordonnees.lat],
      }));
    API._cache.set("injecteurs", pts);
    return pts;
  },

  /* ---- Zonage PLU de toute une emprise (API Carto IGN, module GPU) --------
     On interroge sur la bbox de la commune : le contour détaillé dépasse la
     limite de longueur d'URL de l'API (HTTP 414).                             */
  async zonageEmprise(bbox) {
    const poly = {
      type: "Polygon",
      coordinates: [[
        [bbox[0], bbox[1]], [bbox[2], bbox[1]],
        [bbox[2], bbox[3]], [bbox[0], bbox[3]], [bbox[0], bbox[1]],
      ]],
    };
    const url = `${CONFIG.sources.gpuZoneUrba}?geom=${encodeURIComponent(JSON.stringify(poly))}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`API Carto GPU : HTTP ${res.status}`);
    const fc = await res.json();
    return (fc.features || []).map(f => ({
      libelle:  f.properties.libelle,
      libelong: f.properties.libelong,
      typezone: f.properties.typezone,
      urlPlan:  f.properties.urlfic || null,
      geometry: f.geometry,
      bbox:     GEO.bbox(f.geometry),
    }));
  },

  /* ---- Zonage PLU d'une parcelle (API Carto IGN, module GPU) --------------
     Renvoie {couvert:bool, zones:[{libelle, libelong, typezone, partition}]}   */
  async zonagePLU(lonlat) {
    const geom = JSON.stringify({ type: "Point", coordinates: lonlat });
    const url = `${CONFIG.sources.gpuZoneUrba}?geom=${encodeURIComponent(geom)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`API Carto GPU : HTTP ${res.status}`);
    const fc = await res.json();
    return {
      couvert: (fc.features || []).length > 0,
      zones: (fc.features || []).map(f => ({
        libelle:   f.properties.libelle,
        libelong:  f.properties.libelong,
        typezone:  f.properties.typezone,
        partition: f.properties.partition,
        urlPlan:   f.properties.urlfic || null,
      })),
    };
  },
};
