/* =============================================================================
   Carte Leaflet : parcelles (couleur = contenance), bâti cadastré, injecteurs.
   ========================================================================== */

const CARTE = {

  map: null,
  coucheParcelles: null,
  coucheBatiments: null,
  coucheInjecteurs: null,
  selection: null,
  controleLegende: null,
  mode: "contenance",        // "contenance" | "zonage"

  init() {
    CARTE.map = L.map("carte", { preferCanvas: true }).setView([46.6, 2.4], 6);
    L.tileLayer(CONFIG.fond.url, {
      attribution: CONFIG.fond.attribution,
      maxZoom: CONFIG.fond.maxZoom,
    }).addTo(CARTE.map);

    CARTE.coucheBatiments = L.geoJSON(null, {
      style: { color: "#1E4260", weight: 0.5, fillColor: "#1E4260", fillOpacity: 0.18 },
      interactive: false,
    }).addTo(CARTE.map);

    CARTE.coucheParcelles = L.geoJSON(null).addTo(CARTE.map);
    CARTE.coucheInjecteurs = L.layerGroup().addTo(CARTE.map);

    CARTE.legende();
  },

  couleurParcelle(p) {
    if (CARTE.mode === "zonage") {
      return CONFIG.zonage.couleurs[p.typeZone] || CONFIG.zonage.defaut;
    }
    let c = CONFIG.classesContenance[0].couleur;
    for (const cl of CONFIG.classesContenance) if (p.contenance >= cl.min) c = cl.couleur;
    return c;
  },

  /* ---- Parcelles filtrées ------------------------------------------------- */
  dessinerParcelles(parcelles, onClic) {
    CARTE.coucheParcelles.clearLayers();
    if (parcelles.length > CONFIG.rendu.maxPolygones) return false;

    CARTE.coucheParcelles.addData({
      type: "FeatureCollection",
      features: parcelles.map(p => ({
        type: "Feature", geometry: p.geometry, properties: { id: p.id },
      })),
    });
    CARTE.coucheParcelles.setStyle(f => {
      const p = APP.index.get(f.properties.id);
      return {
        color: "#ffffff", weight: 1, opacity: 0.9,
        fillColor: CARTE.couleurParcelle(p), fillOpacity: 0.65,
      };
    });
    CARTE.coucheParcelles.eachLayer(l => {
      l.on("click", () => onClic(APP.index.get(l.feature.properties.id)));
      l.on("mouseover", () => l.setStyle({ weight: 3, color: CONFIG.palette.encre }));
      l.on("mouseout",  () => l.setStyle({ weight: 1, color: "#ffffff" }));
    });
    return true;
  },

  dessinerBatiments(fc) {
    CARTE.coucheBatiments.clearLayers();
    if (fc && fc.features.length && fc.features.length < 20000) CARTE.coucheBatiments.addData(fc);
  },

  dessinerInjecteurs(injecteurs) {
    CARTE.coucheInjecteurs.clearLayers();
    for (const i of injecteurs) {
      L.circleMarker([i.lonlat[1], i.lonlat[0]], {
        radius: Math.max(5, Math.min(14, Math.sqrt(i.capacite || 1) * 1.6)),
        color: "#ffffff", weight: 1.5,
        fillColor: i.ouvert ? CONFIG.palette.sauge : "#9aa5b1",
        fillOpacity: 0.95,
      })
      .bindPopup(
        `<strong>${i.nom || "—"}</strong><br>${i.commune || ""} — ${i.type || ""}<br>` +
        `${i.capacite ? i.capacite.toFixed(1) + " GWh/an" : "capacité n.c."} · MES ${i.annee || "?"}<br>` +
        `<em>${i.reseau || ""}</em>`)
      .addTo(CARTE.coucheInjecteurs);
    }
  },

  /* ---- Sélection / zoom --------------------------------------------------- */
  selectionner(parcelle) {
    if (CARTE.selection) CARTE.map.removeLayer(CARTE.selection);
    CARTE.selection = L.geoJSON(parcelle.geometry, {
      style: { color: CONFIG.palette.terracotta, weight: 4, fillOpacity: 0.1 },
    }).addTo(CARTE.map);
    CARTE.map.fitBounds(CARTE.selection.getBounds(), { maxZoom: 18, padding: [40, 40] });
  },

  cadrerCommune(commune) {
    if (commune.contour) {
      CARTE.map.fitBounds(L.geoJSON(commune.contour).getBounds(), { padding: [20, 20] });
    } else if (commune.centre) {
      CARTE.map.setView([commune.centre.coordinates[1], commune.centre.coordinates[0]], 13);
    }
  },

  legende() {
    if (CARTE.controleLegende) CARTE.map.removeControl(CARTE.controleLegende);
    const l = L.control({ position: "bottomright" });
    l.onAdd = () => {
      const d = L.DomUtil.create("div", "legende");
      const corps = CARTE.mode === "zonage"
        ? "<strong>Zonage PLU</strong>" +
          Object.entries(CONFIG.zonage.couleurs).map(([k, c]) =>
            `<span><i style="background:${c}"></i>${k} — ${CONFIG.zonage.libelles[k]}</span>`).join("") +
          `<span><i style="background:${CONFIG.zonage.defaut}"></i>hors PLU / non couvert</span>`
        : "<strong>Contenance cadastrale</strong>" +
          CONFIG.classesContenance.map(c =>
            `<span><i style="background:${c.couleur}"></i>${c.label}</span>`).join("");
      d.innerHTML = corps +
        `<strong style="margin-top:6px">Injection biométhane</strong>` +
        `<span><i style="background:${CONFIG.palette.sauge};border-radius:50%"></i>site en service</span>`;
      return d;
    };
    l.addTo(CARTE.map);
    CARTE.controleLegende = l;
  },
};
