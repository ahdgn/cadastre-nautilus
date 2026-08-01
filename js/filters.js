/* ============================================
   Filters — état des filtres, contrôles de la sidebar,
   synchronisation avec le hash de l'URL
   ============================================ */

const Filters = (() => {
  const { FILTRES_DEFAUT } = CONFIG;

  const etat = { ...FILTRES_DEFAUT, insee: '' };
  let onChange = () => {};

  /* ---- URL --------------------------------------------------------------- */
  function depuisURL() {
    const p = new URLSearchParams(location.hash.slice(1));
    const num = k => (p.has(k) && p.get(k) !== '' ? Number(p.get(k)) : null);
    if (p.has('insee')) etat.insee = p.get('insee');
    if (p.has('min'))   etat.contenanceMin = num('min');
    if (p.has('max'))   etat.contenanceMax = num('max');
    if (p.has('dinj'))  etat.distanceInjecteurMax = num('dinj');
    if (p.has('sec'))   etat.section = p.get('sec');
    if (p.has('zone'))  etat.typeZone = p.get('zone');
    if (p.has('bati'))  etat.bati = p.get('bati');
    return etat;
  }

  function versURL() {
    const p = new URLSearchParams();
    if (etat.insee) p.set('insee', etat.insee);
    if (etat.contenanceMin != null) p.set('min', etat.contenanceMin);
    if (etat.contenanceMax != null) p.set('max', etat.contenanceMax);
    if (etat.distanceInjecteurMax != null) p.set('dinj', etat.distanceInjecteurMax);
    if (etat.section) p.set('sec', etat.section);
    if (etat.typeZone) p.set('zone', etat.typeZone);
    if (etat.bati) p.set('bati', etat.bati);
    history.replaceState(null, '', '#' + p.toString());
  }

  /* ---- Contrôles --------------------------------------------------------- */
  function init(callback) {
    onChange = callback;

    ['filter-min', 'filter-max', 'filter-dinj', 'filter-section', 'filter-zone']
      .forEach(id => document.getElementById(id).addEventListener('change', lireControles));

    document.querySelectorAll('#filter-bati .seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        etat.bati = btn.dataset.bati;
        majSegmented('filter-bati', 'bati', etat.bati);
        appliquer();
      });
    });

    document.getElementById('btn-reset').addEventListener('click', reinitialiser);
    document.getElementById('map-empty-reset').addEventListener('click', reinitialiser);
  }

  function lireControles() {
    const n = id => {
      const v = document.getElementById(id).value.trim();
      return v === '' ? null : Number(v);
    };
    etat.contenanceMin = n('filter-min');
    etat.contenanceMax = n('filter-max');
    etat.distanceInjecteurMax = n('filter-dinj');
    etat.section = document.getElementById('filter-section').value.trim();
    etat.typeZone = document.getElementById('filter-zone').value;
    appliquer();
  }

  function versControles() {
    document.getElementById('filter-min').value = etat.contenanceMin ?? '';
    document.getElementById('filter-max').value = etat.contenanceMax ?? '';
    document.getElementById('filter-dinj').value = etat.distanceInjecteurMax ?? '';
    document.getElementById('filter-section').value = etat.section ?? '';
    document.getElementById('filter-zone').value = etat.typeZone ?? '';
    majSegmented('filter-bati', 'bati', etat.bati);
    majLabelContenance();
  }

  function majSegmented(conteneurId, attr, valeur) {
    document.querySelectorAll(`#${conteneurId} .seg-btn`).forEach(b =>
      b.setAttribute('aria-pressed', String(b.dataset[attr] === valeur)));
  }

  function majLabelContenance() {
    const { contenanceMin: a, contenanceMax: b } = etat;
    const ha = v => CONFIG.fmtNum(v / 10000, v % 10000 === 0 ? 0 : 1) + ' ha';
    document.getElementById('contenance-label').textContent =
      a != null && b != null ? `${ha(a)} – ${ha(b)}`
      : a != null ? `≥ ${ha(a)}`
      : b != null ? `≤ ${ha(b)}`
      : 'toutes';
  }

  function reinitialiser() {
    Object.assign(etat, FILTRES_DEFAUT);
    versControles();
    appliquer();
  }

  /* ---- Application ------------------------------------------------------- */
  function nbActifs() {
    let n = 0;
    for (const [k, v] of Object.entries(FILTRES_DEFAUT)) if (etat[k] !== v) n++;
    return n;
  }

  function appliquer() {
    majLabelContenance();
    versURL();
    const actifs = nbActifs();
    const btn = document.getElementById('btn-reset');
    btn.hidden = actifs === 0;
    document.getElementById('reset-count').textContent = actifs;
    onChange();
  }

  function filtrer(parcelles) {
    const sec = (etat.section || '').trim().toUpperCase();
    return parcelles.filter(p => {
      if (etat.contenanceMin != null && p.contenance < etat.contenanceMin) return false;
      if (etat.contenanceMax != null && p.contenance > etat.contenanceMax) return false;
      if (etat.bati === 'nue' && p.nbBatiments > 0) return false;
      if (etat.distanceInjecteurMax != null &&
          (p.distInjecteur == null || p.distInjecteur > etat.distanceInjecteurMax)) return false;
      if (sec && p.section.toUpperCase() !== sec) return false;
      if (etat.typeZone && p.typeZone !== etat.typeZone) return false;
      return true;
    });
  }

  return { etat, init, depuisURL, versURL, versControles, filtrer, appliquer, reinitialiser };
})();
