/* =============================================================================
   État des filtres + synchronisation avec le hash de l'URL (partage de vues).
   ========================================================================== */

const FILTRES = {

  etat: { ...CONFIG.filtresDefaut, insee: "" },

  /* ---- Lecture / écriture de l'URL --------------------------------------- */
  depuisURL() {
    const p = new URLSearchParams(location.hash.slice(1));
    const num = (k) => (p.has(k) && p.get(k) !== "" ? Number(p.get(k)) : null);
    if (p.has("insee")) FILTRES.etat.insee = p.get("insee");
    if (p.has("min"))   FILTRES.etat.contenanceMin = num("min");
    if (p.has("max"))   FILTRES.etat.contenanceMax = num("max");
    if (p.has("dinj"))  FILTRES.etat.distanceInjecteurMax = num("dinj");
    if (p.has("sec"))   FILTRES.etat.section = p.get("sec");
    if (p.has("zone"))  FILTRES.etat.typeZone = p.get("zone");
    if (p.has("nue"))   FILTRES.etat.parcelleNue = p.get("nue") === "1";
    return FILTRES.etat;
  },

  versURL() {
    const e = FILTRES.etat, p = new URLSearchParams();
    if (e.insee) p.set("insee", e.insee);
    if (e.contenanceMin != null) p.set("min", e.contenanceMin);
    if (e.contenanceMax != null) p.set("max", e.contenanceMax);
    if (e.distanceInjecteurMax != null) p.set("dinj", e.distanceInjecteurMax);
    if (e.section) p.set("sec", e.section);
    if (e.typeZone) p.set("zone", e.typeZone);
    if (e.parcelleNue) p.set("nue", "1");
    history.replaceState(null, "", "#" + p.toString());
  },

  /* ---- Application ------------------------------------------------------- */
  appliquer(parcelles) {
    const e = FILTRES.etat;
    const sec = (e.section || "").trim().toUpperCase();
    return parcelles.filter(p => {
      if (e.contenanceMin != null && p.contenance < e.contenanceMin) return false;
      if (e.contenanceMax != null && p.contenance > e.contenanceMax) return false;
      if (e.parcelleNue && p.nbBatiments > 0) return false;
      if (e.distanceInjecteurMax != null &&
          (p.distInjecteur == null || p.distInjecteur > e.distanceInjecteurMax)) return false;
      if (sec && p.section.toUpperCase() !== sec) return false;
      if (e.typeZone && p.typeZone !== e.typeZone) return false;
      return true;
    });
  },
};
