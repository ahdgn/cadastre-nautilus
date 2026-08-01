/* ============================================
   App — orchestration
   recherche commune → PCI Vecteur → enrichissement
   → filtres → carte, KPI, tableau, panneau parcelle
   ============================================ */

const App = (() => {
  const { fmtNum, fmtHa, escapeHtml, LIENS } = CONFIG;

  let commune = null;
  let parcelles = [];
  const index = new Map();
  let injecteurs = [];
  let injecteursProches = [];
  let zones = [];
  let selectionId = null;

  const el = id => document.getElementById(id);

  /* ---- Démarrage ---------------------------------------------------------- */
  async function init() {
    MapView.init(selectionner);
    DataTable.init(selectionner);
    Filters.init(rafraichir);
    brancherUI();

    Filters.depuisURL();
    Filters.versControles();

    try {
      injecteurs = await API.chargerInjecteurs();
      MapView.dessinerInjecteurs(injecteurs);
      meta(`${fmtNum(injecteurs.length)} points d'injection biométhane`);
    } catch (e) {
      meta('Injecteurs indisponibles');
      console.error(e);
    }

    if (Filters.etat.insee) {
      const [c] = await API.chercherCommunes(Filters.etat.insee);
      if (c) await chargerCommune(c);
    }
  }

  /* ---- Interface ---------------------------------------------------------- */
  function brancherUI() {
    // sidebar
    el('sidebar-toggle').addEventListener('click', () => {
      const s = el('sidebar');
      const ouvert = !s.classList.toggle('collapsed');
      el('sidebar-toggle').setAttribute('aria-expanded', String(ouvert));
      setTimeout(() => MapView.invalidate && MapView.invalidate(), 200);
    });

    // onglets
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b =>
          b.setAttribute('aria-selected', String(b === btn)));
        document.querySelectorAll('.tab-content').forEach(c =>
          c.hidden = c.id !== `tab-${btn.dataset.tab}`);
      });
    });

    // recherche de commune
    const champ = el('filter-commune');
    let t = null;
    champ.addEventListener('input', () => {
      clearTimeout(t);
      const q = champ.value.trim();
      if (q.length < 2) return masquerSuggestions();
      t = setTimeout(() => suggerer(q), 250);
    });
    champ.addEventListener('blur', () => setTimeout(masquerSuggestions, 150));

    // zonage PLU
    el('btn-zonage').addEventListener('click', chargerZonage);

    // couches et coloration
    el('layer-batiments').addEventListener('change', e => MapView.toggleCouche('batiments', e.target.checked));
    el('layer-injecteurs').addEventListener('change', e => MapView.toggleCouche('injecteurs', e.target.checked));
    document.querySelectorAll('#color-mode .seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#color-mode .seg-btn').forEach(b =>
          b.setAttribute('aria-pressed', String(b === btn)));
        MapView.setMode(btn.dataset.mode);
      });
    });
  }

  async function suggerer(q) {
    try {
      const communes = await API.chercherCommunes(q);
      const ul = el('suggestions');
      ul.innerHTML = communes.map((c, i) =>
        `<li data-i="${i}">${escapeHtml(c.nom)}<span>${c.code} · ${fmtNum(c.population)} hab.</span></li>`).join('');
      ul.hidden = communes.length === 0;
      ul.querySelectorAll('li').forEach(li => li.addEventListener('mousedown', () => {
        const c = communes[li.dataset.i];
        el('filter-commune').value = c.nom;
        masquerSuggestions();
        chargerCommune(c);
      }));
    } catch (e) {
      console.error(e);
    }
  }

  const masquerSuggestions = () => { el('suggestions').hidden = true; };

  function chargement(visible, texte) {
    el('loading-overlay').hidden = !visible;
    if (texte) el('loading-text').textContent = texte;
  }

  const meta = (txt) => { el('header-meta').textContent = txt; };

  /* ---- Chargement d'une commune ------------------------------------------- */
  async function chargerCommune(c) {
    commune = c;
    zones = [];
    selectionId = null;
    Filters.etat.insee = c.code;
    el('filter-zone').disabled = true;
    el('filter-zone').value = '';
    Filters.etat.typeZone = '';
    el('btn-zonage').disabled = false;
    MapView.setMode('contenance');
    document.querySelectorAll('#color-mode .seg-btn').forEach(b =>
      b.setAttribute('aria-pressed', String(b.dataset.mode === 'contenance')));

    chargement(true, `Chargement du cadastre de ${c.nom}…`);
    MapView.cadrerCommune(c);

    try {
      const [pFC, bFC] = await Promise.all([
        API.chargerCouche(c, 'parcelles'),
        API.chargerCouche(c, 'batiments'),
      ]);
      chargement(true, `Enrichissement de ${fmtNum(pFC.features.length)} parcelles…`);
      await new Promise(r => setTimeout(r, 0));
      enrichir(pFC, bFC);
      MapView.dessinerBatiments(bFC);
      el('parcel-pane').innerHTML =
        '<p class="parcel-empty">Sélectionnez une parcelle sur la carte ou dans le tableau.</p>';
      rafraichir();
      meta(`${escapeHtml(c.nom)} (${c.code}) · ${fmtNum(parcelles.length)} parcelles · PCI Vecteur`);
    } catch (e) {
      meta('Échec du chargement');
      el('map-empty-text').textContent = `Chargement impossible : ${e.message}`;
      el('map-empty').hidden = false;
      console.error(e);
    } finally {
      chargement(false);
    }
  }

  /* ---- Enrichissement -----------------------------------------------------
     centroïde, bâtiments cadastrés sur la parcelle, distance à l'injecteur le
     plus proche. Le bâti est indexé dans une grille pour éviter le O(n×m).    */
  function enrichir(parcellesFC, batimentsFC) {
    const PAS = 0.002;                                   // ≈ 150–220 m
    const cle = (x, y) => `${Math.floor(x / PAS)}|${Math.floor(y / PAS)}`;
    const grille = new Map();
    for (const b of batimentsFC.features) {
      const c = GEO.centroide(b.geometry);
      if (!c) continue;
      const k = cle(c[0], c[1]);
      if (!grille.has(k)) grille.set(k, []);
      grille.get(k).push(c);
    }

    const centreCommune = commune.centre
      ? commune.centre.coordinates
      : GEO.centroide(parcellesFC.features[0]?.geometry);
    injecteursProches = injecteurs.filter(i => GEO.distanceKm(centreCommune, i.lonlat) < 150);

    parcelles = [];
    index.clear();

    for (const f of parcellesFC.features) {
      const pr = f.properties;
      const centre = GEO.centroide(f.geometry);
      if (!centre) continue;

      const bb = GEO.bbox(f.geometry);
      let nb = 0;
      for (let gx = Math.floor(bb[0] / PAS); gx <= Math.floor(bb[2] / PAS); gx++) {
        for (let gy = Math.floor(bb[1] / PAS); gy <= Math.floor(bb[3] / PAS); gy++) {
          for (const c of grille.get(`${gx}|${gy}`) || []) {
            if (c[0] >= bb[0] && c[0] <= bb[2] && c[1] >= bb[1] && c[1] <= bb[3] &&
                GEO.pointDans(c, f.geometry)) nb++;
          }
        }
      }

      let dist = null, nomInj = null;
      for (const i of injecteursProches) {
        const d = GEO.distanceKm(centre, i.lonlat);
        if (dist == null || d < dist) { dist = d; nomInj = i.nom; }
      }

      const p = {
        id: pr.id, commune: pr.commune, prefixe: pr.prefixe,
        section: pr.section, numero: pr.numero,
        contenance: pr.contenance ?? 0, arpente: pr.arpente,
        created: pr.created, updated: pr.updated,
        centre, geometry: f.geometry,
        nbBatiments: nb, distInjecteur: dist, nomInjecteur: nomInj,
        zonePLU: null, typeZone: null, zoneLibLong: null, zoneUrlPlan: null,
      };
      parcelles.push(p);
      index.set(p.id, p);
    }
  }

  /* ---- Zonage PLU ---------------------------------------------------------- */
  async function chargerZonage() {
    if (!parcelles.length) return;
    el('btn-zonage').disabled = true;
    chargement(true, "Interrogation du Géoportail de l'urbanisme…");
    try {
      let bb = [180, 90, -180, -90];
      for (const p of parcelles) {
        const b = GEO.bbox(p.geometry);
        bb = [Math.min(bb[0], b[0]), Math.min(bb[1], b[1]),
              Math.max(bb[2], b[2]), Math.max(bb[3], b[3])];
      }
      zones = await API.zonageEmprise(bb);

      let affectees = 0;
      for (const p of parcelles) {
        for (const z of zones) {
          if (p.centre[0] < z.bbox[0] || p.centre[0] > z.bbox[2] ||
              p.centre[1] < z.bbox[1] || p.centre[1] > z.bbox[3]) continue;
          if (GEO.pointDans(p.centre, z.geometry)) {
            p.zonePLU = z.libelle; p.typeZone = z.typezone;
            p.zoneLibLong = z.libelong; p.zoneUrlPlan = z.urlPlan;
            affectees++;
            break;
          }
        }
      }

      if (zones.length === 0) {
        meta('Aucun zonage — commune au RNU, document non numérisé ou non versé au GPU');
      } else {
        el('filter-zone').disabled = false;
        document.querySelectorAll('#color-mode .seg-btn').forEach(b =>
          b.setAttribute('aria-pressed', String(b.dataset.mode === 'zonage')));
        MapView.setMode('zonage');
        meta(`${escapeHtml(commune.nom)} (${commune.code}) · ${fmtNum(zones.length)} zones PLU · ` +
             `${fmtNum(affectees)}/${fmtNum(parcelles.length)} parcelles rattachées`);
      }
      rafraichir();
      if (selectionId) afficherParcelle(index.get(selectionId));
    } catch (e) {
      meta('Zonage indisponible : ' + e.message);
      console.error(e);
    } finally {
      el('btn-zonage').disabled = false;
      chargement(false);
    }
  }

  /* ---- Rendu --------------------------------------------------------------- */
  function rafraichir() {
    const sel = Filters.filtrer(parcelles);
    const affiche = MapView.dessinerParcelles(sel);

    el('map-empty').hidden = !(parcelles.length === 0 || sel.length === 0 || !affiche);
    el('map-empty-reset').hidden = parcelles.length === 0;
    el('map-empty-text').textContent =
      parcelles.length === 0 ? 'Recherchez une commune pour charger son cadastre.'
      : sel.length === 0 ? 'Aucune parcelle ne correspond aux filtres.'
      : `${fmtNum(sel.length)} parcelles : trop nombreuses pour la carte. ` +
        `Resserrez les filtres — le tableau et l'export restent complets.`;

    majKPI(sel);
    DataTable.update(sel);
  }

  function majKPI(sel) {
    const surface = sel.reduce((s, p) => s + p.contenance, 0);
    const max = sel.reduce((m, p) => (p.contenance > (m?.contenance ?? 0) ? p : m), null);
    const nues = sel.filter(p => p.nbBatiments === 0).length;
    const cartes = [
      ['Parcelles retenues', fmtNum(sel.length), `sur ${fmtNum(parcelles.length)}`, true],
      ['Surface cumulée', fmtHa(surface, 1), 'ha'],
      ['Plus grande', max ? fmtHa(max.contenance) : '—', 'ha'],
      ['Parcelles nues', fmtNum(nues), 'sans bâti cadastré'],
    ];
    el('kpi-strip').innerHTML = cartes.map(([label, valeur, sub, accent]) => `
      <div class="kpi-card${accent ? ' kpi-accent' : ''}">
        <div class="kpi-label">${label}</div>
        <div class="kpi-value">${valeur}<span class="kpi-sub">${sub}</span></div>
      </div>`).join('');
  }

  /* ---- Sélection d'une parcelle -------------------------------------------- */
  function selectionner(id) {
    const p = index.get(id);
    if (!p) return;
    selectionId = id;
    MapView.selectionner(p, false);
    DataTable.highlight(id);
    afficherParcelle(p);
    document.querySelector('.tab-btn[data-tab="parcelle"]').click();
  }

  function afficherParcelle(p) {
    const lon = p.centre[0].toFixed(6), lat = p.centre[1].toFixed(6);
    el('parcel-pane').innerHTML = `
      <div class="parcel-head">
        <h3>${escapeHtml(p.id)}</h3>
        <span class="parcel-sub">Section ${escapeHtml(p.section)} · n° ${escapeHtml(p.numero)} ·
          commune ${escapeHtml(p.commune)}</span>
        ${p.zonePLU ? `<span class="zone-tag">${escapeHtml(p.zonePLU)}${
          p.typeZone && p.typeZone !== p.zonePLU ? ' — ' + escapeHtml(p.typeZone) : ''}</span>` : ''}
      </div>

      <div class="parcel-grid">
        <dl>
          <dt>Contenance</dt><dd>${fmtHa(p.contenance)} ha</dd>
          <dt>soit</dt><dd>${fmtNum(p.contenance)} m²</dd>
          <dt>Bâtiments cadastrés</dt><dd>${fmtNum(p.nbBatiments)}</dd>
          <dt>Arpentée</dt><dd>${p.arpente ? 'oui' : 'non'}</dd>
        </dl>
        <dl>
          <dt>Injecteur le plus proche</dt>
          <dd>${p.distInjecteur == null ? '> 150 km' : fmtNum(p.distInjecteur, 1) + ' km'}</dd>
          <dt>Site</dt><dd>${escapeHtml(p.nomInjecteur || '—')}</dd>
          <dt>MAJ cadastre</dt><dd>${escapeHtml(p.updated || '—')}</dd>
          <dt>Centroïde</dt><dd>${lat}, ${lon}</dd>
        </dl>
      </div>

      ${p.zonePLU ? `
        <ul class="plu-list">
          <li><strong>${escapeHtml(p.zonePLU)}</strong>${p.zoneLibLong ? ' — ' + escapeHtml(p.zoneLibLong) : ''}
            ${p.typeZone && p.typeZone !== p.zonePLU ? `<span class="zone-tag">${escapeHtml(p.typeZone)}</span>` : ''}
            ${p.zoneUrlPlan ? `<a href="${escapeHtml(p.zoneUrlPlan)}" target="_blank" rel="noopener noreferrer">règlement ↗</a>` : ''}
          </li>
        </ul>` : ''}

      <div class="parcel-links">
        <a href="${LIENS.geoportail(lon, lat)}" target="_blank" rel="noopener noreferrer">Géoportail ↗</a>
        <a href="${LIENS.gpu(lon, lat)}" target="_blank" rel="noopener noreferrer">Géoportail de l'urbanisme ↗</a>
        <a href="${LIENS.georisques(lon, lat)}" target="_blank" rel="noopener noreferrer">Géorisques ↗</a>
        <a href="${LIENS.googleMaps(lon, lat)}" target="_blank" rel="noopener noreferrer">Google Maps ↗</a>
      </div>

      <p class="caveat">
        Le cadastre ne porte pas la propriété : le PCI Vecteur donne la géométrie et la contenance,
        pas le propriétaire. Le zonage du GPU est indicatif — seul le document approuvé en mairie
        fait foi, et la parcelle est rattachée à la zone de son centroïde.
      </p>`;
  }

  return { init, parcelle: id => index.get(id) };
})();

document.addEventListener('DOMContentLoaded', App.init);
