/* ============================================
   API — tout est chargé côté navigateur, sans backend.
   Le PCI Vecteur est servi en .json.gz sans Content-Encoding :
   on décompresse via DecompressionStream (Chrome/Edge 80+,
   Firefox 113+, Safari 16.4+).
   ============================================ */

const API = (() => {
  const { SOURCES } = CONFIG;
  const cache = new Map();

  /* ---- Recherche de communes (nom ou code INSEE) ------------------------- */
  async function chercherCommunes(q) {
    const champs = 'code,nom,codeDepartement,codesPostaux,population,centre,contour';
    const estCode = /^\d{4,5}$|^2[AB]\d{3}$/i.test(q.trim());
    const param = estCode ? `code=${encodeURIComponent(q.trim())}`
                          : `nom=${encodeURIComponent(q.trim())}&boost=population`;
    const res = await fetch(`${SOURCES.communes}?${param}&fields=${champs}&format=json&limit=10`);
    if (!res.ok) throw new Error(`geo.api.gouv.fr : HTTP ${res.status}`);
    return res.json();
  }

  /* ---- Couche PCI Vecteur d'une commune ---------------------------------- */
  async function chargerCouche(commune, couche) {
    const cle = `${commune.code}:${couche}`;
    if (cache.has(cle)) return cache.get(cle);

    if (typeof DecompressionStream === 'undefined') {
      throw new Error("Ce navigateur ne sait pas décompresser le gzip. " +
        "Utilisez tools/fetch_commune.py pour pré-télécharger la commune.");
    }

    const res = await fetch(SOURCES.pci(commune.codeDepartement, commune.code, couche));
    if (res.status === 404) {            // couche absente (commune sans bâti cadastré)
      const vide = { type: 'FeatureCollection', features: [] };
      cache.set(cle, vide);
      return vide;
    }
    if (!res.ok) throw new Error(`PCI ${couche} : HTTP ${res.status}`);

    const flux = res.body.pipeThrough(new DecompressionStream('gzip'));
    const data = JSON.parse(await new Response(flux).text());
    cache.set(cle, data);
    return data;
  }

  /* ---- Points d'injection biométhane (snapshot ODRÉ) --------------------- */
  async function chargerInjecteurs() {
    if (cache.has('injecteurs')) return cache.get('injecteurs');
    const res = await fetch(SOURCES.injecteurs);
    if (!res.ok) throw new Error(`Injecteurs : HTTP ${res.status}`);
    const pts = (await res.json())
      .filter(d => d.coordonnees && d.coordonnees.lon != null && d.coordonnees.lat != null)
      .map(d => ({
        nom: d.nom_du_projet, commune: d.commune, departement: d.departement,
        type: d.site, capacite: d.capacite_de_production_gwh_an,
        annee: d.annee_mes, reseau: d.type_de_reseau,
        ouvert: String(d.site_ouvert).toLowerCase() === 'true',
        lonlat: [d.coordonnees.lon, d.coordonnees.lat],
      }));
    cache.set('injecteurs', pts);
    return pts;
  }

  /* ---- Zonage PLU sur une emprise (API Carto IGN, module GPU) ------------
     Le contour communal détaillé dépasse la limite de longueur d'URL de
     l'API (HTTP 414) : on interroge sur la bbox.                            */
  async function zonageEmprise(bbox) {
    const poly = {
      type: 'Polygon',
      coordinates: [[[bbox[0], bbox[1]], [bbox[2], bbox[1]],
                     [bbox[2], bbox[3]], [bbox[0], bbox[3]], [bbox[0], bbox[1]]]],
    };
    const res = await fetch(`${SOURCES.gpuZoneUrba}?geom=${encodeURIComponent(JSON.stringify(poly))}`);
    if (!res.ok) throw new Error(`API Carto GPU : HTTP ${res.status}`);
    const fc = await res.json();
    return (fc.features || []).map(f => ({
      libelle: f.properties.libelle,
      libelong: f.properties.libelong,
      typezone: f.properties.typezone,
      urlPlan: f.properties.urlfic || null,
      geometry: f.geometry,
      bbox: GEO.bbox(f.geometry),
    }));
  }

  return { chercherCommunes, chargerCouche, chargerInjecteurs, zonageEmprise };
})();
