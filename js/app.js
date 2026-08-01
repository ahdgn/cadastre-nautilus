/* =============================================================================
   Orchestration : recherche commune → chargement PCI → enrichissement → rendu.
   ========================================================================== */

const APP = {

  commune: null,
  parcelles: [],          // parcelles enrichies de la commune courante
  index: new Map(),       // id parcelle -> objet
  injecteurs: [],
  injecteursProches: [],  // sous-ensemble pertinent pour la commune courante
  zones: [],              // zonage PLU de la commune (API Carto GPU)

  /* ---- Démarrage ---------------------------------------------------------- */
  async init() {
    CARTE.init();
    APP.brancherUI();
    FILTRES.depuisURL();
    APP.filtresVersUI();

    try {
      APP.injecteurs = await API.chargerInjecteurs();
      CARTE.dessinerInjecteurs(APP.injecteurs);
      APP.statut(`${APP.injecteurs.length} points d'injection biométhane chargés (ODRÉ).`);
    } catch (e) {
      APP.statut("Injecteurs indisponibles : " + e.message, true);
    }

    if (FILTRES.etat.insee) {
      const [c] = await API.chercherCommunes(FILTRES.etat.insee);
      if (c) APP.chargerCommune(c);
    }
  },

  /* ---- Interface ---------------------------------------------------------- */
  brancherUI() {
    const champ = document.getElementById("recherche");
    let t = null;
    champ.addEventListener("input", () => {
      clearTimeout(t);
      const q = champ.value.trim();
      if (q.length < 2) return (document.getElementById("suggestions").innerHTML = "");
      t = setTimeout(async () => {
        try {
          const communes = await API.chercherCommunes(q);
          document.getElementById("suggestions").innerHTML = communes.map((c, i) =>
            `<li data-i="${i}">${c.nom} <span>${c.code} · ${c.population?.toLocaleString("fr-FR") ?? "?"} hab.</span></li>`
          ).join("");
          document.querySelectorAll("#suggestions li").forEach(li => li.onclick = () => {
            document.getElementById("suggestions").innerHTML = "";
            champ.value = communes[li.dataset.i].nom;
            APP.chargerCommune(communes[li.dataset.i]);
          });
        } catch (e) { APP.statut(e.message, true); }
      }, 250);
    });

    document.getElementById("btn-zonage").onclick = APP.chargerZonage;
    document.getElementById("mode-couleur").onchange = (e) => {
      CARTE.mode = e.target.value;
      CARTE.legende();
      APP.rafraichir();
    };

    for (const id of ["f-min", "f-max", "f-dinj", "f-section", "f-nue", "f-zone"]) {
      document.getElementById(id).addEventListener("change", () => {
        APP.uiVersFiltres();
        APP.rafraichir();
      });
    }
    document.getElementById("btn-csv").onclick = () => TABLE.csv();
    document.getElementById("btn-reset").onclick = () => {
      Object.assign(FILTRES.etat, CONFIG.filtresDefaut);
      APP.filtresVersUI(); APP.rafraichir();
    };
    document.getElementById("t-batiments").onchange = (e) => {
      e.target.checked ? CARTE.map.addLayer(CARTE.coucheBatiments)
                       : CARTE.map.removeLayer(CARTE.coucheBatiments);
    };
    document.getElementById("t-injecteurs").onchange = (e) => {
      e.target.checked ? CARTE.map.addLayer(CARTE.coucheInjecteurs)
                       : CARTE.map.removeLayer(CARTE.coucheInjecteurs);
    };
  },

  filtresVersUI() {
    const e = FILTRES.etat;
    document.getElementById("f-min").value = e.contenanceMin ?? "";
    document.getElementById("f-max").value = e.contenanceMax ?? "";
    document.getElementById("f-dinj").value = e.distanceInjecteurMax ?? "";
    document.getElementById("f-section").value = e.section ?? "";
    document.getElementById("f-zone").value = e.typeZone ?? "";
    document.getElementById("f-nue").checked = !!e.parcelleNue;
  },

  uiVersFiltres() {
    const n = id => {
      const v = document.getElementById(id).value.trim();
      return v === "" ? null : Number(v);
    };
    Object.assign(FILTRES.etat, {
      contenanceMin: n("f-min"),
      contenanceMax: n("f-max"),
      distanceInjecteurMax: n("f-dinj"),
      section: document.getElementById("f-section").value.trim(),
      typeZone: document.getElementById("f-zone").value,
      parcelleNue: document.getElementById("f-nue").checked,
    });
  },

  /* ---- Zonage PLU de la commune (une seule requête API Carto) --------------
     L'API refuse le contour communal détaillé (URL trop longue) : on interroge
     sur la bbox, puis on affecte chaque parcelle par point-dans-polygone.      */
  async chargerZonage() {
    if (!APP.commune || !APP.parcelles.length) {
      return APP.statut("Chargez d'abord une commune.", true);
    }
    const btn = document.getElementById("btn-zonage");
    btn.disabled = true;
    APP.statut("Interrogation du Géoportail de l'urbanisme (API Carto GPU)…");
    try {
      let bb = [180, 90, -180, -90];
      for (const p of APP.parcelles) {
        const b = GEO.bbox(p.geometry);
        bb = [Math.min(bb[0], b[0]), Math.min(bb[1], b[1]),
              Math.max(bb[2], b[2]), Math.max(bb[3], b[3])];
      }
      APP.zones = await API.zonageEmprise(bb);

      let affectees = 0;
      for (const p of APP.parcelles) {
        for (const z of APP.zones) {
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
      document.getElementById("mode-couleur").value = "zonage";
      CARTE.mode = "zonage";
      CARTE.legende();
      APP.rafraichir();
      APP.statut(APP.zones.length === 0
        ? `Aucun zonage sur cette emprise : commune au RNU, document non numérisé, ` +
          `ou non versé au Géoportail de l'urbanisme.`
        : `${APP.zones.length} zones PLU récupérées — ${affectees}/${APP.parcelles.length} ` +
          `parcelles rattachées. Zonage indicatif : seul le document approuvé fait foi.`,
        APP.zones.length === 0);
    } catch (e) {
      APP.statut("Zonage indisponible : " + e.message, true);
    } finally {
      btn.disabled = false;
    }
  },

  /* ---- Chargement d'une commune ------------------------------------------- */
  async chargerCommune(commune) {
    APP.commune = commune;
    APP.zones = [];
    CARTE.mode = "contenance";
    document.getElementById("mode-couleur").value = "contenance";
    CARTE.legende();
    FILTRES.etat.insee = commune.code;
    document.getElementById("commune-titre").textContent =
      `${commune.nom} (${commune.code})`;
    APP.statut(`Chargement du PCI Vecteur de ${commune.nom}…`);
    CARTE.cadrerCommune(commune);

    try {
      const [pFC, bFC] = await Promise.all([
        API.chargerCouche(commune, "parcelles"),
        API.chargerCouche(commune, "batiments"),
      ]);
      APP.statut(`Enrichissement de ${pFC.features.length} parcelles…`);
      await new Promise(r => setTimeout(r, 0));   // laisse l'UI respirer
      APP.enrichir(pFC, bFC);
      CARTE.dessinerBatiments(bFC);
      APP.rafraichir();
      APP.statut(
        `${APP.parcelles.length} parcelles — PCI Vecteur, MAJ trimestrielle ` +
        `(source DGFiP, Licence Ouverte).`);
    } catch (e) {
      APP.statut("Échec du chargement : " + e.message, true);
    }
  },

  /* ---- Enrichissement ------------------------------------------------------
     centroïde, nombre de bâtiments cadastrés, distance à l'injecteur le plus
     proche. Le bâti est indexé dans une grille pour éviter le O(n×m).          */
  enrichir(parcellesFC, batimentsFC) {
    const PAS = 0.002;                                  // ≈ 150–220 m
    const cle = (x, y) => `${Math.floor(x / PAS)}|${Math.floor(y / PAS)}`;
    const grille = new Map();
    for (const b of batimentsFC.features) {
      const c = GEO.centroide(b.geometry);
      if (!c) continue;
      const k = cle(c[0], c[1]);
      if (!grille.has(k)) grille.set(k, []);
      grille.get(k).push(c);
    }

    // On ne compare qu'aux injecteurs dans un rayon raisonnable de la commune.
    const centreCommune = APP.commune.centre
      ? APP.commune.centre.coordinates
      : GEO.centroide(parcellesFC.features[0]?.geometry);
    APP.injecteursProches = APP.injecteurs.filter(
      i => GEO.distanceKm(centreCommune, i.lonlat) < 150);

    APP.parcelles = [];
    APP.index.clear();

    for (const f of parcellesFC.features) {
      const pr = f.properties;
      const centre = GEO.centroide(f.geometry);
      if (!centre) continue;

      // bâtiments dont le centroïde tombe dans la parcelle
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
      for (const i of APP.injecteursProches) {
        const d = GEO.distanceKm(centre, i.lonlat);
        if (dist == null || d < dist) { dist = d; nomInj = i.nom; }
      }

      const p = {
        id: pr.id, section: pr.section, numero: pr.numero, prefixe: pr.prefixe,
        contenance: pr.contenance ?? 0, arpente: pr.arpente,
        created: pr.created, updated: pr.updated,
        centre, geometry: f.geometry,
        nbBatiments: nb, distInjecteur: dist, nomInjecteur: nomInj,
      };
      APP.parcelles.push(p);
      APP.index.set(p.id, p);
    }
  },

  /* ---- Rendu -------------------------------------------------------------- */
  rafraichir() {
    FILTRES.versURL();
    const sel = FILTRES.appliquer(APP.parcelles);

    const affiche = CARTE.dessinerParcelles(sel, APP.detail);
    const ha = sel.reduce((s, p) => s + p.contenance, 0) / 10000;
    const plusGrande = sel.reduce((m, p) => (p.contenance > (m?.contenance ?? 0) ? p : m), null);

    document.getElementById("stats").innerHTML = `
      <div><span>${sel.length}</span>parcelles retenues</div>
      <div><span>${ha.toFixed(1)} ha</span>surface cumulée</div>
      <div><span>${plusGrande ? (plusGrande.contenance / 10000).toFixed(2) + " ha" : "—"}</span>plus grande</div>
      <div><span>${sel.filter(p => p.nbBatiments === 0).length}</span>parcelles nues</div>`;

    if (!affiche) {
      APP.statut(`${sel.length} parcelles : trop nombreuses pour la carte ` +
                 `(seuil ${CONFIG.rendu.maxPolygones}). Resserrez les filtres — ` +
                 `le tableau et l'export restent complets.`, true);
    }
    TABLE.rendre(sel, APP.detail);
  },

  /* ---- Panneau de détail --------------------------------------------------- */
  detail(p) {
    if (!p) return;
    CARTE.selectionner(p);
    const [lon, lat] = p.centre.map(v => v.toFixed(6));
    document.getElementById("detail").innerHTML = `
      <h3>${p.id}</h3>
      <dl>
        <dt>Section / n°</dt><dd>${p.prefixe} ${p.section} ${p.numero}</dd>
        <dt>Contenance</dt><dd>${(p.contenance / 10000).toFixed(2)} ha (${p.contenance.toLocaleString("fr-FR")} m²)</dd>
        <dt>Bâtiments cadastrés</dt><dd>${p.nbBatiments}</dd>
        ${p.zonePLU ? `<dt>Zone PLU</dt><dd>${p.zonePLU} <span class="tag">${p.typeZone}</span></dd>` : ""}
        <dt>Injecteur le plus proche</dt><dd>${p.distInjecteur == null ? "> 150 km" :
          p.distInjecteur.toFixed(1) + " km — " + (p.nomInjecteur || "")}</dd>
        <dt>Arpentée</dt><dd>${p.arpente ? "oui" : "non"}</dd>
        <dt>MAJ cadastre</dt><dd>${p.updated || "—"}</dd>
        <dt>Centroïde</dt><dd>${lat}, ${lon}</dd>
      </dl>
      <button id="btn-plu">Interroger le PLU (API Carto GPU)</button>
      <div id="plu"></div>
      <p class="liens">
        <a target="_blank" href="${CONFIG.liens.geoportail(lon, lat)}">Géoportail</a>
        <a target="_blank" href="${CONFIG.liens.gpu(lon, lat)}">Géoportail de l'urbanisme</a>
        <a target="_blank" href="${CONFIG.liens.georisques(lon, lat)}">Géorisques</a>
      </p>`;

    document.getElementById("btn-plu").onclick = async () => {
      const cible = document.getElementById("plu");
      cible.innerHTML = "<em>Interrogation de l'API Carto…</em>";
      try {
        const r = await API.zonagePLU(p.centre);
        cible.innerHTML = r.couvert
          ? `<ul class="plu">${r.zones.map(z =>
              `<li><strong>${z.libelle || "?"}</strong>` +
              (z.libelong ? ` — ${z.libelong}` : "") +
              ` <span class="tag">${z.typezone || ""}</span>` +
              (z.urlPlan ? ` <a href="${z.urlPlan}" target="_blank">règlement</a>` : "") +
              `</li>`).join("")}</ul>
             <p class="avertissement">Le zonage numérique du GPU n'est pas opposable :
             seul le document approuvé en mairie fait foi.</p>`
          : `<p class="avertissement">Aucun zonage trouvé — commune non couverte par le
             GPU, document non numérisé, ou commune au RNU.</p>`;
      } catch (e) {
        cible.innerHTML = `<p class="avertissement">API Carto indisponible : ${e.message}</p>`;
      }
    };
  },

  statut(msg, alerte = false) {
    const el = document.getElementById("statut");
    el.textContent = msg;
    el.className = alerte ? "alerte" : "";
  },
};

document.addEventListener("DOMContentLoaded", APP.init);
