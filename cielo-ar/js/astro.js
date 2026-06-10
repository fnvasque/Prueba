/* astro.js — Cálculos astronómicos (precisión suficiente para observación a simple vista).
 * Planetas: elementos keplerianos de Standish (JPL, válidos 1800–2050).
 * Luna: serie truncada de Meeus (~0.3° de error).
 * Sin dependencias externas.
 */
'use strict';

const Astro = (() => {
  const DEG = Math.PI / 180;
  const RAD = 180 / Math.PI;

  function jdFromDate(date) {
    return date.getTime() / 86400000 + 2440587.5;
  }

  // Siglos julianos desde J2000.0
  function centuries(jd) {
    return (jd - 2451545.0) / 36525.0;
  }

  // Tiempo sidéreo medio de Greenwich (grados)
  function gmst(jd) {
    const T = centuries(jd);
    let g = 280.46061837 + 360.98564736629 * (jd - 2451545.0) +
            0.000387933 * T * T - (T * T * T) / 38710000;
    return ((g % 360) + 360) % 360;
  }

  // Oblicuidad de la eclíptica (grados)
  function obliquity(jd) {
    return 23.439291 - 0.0130042 * centuries(jd);
  }

  function norm360(x) { return ((x % 360) + 360) % 360; }

  // Resuelve la ecuación de Kepler M = E - e·sinE (entradas/salidas en radianes)
  function keplerSolve(M, e) {
    let E = M + e * Math.sin(M);
    for (let i = 0; i < 8; i++) {
      const dE = (M - (E - e * Math.sin(E))) / (1 - e * Math.cos(E));
      E += dE;
      if (Math.abs(dE) < 1e-8) break;
    }
    return E;
  }

  // Elementos keplerianos J2000 + variación por siglo (Standish):
  // [a, e, I, L, longPeri, longNode] y sus tasas.
  const ELEMENTS = {
    mercury: [[0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593],
              [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
    venus:   [[0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255],
              [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418]],
    earth:   [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
              [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0]],
    mars:    [[1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
              [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
    jupiter: [[5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
              [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
    saturn:  [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
              [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
    uranus:  [[19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503],
              [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]],
    neptune: [[30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
              [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]]
  };

  // Posición heliocéntrica eclíptica J2000 (UA)
  function helioPosition(name, jd) {
    const T = centuries(jd);
    const [e0, r] = ELEMENTS[name];
    const a = e0[0] + r[0] * T;
    const e = e0[1] + r[1] * T;
    const I = (e0[2] + r[2] * T) * DEG;
    const L = norm360(e0[3] + r[3] * T);
    const wBar = e0[4] + r[4] * T;
    const node = e0[5] + r[5] * T;

    const M = norm360(L - wBar) * DEG;
    const w = (wBar - node) * DEG;
    const N = node * DEG;

    const E = keplerSolve(M, e);
    const xv = a * (Math.cos(E) - e);
    const yv = a * Math.sqrt(1 - e * e) * Math.sin(E);

    const cosN = Math.cos(N), sinN = Math.sin(N);
    const cosI = Math.cos(I), sinI = Math.sin(I);
    const cosw = Math.cos(w), sinw = Math.sin(w);

    const x = (cosw * cosN - sinw * sinN * cosI) * xv + (-sinw * cosN - cosw * sinN * cosI) * yv;
    const y = (cosw * sinN + sinw * cosN * cosI) * xv + (-sinw * sinN + cosw * cosN * cosI) * yv;
    const z = (sinw * sinI) * xv + (cosw * sinI) * yv;
    return { x, y, z };
  }

  function eclToEquatorial(x, y, z, jd) {
    const eps = obliquity(jd) * DEG;
    const xe = x;
    const ye = y * Math.cos(eps) - z * Math.sin(eps);
    const ze = y * Math.sin(eps) + z * Math.cos(eps);
    const dist = Math.sqrt(xe * xe + ye * ye + ze * ze);
    const ra = norm360(Math.atan2(ye, xe) * RAD);     // grados
    const dec = Math.asin(ze / dist) * RAD;           // grados
    return { ra, dec, dist };
  }

  // RA/Dec geocéntrico de un planeta
  function planetRaDec(name, jd) {
    const p = helioPosition(name, jd);
    const e = helioPosition('earth', jd);
    return eclToEquatorial(p.x - e.x, p.y - e.y, p.z - e.z, jd);
  }

  function sunRaDec(jd) {
    const e = helioPosition('earth', jd);
    return eclToEquatorial(-e.x, -e.y, -e.z, jd);
  }

  // Luna: serie corta (lon/lat eclípticas en grados, dist en km)
  function moonRaDec(jd) {
    const d = jd - 2451545.0;
    const L = 218.316 + 13.176396 * d;   // longitud media
    const M = (134.963 + 13.064993 * d) * DEG; // anomalía media
    const F = (93.272 + 13.229350 * d) * DEG;  // argumento de latitud
    const lon = (L + 6.289 * Math.sin(M)) * DEG;
    const lat = (5.128 * Math.sin(F)) * DEG;
    const distKm = 385001 - 20905 * Math.cos(M);
    const distAU = distKm / 149597870.7;
    const x = distAU * Math.cos(lat) * Math.cos(lon);
    const y = distAU * Math.cos(lat) * Math.sin(lon);
    const z = distAU * Math.sin(lat);
    return eclToEquatorial(x, y, z, jd);
  }

  // Magnitud aparente aproximada de los planetas
  function planetMagnitude(name, jd) {
    const p = helioPosition(name, jd);
    const e = helioPosition('earth', jd);
    const r = Math.hypot(p.x, p.y, p.z);                       // sol-planeta
    const D = Math.hypot(p.x - e.x, p.y - e.y, p.z - e.z);     // tierra-planeta
    const base = { mercury: -0.36, venus: -4.34, mars: -1.51, jupiter: -9.40,
                   saturn: -8.88, uranus: -7.19, neptune: -6.87 }[name];
    if (base === undefined) return 0;
    return base + 5 * Math.log10(r * D);
  }

  // RA/Dec (grados) -> azimut/altura (grados) para un observador
  function raDecToAltAz(ra, dec, latDeg, lonDeg, jd) {
    const lst = norm360(gmst(jd) + lonDeg);           // tiempo sidéreo local
    const H = norm360(lst - ra) * DEG;                // ángulo horario
    const lat = latDeg * DEG, decR = dec * DEG;
    const sinAlt = Math.sin(decR) * Math.sin(lat) + Math.cos(decR) * Math.cos(lat) * Math.cos(H);
    const alt = Math.asin(sinAlt);
    const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat) - Math.tan(decR) * Math.cos(lat));
    return { az: norm360(az * RAD + 180), alt: alt * RAD }; // az desde el Norte, hacia el Este
  }

  // Azimut/altura -> vector unitario ENU (x=Este, y=Norte, z=Cenit)
  function altAzToVector(azDeg, altDeg) {
    const az = azDeg * DEG, alt = altDeg * DEG;
    return {
      x: Math.cos(alt) * Math.sin(az),
      y: Math.cos(alt) * Math.cos(az),
      z: Math.sin(alt)
    };
  }

  // Geodésico (grados, km) -> ECEF (km), modelo WGS84
  function geodeticToEcef(latDeg, lonDeg, altKm) {
    const lat = latDeg * DEG, lon = lonDeg * DEG;
    const a = 6378.137, f = 1 / 298.257223563;
    const e2 = f * (2 - f);
    const N = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
    return {
      x: (N + altKm) * Math.cos(lat) * Math.cos(lon),
      y: (N + altKm) * Math.cos(lat) * Math.sin(lon),
      z: (N * (1 - e2) + altKm) * Math.sin(lat)
    };
  }

  // Azimut/altura/distancia de un satélite (posición geodésica) visto desde el observador
  function lookAngles(obsLat, obsLon, obsAltKm, satLat, satLon, satAltKm) {
    const o = geodeticToEcef(obsLat, obsLon, obsAltKm);
    const s = geodeticToEcef(satLat, satLon, satAltKm);
    const dx = s.x - o.x, dy = s.y - o.y, dz = s.z - o.z;
    const lat = obsLat * DEG, lon = obsLon * DEG;
    // ECEF -> ENU local
    const E = -Math.sin(lon) * dx + Math.cos(lon) * dy;
    const N = -Math.sin(lat) * Math.cos(lon) * dx - Math.sin(lat) * Math.sin(lon) * dy + Math.cos(lat) * dz;
    const U = Math.cos(lat) * Math.cos(lon) * dx + Math.cos(lat) * Math.sin(lon) * dy + Math.sin(lat) * dz;
    const range = Math.sqrt(E * E + N * N + U * U);
    return {
      az: norm360(Math.atan2(E, N) * RAD),
      alt: Math.asin(U / range) * RAD,
      rangeKm: range
    };
  }

  return {
    jdFromDate, gmst, norm360,
    planetRaDec, sunRaDec, moonRaDec, planetMagnitude,
    raDecToAltAz, altAzToVector, lookAngles
  };
})();
