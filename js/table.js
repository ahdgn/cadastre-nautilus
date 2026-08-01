/* =============================================================================
   Tableau triable + export CSV.
   ========================================================================== */

const TABLE = {

  colonnes: [
    { cle: "id",            titre: "Parcelle",        fmt: v => v },
    { cle: "section",       titre: "Section",         fmt: v => v },
    { cle: "numero",        titre: "N°",              fmt: v => v },
    { cle: "contenance",    titre: "Contenance (ha)", fmt: v => (v / 10000).toFixed(2), num: true },
    { cle: "nbBatiments",   titre: "Bâti",            fmt: v => v, num: true },
    { cle: "zonePLU",       titre: "Zone PLU",        fmt: v => v || "—" },
    { cle: "distInjecteur", titre: "Injecteur (km)",  fmt: v => (v == null ? "—" : v.toFixed(1)), num: true },
    { cle: "nomInjecteur",  titre: "Injecteur le plus proche", fmt: v => v || "—" },
  ],

  tri: { cle: "contenance", desc: true },
  lignes: [],

  rendre(parcelles, onClic) {
    TABLE.lignes = parcelles;
    const { cle, desc } = TABLE.tri;
    const s = [...parcelles].sort((a, b) => {
      const va = a[cle], vb = b[cle];
      if (va == null) return 1;
      if (vb == null) return -1;
      const c = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb));
      return desc ? -c : c;
    });

    const head = TABLE.colonnes.map(c =>
      `<th data-cle="${c.cle}" class="${cle === c.cle ? (desc ? "tri-desc" : "tri-asc") : ""}">${c.titre}</th>`
    ).join("");

    const affichees = s.slice(0, CONFIG.rendu.maxLignesTable);
    const body = affichees.map(p =>
      `<tr data-id="${p.id}">` +
      TABLE.colonnes.map(c => `<td class="${c.num ? "num" : ""}">${c.fmt(p[c.cle])}</td>`).join("") +
      `</tr>`).join("");

    document.getElementById("tableau").innerHTML =
      `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;

    document.getElementById("table-info").textContent =
      s.length > affichees.length
        ? `${affichees.length} lignes affichées sur ${s.length} (export CSV = tout)`
        : `${s.length} ligne(s)`;

    document.querySelectorAll("#tableau th").forEach(th => th.onclick = () => {
      const k = th.dataset.cle;
      TABLE.tri = { cle: k, desc: TABLE.tri.cle === k ? !TABLE.tri.desc : true };
      TABLE.rendre(TABLE.lignes, onClic);
    });
    document.querySelectorAll("#tableau tbody tr").forEach(tr => tr.onclick = () => {
      onClic(APP.index.get(tr.dataset.id));
    });
  },

  csv() {
    const cols = [...TABLE.colonnes, { cle: "lon", titre: "lon" }, { cle: "lat", titre: "lat" }];
    const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lignes = [cols.map(c => esc(c.titre)).join(";")];
    for (const p of TABLE.lignes) {
      lignes.push(cols.map(c => {
        const v = c.cle === "lon" ? p.centre[0] : c.cle === "lat" ? p.centre[1] : p[c.cle];
        return esc(typeof v === "number" ? String(v).replace(".", ",") : v);
      }).join(";"));
    }
    const blob = new Blob(["﻿" + lignes.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `nautilus-parcelles-${FILTRES.etat.insee || "export"}.csv`;
    a.click();
  },
};
