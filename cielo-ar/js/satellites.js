/* satellites.js — Seguimiento de satélites en tiempo real.
 * Fuente principal: TLEs de Celestrak propagados con satellite.js (SGP4).
 * Fallback para la ISS: API wheretheiss.at (posición geodésica directa).
 * Los TLEs se guardan en localStorage para funcionar sin red (válidos unos días).
 */
'use strict';

const Satellites = (() => {
  const CATALOG = [
    { id: 'iss', norad: 25544, name: 'ISS (Estación Espacial Internacional)' },
    { id: 'css', norad: 48274, name: 'Tiangong (Estación Espacial China)' },
    { id: 'hst', norad: 20580, name: 'Telescopio Espacial Hubble' }
  ];

  const TLE_URL = n => `https://celestrak.org/NORAD/elements/gp.php?CATNR=${n}&FORMAT=TLE`;
  const ISS_API = 'https://api.wheretheiss.at/v1/satellites/25544';
  const TLE_MAX_AGE_MS = 3 * 24 * 3600 * 1000; // refrescar TLEs cada 3 días

  const state = {};       // por id: { satrec, tleTime, geo: {lat,lon,altKm,time} }
  CATALOG.forEach(s => { state[s.id] = {}; });

  function loadCachedTle(entry) {
    try {
      const raw = localStorage.getItem('tle:' + entry.norad);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function buildSatrec(entry, tle) {
    if (typeof satellite === 'undefined' || !tle) return;
    try {
      state[entry.id].satrec = satellite.twoline2satrec(tle.l1, tle.l2);
      state[entry.id].tleTime = tle.time;
    } catch (e) { /* TLE corrupto: se ignora */ }
  }

  async function fetchTle(entry) {
    const res = await fetch(TLE_URL(entry.norad), { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 3 || !lines[1].startsWith('1') || !lines[2].startsWith('2')) {
      throw new Error('TLE inválido');
    }
    const tle = { l1: lines[1], l2: lines[2], time: Date.now() };
    try { localStorage.setItem('tle:' + entry.norad, JSON.stringify(tle)); } catch (e) {}
    return tle;
  }

  // Fallback ISS: posición geodésica directa, sin SGP4
  async function refreshIssGeo() {
    try {
      const res = await fetch(ISS_API, { cache: 'no-store' });
      if (!res.ok) return;
      const d = await res.json();
      state.iss.geo = { lat: d.latitude, lon: d.longitude, altKm: d.altitude, time: Date.now() };
    } catch (e) { /* sin red: se mantiene lo que haya */ }
  }

  async function init() {
    // 1) Carga TLEs cacheados de inmediato
    CATALOG.forEach(entry => {
      const tle = loadCachedTle(entry);
      if (tle) buildSatrec(entry, tle);
    });
    // 2) Refresca en segundo plano los que falten o estén viejos
    for (const entry of CATALOG) {
      const st = state[entry.id];
      if (!st.satrec || (Date.now() - (st.tleTime || 0)) > TLE_MAX_AGE_MS) {
        fetchTle(entry).then(tle => buildSatrec(entry, tle)).catch(() => {});
      }
    }
    // 3) Fallback ISS por si Celestrak o satellite.js no están disponibles
    refreshIssGeo();
    setInterval(refreshIssGeo, 30000);
  }

  // Posición geodésica actual del satélite, o null si no hay datos
  function geodetic(id, date) {
    const st = state[id];
    if (st.satrec && typeof satellite !== 'undefined') {
      try {
        const pv = satellite.propagate(st.satrec, date);
        if (pv.position) {
          const gmst = satellite.gstime(date);
          const geo = satellite.eciToGeodetic(pv.position, gmst);
          return {
            lat: satellite.degreesLat(geo.latitude),
            lon: satellite.degreesLong(geo.longitude),
            altKm: geo.height
          };
        }
      } catch (e) { /* cae al fallback */ }
    }
    if (st.geo && (Date.now() - st.geo.time) < 120000) {
      return { lat: st.geo.lat, lon: st.geo.lon, altKm: st.geo.altKm };
    }
    return null;
  }

  // Azimut/altura/distancia vistos por el observador, o null
  function observe(id, obs, date) {
    const g = geodetic(id, date);
    if (!g) return null;
    const la = Astro.lookAngles(obs.lat, obs.lon, (obs.altM || 0) / 1000, g.lat, g.lon, g.altKm);
    return { ...la, geo: g };
  }

  function hasData(id) {
    const st = state[id];
    return !!(st.satrec || (st.geo && (Date.now() - st.geo.time) < 120000));
  }

  return { CATALOG, init, observe, hasData };
})();
