/* =============================================================================
   Utilitaires géométriques — sans dépendance (pas de Turf).
   Coordonnées en WGS84 (lon, lat), comme le PCI Vecteur.
   ========================================================================== */

const GEO = {

  /* Anneaux extérieurs d'un Polygon / MultiPolygon */
  anneaux(geometry) {
    if (!geometry) return [];
    if (geometry.type === "Polygon") return [geometry.coordinates[0]];
    if (geometry.type === "MultiPolygon") return geometry.coordinates.map(p => p[0]);
    return [];
  },

  /* Centroïde pondéré par l'aire (approximation planaire, suffisante à l'échelle
     d'une commune). Retourne [lon, lat]. */
  centroide(geometry) {
    let sx = 0, sy = 0, sa = 0;
    for (const ring of GEO.anneaux(geometry)) {
      let a = 0, cx = 0, cy = 0;
      for (let i = 0, n = ring.length - 1; i < n; i++) {
        const [x0, y0] = ring[i], [x1, y1] = ring[i + 1];
        const f = x0 * y1 - x1 * y0;
        a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
      }
      if (a === 0) continue;
      a *= 0.5;
      sx += cx / 6; sy += cy / 6; sa += a;
    }
    if (sa === 0) {
      const ring = GEO.anneaux(geometry)[0];
      return ring ? ring[0] : null;
    }
    return [sx / sa, sy / sa];
  },

  /* Emprise [minLon, minLat, maxLon, maxLat] */
  bbox(geometry) {
    let a = 180, b = 90, c = -180, d = -90;
    for (const ring of GEO.anneaux(geometry)) {
      for (const [x, y] of ring) {
        if (x < a) a = x; if (y < b) b = y;
        if (x > c) c = x; if (y > d) d = y;
      }
    }
    return [a, b, c, d];
  },

  /* Distance orthodromique en km entre deux [lon, lat] */
  distanceKm(p1, p2) {
    const R = 6371;
    const rad = Math.PI / 180;
    const dLat = (p2[1] - p1[1]) * rad;
    const dLon = (p2[0] - p1[0]) * rad;
    const lat1 = p1[1] * rad, lat2 = p2[1] * rad;
    const h = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  },

  /* Point dans polygone (ray casting sur les anneaux extérieurs) */
  pointDans(pt, geometry) {
    const [x, y] = pt;
    for (const ring of GEO.anneaux(geometry)) {
      let dedans = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j];
        if ((yi > y) !== (yj > y) &&
            x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dedans = !dedans;
      }
      if (dedans) return true;
    }
    return false;
  },

  bboxIntersecte(a, b) {
    return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
  },
};
