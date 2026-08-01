/* ============================================
   Map — Leaflet
   Couleur des parcelles = contenance ou zonage PLU
   Légende dynamique, repliable
   ============================================ */

const MapView = (() => {
  const { TUILES, CLASSES_CONTENANCE, ZONAGE, PALETTE, RENDU,
          fmtNum, fmtHa, escapeHtml, couleurContenance, couleurZone } = CONFIG;

  const FRANCE_BOUNDS = L.latLngBounds([41.2, -5.5], [51.3, 9.8]);

  let map, coucheParcelles, coucheBatiments, coucheInjecteurs, selection, legendDiv;
  let mode = 'contenance';                 // 'contenance' | 'zonage'
  let legendCollapsed = window.matchMedia('(max-width: 860px)').matches;
  let onSelect = () => {};

  function init(selectionCallback) {
    onSelect = selectionCallback;

    map = L.map('map', {
      center: FRANCE_BOUNDS.getCenter(), zoom: 6, minZoom: 4,
      zoomControl: true, zoomSnap: 0.25, preferCanvas: true,
    });

    L.tileLayer(TUILES.url, {
      attribution: TUILES.attribution,
      subdomains: TUILES.subdomains,
      maxZoom: TUILES.maxZoom,
    }).addTo(map);

    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

    coucheBatiments = L.geoJSON(null, {
      style: { color: PALETTE.navy, weight: 0.5, fillColor: PALETTE.navy, fillOpacity: 0.16 },
      interactive: false,
    }).addTo(map);
    coucheParcelles = L.geoJSON(null).addTo(map);
    coucheInjecteurs = L.layerGroup().addTo(map);

    // Événements posés une seule fois sur le groupe, pas sur chaque parcelle :
    // une commune peut en compter 40 000, et autant d'écouteurs (ou de popups
    // construits d'avance) fige le navigateur au rendu.
    coucheParcelles.on('click', e => onSelect(e.layer.feature.properties.id));
    coucheParcelles.on('mouseover', e => e.layer.setStyle({ weight: 3, color: PALETTE.navy }));
    coucheParcelles.on('mouseout', e => e.layer.setStyle({ weight: 1, color: '#ffffff' }));
    coucheParcelles.bindPopup(l => popup(App.parcelle(l.feature.properties.id)));

    creerLegende();
    majLegende();
  }

  /* ---- Mode de coloration ------------------------------------------------ */
  function setMode(m) {
    mode = m;
    coucheParcelles.setStyle(style);
    majLegende();
  }
  const getMode = () => mode;

  function style(f) {
    const p = App.parcelle(f.properties.id);
    return {
      color: '#ffffff', weight: 1, opacity: 0.9, fillOpacity: 0.68,
      fillColor: mode === 'zonage' ? couleurZone(p.typeZone) : couleurContenance(p.contenance),
    };
  }

  /* ---- Couches ----------------------------------------------------------- */
  /* Retourne le nombre de parcelles réellement dessinées. Au-delà du plafond on
     dessine les plus grandes plutôt que rien : l'utilisateur voit toujours
     quelque chose, et l'app annonce la troncature. */
  function dessinerParcelles(parcelles) {
    coucheParcelles.clearLayers();
    if (parcelles.length === 0) return 0;

    const affichees = parcelles.length <= RENDU.maxPolygones
      ? parcelles
      : [...parcelles].sort((a, b) => b.contenance - a.contenance).slice(0, RENDU.maxPolygones);

    coucheParcelles.addData({
      type: 'FeatureCollection',
      features: affichees.map(p => ({ type: 'Feature', geometry: p.geometry, properties: { id: p.id } })),
    });
    coucheParcelles.setStyle(style);
    return affichees.length;
  }

  function dessinerBatiments(fc) {
    coucheBatiments.clearLayers();
    if (fc && fc.features.length && fc.features.length < 20000) coucheBatiments.addData(fc);
  }

  function dessinerInjecteurs(injecteurs) {
    coucheInjecteurs.clearLayers();
    injecteurs.forEach(i => {
      L.circleMarker([i.lonlat[1], i.lonlat[0]], {
        radius: Math.max(5, Math.min(14, Math.sqrt(i.capacite || 1) * 1.6)),
        color: '#ffffff', weight: 1.5,
        fillColor: i.ouvert ? PALETTE.sage : '#9aa5b1', fillOpacity: 0.95,
      }).bindPopup(popupInjecteur(i)).addTo(coucheInjecteurs);
    });
  }

  function toggleCouche(nom, visible) {
    const c = nom === 'batiments' ? coucheBatiments : coucheInjecteurs;
    visible ? map.addLayer(c) : map.removeLayer(c);
  }

  /* ---- Popups ------------------------------------------------------------ */
  function popup(p) {
    const rows = [
      ['Contenance', `${fmtHa(p.contenance)} ha`],
      ['Bâtiments', fmtNum(p.nbBatiments)],
      ['Site de réf.', p.distInjecteur == null ? '> 150 km' : `${fmtNum(p.distInjecteur, 1)} km`],
    ];
    if (p.zonePLU) rows.push(['Zone PLU', p.zonePLU]);
    return `
      <div class="popup-title">${escapeHtml(p.id)}</div>
      <div class="popup-sub">${escapeHtml(`Section ${p.section} n° ${p.numero}`)}</div>
      <dl class="popup-grid">
        ${rows.map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(String(v))}</dd>`).join('')}
      </dl>
      <div class="popup-foot">
        <a class="popup-link" href="${CONFIG.LIENS.gpu(p.centre[0].toFixed(6), p.centre[1].toFixed(6))}"
           target="_blank" rel="noopener noreferrer">Géoportail urbanisme ↗</a>
      </div>`;
  }

  function popupInjecteur(i) {
    return `
      <div class="popup-title">${escapeHtml(i.nom || '—')}</div>
      <div class="popup-sub">${escapeHtml([i.commune, i.departement].filter(Boolean).join(' · '))}</div>
      <dl class="popup-grid">
        <dt>Type</dt><dd>${escapeHtml(i.type || '—')}</dd>
        <dt>Capacité</dt><dd>${i.capacite != null ? fmtNum(i.capacite, 1) + ' GWh/an' : '—'}</dd>
        <dt>Mise en service</dt><dd>${i.annee || '—'}</dd>
        <dt>Réseau</dt><dd>${escapeHtml(i.reseau || '—')}</dd>
      </dl>
      <div class="popup-foot">
        <span class="status-tag ${i.ouvert ? 'open' : 'closed'}">${i.ouvert ? 'En service' : 'Fermé'}</span>
      </div>`;
  }

  /* ---- Sélection / cadrage ----------------------------------------------- */
  function selectionner(p, zoom = true) {
    if (selection) map.removeLayer(selection);
    selection = L.geoJSON(p.geometry, {
      style: { color: PALETTE.terracotta, weight: 4, fillOpacity: 0.08 },
    }).addTo(map);
    if (zoom) map.fitBounds(selection.getBounds(), { maxZoom: 18, padding: [40, 40] });
  }

  function cadrerCommune(commune) {
    if (commune.contour) map.fitBounds(L.geoJSON(commune.contour).getBounds(), { padding: [16, 16] });
    else if (commune.centre) map.setView([commune.centre.coordinates[1], commune.centre.coordinates[0]], 13);
  }

  /* ---- Légende ----------------------------------------------------------- */
  function creerLegende() {
    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = () => {
      legendDiv = L.DomUtil.create('div', 'map-legend');
      L.DomEvent.disableClickPropagation(legendDiv);
      L.DomEvent.disableScrollPropagation(legendDiv);
      return legendDiv;
    };
    legend.addTo(map);
  }

  function majLegende() {
    if (!legendDiv) return;
    const items = mode === 'zonage'
      ? Object.entries(ZONAGE.couleurs).map(([k, c]) =>
          [c, `${k} — ${ZONAGE.libelles[k]}`])
        .concat([[ZONAGE.defaut, 'hors PLU / non couvert']])
      : CLASSES_CONTENANCE.map(c => [c.couleur, c.label]);

    legendDiv.className = 'map-legend' + (legendCollapsed ? ' collapsed' : '');
    legendDiv.innerHTML = `
      <button class="map-legend-toggle" aria-expanded="${!legendCollapsed}"
              aria-label="Afficher ou masquer la légende">
        <span class="map-legend-title">${mode === 'zonage' ? 'Zonage PLU' : 'Contenance cadastrale'}</span>
        <span class="chevron" aria-hidden="true">▼</span>
      </button>
      <div class="map-legend-body">
        ${items.map(([couleur, label]) => `
          <div class="legend-item">
            <span class="type-dot square" style="background:${couleur}"></span>
            <span class="type-name">${escapeHtml(label)}</span>
          </div>`).join('')}
        <div class="legend-item">
          <span class="type-dot" style="background:${PALETTE.sage}"></span>
          <span class="type-name">Site de référence</span>
        </div>
        <p class="legend-note">Zonage indicatif — seul le document approuvé fait foi.</p>
      </div>`;

    legendDiv.querySelector('.map-legend-toggle').addEventListener('click', () => {
      legendCollapsed = !legendCollapsed;
      majLegende();
    });
  }

  const invalidate = () => map && map.invalidateSize();

  return { init, setMode, getMode, dessinerParcelles, dessinerBatiments, dessinerInjecteurs,
           toggleCouche, selectionner, cadrerCommune, invalidate };
})();
