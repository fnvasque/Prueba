/* app.js — Cielo AR: visor del cielo en tiempo real según la orientación del teléfono. */
'use strict';

(() => {
  const APP_VERSION = 'v4';   // mantener en sincronía con CACHE de sw.js
  const DEG = Math.PI / 180;
  const RAD = 180 / Math.PI;

  const canvas = document.getElementById('sky');
  const ctx = canvas.getContext('2d');
  const targetSelect = document.getElementById('target');
  const statusEl = document.getElementById('status');
  const targetInfoEl = document.getElementById('targetInfo');
  const overlay = document.getElementById('startOverlay');
  const startBtn = document.getElementById('startBtn');
  const modeBtn = document.getElementById('modeBtn');

  const PLANETS = [
    { id: 'mercury', name: 'Mercurio', color: '#d9c7b4' },
    { id: 'venus', name: 'Venus', color: '#f7f0d3' },
    { id: 'mars', name: 'Marte', color: '#ff8a66' },
    { id: 'jupiter', name: 'Júpiter', color: '#f5d9ae' },
    { id: 'saturn', name: 'Saturno', color: '#f2e5bd' },
    { id: 'uranus', name: 'Urano', color: '#b5efef' },
    { id: 'neptune', name: 'Neptuno', color: '#8badff' }
  ];

  // Tinte realista de las estrellas más conocidas (resto en blanco)
  const STAR_TINTS = {
    betelgeuse: '#ffb380', antares: '#ffaf7d', aldebaran: '#ffc08a', arcturus: '#ffd2a0',
    alphard: '#ffc89a', gacrux: '#ffb88c', schedar: '#ffd9a8', kochab: '#ffd9a8',
    mirach: '#ffc89a', almach: '#ffd2a0', dubhe: '#ffe7bf', pollux: '#ffe3b0',
    capella: '#fff2c9', alphacen: '#ffeccb', procyon: '#fff7e0', canopus: '#fdfaf0',
    rigel: '#d8e6ff', spica: '#cfe0ff', bellatrix: '#d4e2ff', regulus: '#d8e6ff',
    achernar: '#cfe0ff', alnair: '#d4e2ff', shaula: '#cfe0ff', mimosa: '#cfe0ff',
    acrux: '#d4e2ff', adhara: '#d4e2ff', hadar: '#cfe0ff', elnath: '#d8e6ff',
    alkaid: '#d8e6ff', vega: '#e6efff', sirius: '#eaf2ff'
  };

  const state = {
    obs: { lat: 40.4168, lon: -3.7038, altM: 650 },  // por defecto Madrid; se reemplaza con GPS
    obsSource: 'por defecto',
    fovY: 65,                       // campo de visión vertical en grados
    mode: 'manual',                 // 'sensor' | 'manual'
    sensorOk: false,
    manual: { az: 0, alt: 25 },     // cámara en modo manual (arrastre)
    quatTarget: null,               // orientación cruda de los sensores (cuaternión)
    quatSmooth: null,               // orientación suavizada que usa la cámara
    lastFrame: 0,
    target: '',                     // valor del dropdown
    dpr: 1
  };

  // ---------- utilidades vectoriales y de rotación ----------
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

  function matMul(A, B) {
    const C = [[0,0,0],[0,0,0],[0,0,0]];
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        C[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
    return C;
  }
  const Rz = a => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
  const Rx = a => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
  const Ry = a => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];

  function matToQuat(m) {
    const t = m[0][0] + m[1][1] + m[2][2];
    let w, x, y, z, s;
    if (t > 0) {
      s = Math.sqrt(t + 1) * 2;
      w = 0.25 * s;
      x = (m[2][1] - m[1][2]) / s;
      y = (m[0][2] - m[2][0]) / s;
      z = (m[1][0] - m[0][1]) / s;
    } else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
      s = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2;
      w = (m[2][1] - m[1][2]) / s;
      x = 0.25 * s;
      y = (m[0][1] + m[1][0]) / s;
      z = (m[0][2] + m[2][0]) / s;
    } else if (m[1][1] > m[2][2]) {
      s = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2;
      w = (m[0][2] - m[2][0]) / s;
      x = (m[0][1] + m[1][0]) / s;
      y = 0.25 * s;
      z = (m[1][2] + m[2][1]) / s;
    } else {
      s = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2;
      w = (m[1][0] - m[0][1]) / s;
      x = (m[0][2] + m[2][0]) / s;
      y = (m[1][2] + m[2][1]) / s;
      z = 0.25 * s;
    }
    return { w, x, y, z };
  }

  // Interpolación normalizada entre cuaterniones (suficiente para pasos pequeños por frame)
  function quatNlerp(a, b, t) {
    let d = a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z;
    const sgn = d < 0 ? -1 : 1;
    const w = a.w + (b.w * sgn - a.w) * t;
    const x = a.x + (b.x * sgn - a.x) * t;
    const y = a.y + (b.y * sgn - a.y) * t;
    const z = a.z + (b.z * sgn - a.z) * t;
    const n = Math.hypot(w, x, y, z) || 1;
    return { w: w / n, x: x / n, y: y / n, z: z / n };
  }

  function quatAngle(a, b) {
    const d = Math.abs(a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z);
    return 2 * Math.acos(Math.min(1, d));
  }

  function quatToBasis(q) {
    const { w, x, y, z } = q;
    return {
      right: { x: 1 - 2 * (y * y + z * z), y: 2 * (x * y + z * w), z: 2 * (x * z - y * w) },
      up:    { x: 2 * (x * y - z * w), y: 1 - 2 * (x * x + z * z), z: 2 * (y * z + x * w) },
      fwd:   { x: -(2 * (x * z + y * w)), y: -(2 * (y * z - x * w)), z: -(1 - 2 * (x * x + y * y)) }
    };
  }

  // ---------- orientación del dispositivo ----------
  // Marco mundo: x=Este, y=Norte, z=Cenit. La cámara mira por la espalda del teléfono (-z del dispositivo).
  function onOrientation(e) {
    let alpha = e.alpha, beta = e.beta, gamma = e.gamma;
    if (alpha == null || beta == null || gamma == null) return;
    // iOS: alpha no es absoluto, pero webkitCompassHeading da el rumbo magnético
    if (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading)) {
      alpha = 360 - e.webkitCompassHeading;
    }
    const screenAngle = (screen.orientation && typeof screen.orientation.angle === 'number')
      ? screen.orientation.angle : (window.orientation || 0);

    const R = matMul(matMul(Rz(alpha * DEG), Rx(beta * DEG)), Ry(gamma * DEG));
    const M = matMul(R, Rz(screenAngle * DEG));
    state.quatTarget = matToQuat(M);
    if (!state.sensorOk) {
      state.sensorOk = true;
      state.mode = 'sensor';
      state.quatSmooth = state.quatTarget;
      updateStatus();
    }
  }

  // Filtro pasa-bajos adaptativo: firme en reposo, ágil cuando giras deprisa
  function smoothedBasis(dt) {
    if (!state.quatTarget) return null;
    if (!state.quatSmooth) state.quatSmooth = state.quatTarget;
    const diff = quatAngle(state.quatSmooth, state.quatTarget); // radianes
    const k = 5 + diff * 22;
    const t = 1 - Math.exp(-dt * k);
    state.quatSmooth = quatNlerp(state.quatSmooth, state.quatTarget, t);
    return quatToBasis(state.quatSmooth);
  }

  function manualBasis() {
    const fwd = Astro.altAzToVector(state.manual.az, state.manual.alt);
    // right = fwd × cenit, up = right × fwd
    let rx = fwd.y, ry = -fwd.x;
    const rl = Math.hypot(rx, ry) || 1;
    rx /= rl; ry /= rl;
    const right = { x: rx, y: ry, z: 0 };
    const up = {
      x: right.y * fwd.z - right.z * fwd.y,
      y: right.z * fwd.x - right.x * fwd.z,
      z: right.x * fwd.y - right.y * fwd.x
    };
    return { right, up, fwd };
  }

  async function enableSensors() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        const perm = await DeviceOrientationEvent.requestPermission(); // requiere gesto del usuario (iOS)
        if (perm !== 'granted') throw new Error('denegado');
      }
      if ('ondeviceorientationabsolute' in window) {
        window.addEventListener('deviceorientationabsolute', onOrientation, true);
      }
      window.addEventListener('deviceorientation', onOrientation, true);
      // Si en 2.5 s no llegan datos, se queda el modo manual (arrastrar con el dedo)
      setTimeout(() => { if (!state.sensorOk) updateStatus(); }, 2500);
    } catch (err) {
      updateStatus();
    }
  }

  function requestLocation() {
    const cached = localStorage.getItem('obs');
    if (cached) {
      try { Object.assign(state.obs, JSON.parse(cached)); state.obsSource = 'guardada'; } catch (e) {}
    }
    if (!('geolocation' in navigator)) { updateStatus(); return; }
    navigator.geolocation.getCurrentPosition(pos => {
      state.obs = {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        altM: pos.coords.altitude || 0
      };
      state.obsSource = 'GPS';
      try { localStorage.setItem('obs', JSON.stringify(state.obs)); } catch (e) {}
      updateStatus();
    }, () => updateStatus(), { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
  }

  function updateStatus() {
    const loc = `${state.obs.lat.toFixed(2)}°, ${state.obs.lon.toFixed(2)}° (${state.obsSource})`;
    const sens = state.mode === 'sensor' ? 'brújula activa' : 'modo manual: arrastra para mirar';
    statusEl.textContent = `📍 ${loc} · 🧭 ${sens} · ${APP_VERSION}`;
    modeBtn.textContent = state.mode === 'sensor' ? '🧭' : '👆';
  }

  // ---------- decorado del cielo: sprites, estrellas de fondo y Vía Láctea ----------
  function mulberry32(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const spriteCache = new Map();
  function glowSprite(rgb) {
    if (spriteCache.has(rgb)) return spriteCache.get(rgb);
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, `rgba(${rgb},1)`);
    grad.addColorStop(0.22, `rgba(${rgb},0.55)`);
    grad.addColorStop(0.55, `rgba(${rgb},0.14)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    spriteCache.set(rgb, c);
    return c;
  }
  function drawGlow(rgb, x, y, radius, alpha) {
    ctx.globalAlpha = alpha;
    ctx.drawImage(glowSprite(rgb), x - radius, y - radius, radius * 2, radius * 2);
    ctx.globalAlpha = 1;
  }

  // Estrellas anónimas de fondo, uniformes sobre la esfera celeste
  const BG_STARS = (() => {
    const rnd = mulberry32(20260610);
    const out = [];
    for (let i = 0; i < 900; i++) {
      const t = rnd();
      out.push({
        ra: rnd() * 360,
        dec: Math.asin(2 * rnd() - 1) * RAD,
        mag: 2.9 + rnd() * 2.8,
        phase: rnd() * Math.PI * 2,
        speed: 0.8 + rnd() * 2.6,
        tint: t < 0.06 ? '#a9c4ff' : (t < 0.13 ? '#ffd9b0' : '#dfe6f8')
      });
    }
    return out;
  })();

  // Banda de la Vía Láctea: manchas difusas a lo largo del plano galáctico
  const MILKY_WAY = (() => {
    // Matriz galáctico -> ecuatorial (J2000)
    const G = [
      [-0.0548755604, 0.4941094279, -0.8676661490],
      [-0.8734370902, -0.4448296300, -0.1980763734],
      [-0.4838350155, 0.7469822445, 0.4559837762]
    ];
    const rnd = mulberry32(42);
    const out = [];
    for (let l = 0; l < 360; l += 3) {
      for (let j = 0; j < 3; j++) {
        const narrow = j === 0;                              // j 0: núcleo fino y brillante de la banda
        const b = (rnd() + rnd() + rnd() - 1.5) * (narrow ? 4 : 10);
        const lr = (l + rnd() * 3) * DEG, br = b * DEG;
        const g = { x: Math.cos(br) * Math.cos(lr), y: Math.cos(br) * Math.sin(lr), z: Math.sin(br) };
        const ex = G[0][0] * g.x + G[0][1] * g.y + G[0][2] * g.z;
        const ey = G[1][0] * g.x + G[1][1] * g.y + G[1][2] * g.z;
        const ez = G[2][0] * g.x + G[2][1] * g.y + G[2][2] * g.z;
        // Más brillo y anchura hacia el centro galáctico (l≈0, Sagitario)
        const core = 0.55 + 0.45 * Math.cos(lr);
        out.push({
          ra: Astro.norm360(Math.atan2(ey, ex) * RAD),
          dec: Math.asin(Math.max(-1, Math.min(1, ez))) * RAD,
          sizeDeg: (narrow ? 3.5 + rnd() * 5 : 6 + rnd() * 10) * (0.7 + 0.5 * core),
          alpha: (narrow ? 0.085 + rnd() * 0.065 : 0.05 + rnd() * 0.05) * (0.4 + 1.1 * core),
          rgb: core > 0.78 ? '232,208,182' : '168,192,240'   // bulbo dorado, brazos azulados
        });
      }
    }
    return out;
  })();

  // Joyas del cielo profundo: nebulosas, galaxias y cúmulos reales
  const DSOS = [
    { name: 'Nebulosa de Orión', ra: 83.82, dec: -5.39, sizeDeg: 2.4, rgb: '255,158,190', alpha: 0.55 },
    { name: 'Galaxia de Andrómeda', ra: 10.68, dec: 41.27, sizeDeg: 3.2, rgb: '214,222,255', alpha: 0.42, stretch: 0.62 },
    { name: 'Nebulosa de la Laguna', ra: 270.92, dec: -24.38, sizeDeg: 2.0, rgb: '255,170,205', alpha: 0.45 },
    { name: 'Nebulosa de Carina', ra: 161.26, dec: -59.87, sizeDeg: 2.6, rgb: '255,150,160', alpha: 0.5 },
    { name: 'Cúmulo Doble de Perseo', ra: 34.75, dec: 57.13, sizeDeg: 1.5, rgb: '198,214,255', alpha: 0.5 },
    { name: '', ra: 56.87, dec: 24.11, sizeDeg: 1.9, rgb: '170,200,255', alpha: 0.5 } // halo azul de las Pléyades
  ];

  // Estrellas fugaces
  const meteors = [];
  let nextMeteorAt = 0;

  let vignette = null;
  function buildVignette(w, h) {
    vignette = document.createElement('canvas');
    vignette.width = w; vignette.height = h;
    const g = vignette.getContext('2d');
    const grad = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.62);
    grad.addColorStop(0, 'rgba(1,3,12,0)');
    grad.addColorStop(1, 'rgba(1,3,12,0.5)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  }

  // ---------- catálogo de objetivos del buscador ----------
  function buildTargetList() {
    const groups = [
      ['Satélites', Satellites.CATALOG.map(s => [`sat:${s.id}`, s.name])],
      ['Sol y Luna', [['sun', 'Sol'], ['moon', 'Luna']]],
      ['Planetas', PLANETS.map(p => [`planet:${p.id}`, p.name])],
      ['Estrellas', STARS.map(s => [`star:${s.id}`, s.name]).sort((a, b) => a[1].localeCompare(b[1]))]
    ];
    for (const [label, items] of groups) {
      const og = document.createElement('optgroup');
      og.label = label;
      for (const [value, name] of items) {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = name;
        og.appendChild(opt);
      }
      targetSelect.appendChild(og);
    }
  }

  // Devuelve { name, az, alt, extra } del objetivo actual, o null
  function targetAltAz(jd, date) {
    const t = state.target;
    if (!t) return null;
    const o = state.obs;
    if (t.startsWith('sat:')) {
      const id = t.slice(4);
      const entry = Satellites.CATALOG.find(s => s.id === id);
      const la = Satellites.observe(id, o, date);
      if (!la) return { name: entry.name, az: null, alt: null, extra: 'sin datos del satélite (revisa la conexión)' };
      return { name: entry.name, az: la.az, alt: la.alt, extra: `${Math.round(la.rangeKm)} km de distancia` };
    }
    if (t === 'sun') {
      const rd = Astro.sunRaDec(jd);
      const aa = Astro.raDecToAltAz(rd.ra, rd.dec, o.lat, o.lon, jd);
      return { name: 'Sol', ...aa };
    }
    if (t === 'moon') {
      const rd = Astro.moonRaDec(jd);
      const aa = Astro.raDecToAltAz(rd.ra, rd.dec, o.lat, o.lon, jd);
      return { name: 'Luna', ...aa };
    }
    if (t.startsWith('planet:')) {
      const id = t.slice(7);
      const p = PLANETS.find(x => x.id === id);
      const rd = Astro.planetRaDec(id, jd);
      const aa = Astro.raDecToAltAz(rd.ra, rd.dec, o.lat, o.lon, jd);
      return { name: p.name, ...aa };
    }
    if (t.startsWith('star:')) {
      const id = t.slice(5);
      const s = STARS[STAR_INDEX[id]];
      const aa = Astro.raDecToAltAz(s.ra * 15, s.dec, o.lat, o.lon, jd);
      return { name: s.name, ...aa };
    }
    return null;
  }

  // ---------- proyección ----------
  function project(azDeg, altDeg, w, h, f, basis) {
    const u = Astro.altAzToVector(azDeg, altDeg);
    const xc = dot(u, basis.right);
    const yc = dot(u, basis.up);
    const zc = dot(u, basis.fwd);
    if (zc < 0.03) return { visible: false, xc, yc, zc };
    const px = w / 2 + (xc / zc) * f;
    const py = h / 2 - (yc / zc) * f;
    const onScreen = px > -60 && px < w + 60 && py > -60 && py < h + 60;
    return { visible: onScreen, x: px, y: py, xc, yc, zc };
  }

  function projectRaDec(ra, dec, jd, w, h, f, basis) {
    const o = state.obs;
    const aa = Astro.raDecToAltAz(ra, dec, o.lat, o.lon, jd);
    return { aa, p: project(aa.az, aa.alt, w, h, f, basis) };
  }

  // ---------- dibujo ----------
  function starRadius(mag) {
    return Math.max(0.9, 4.6 - 0.62 * mag) * state.dpr;
  }

  function drawLabel(text, x, y, color, size) {
    ctx.font = `${(size || 11) * state.dpr}px system-ui, sans-serif`;
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 4 * state.dpr;
    ctx.fillStyle = color || 'rgba(180,200,255,0.85)';
    ctx.fillText(text, x + 6 * state.dpr, y - 6 * state.dpr);
    ctx.shadowBlur = 0;
  }

  function skyBackground(sunAlt, w, h) {
    let stops;
    if (sunAlt > 0) {
      stops = [[0, '#2a6fd6'], [1, '#7db4ef']];                                   // día
    } else if (sunAlt > -9) {
      stops = [[0, '#070d2e'], [0.55, '#1b1f4e'], [0.85, '#6b3a20'], [1, '#b1551f']]; // crepúsculo
    } else if (sunAlt > -16) {
      stops = [[0, '#04071d'], [0.6, '#0c1136'], [1, '#1c2350']];                 // anochecer
    } else {
      stops = [[0, '#020310'], [0.45, '#060a20'], [0.8, '#0c1438'], [1, '#121c45']]; // noche profunda
    }
    const g = ctx.createLinearGradient(0, 0, 0, h);
    for (const [pos, col] of stops) g.addColorStop(pos, col);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function drawHorizon(w, h, f, basis) {
    // Resplandor ancho + línea fina
    for (const [width, color] of [[16, 'rgba(110,210,160,0.10)'], [5, 'rgba(120,220,170,0.18)'], [1.4, 'rgba(150,240,190,0.75)']]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width * state.dpr;
      ctx.beginPath();
      let pen = false;
      for (let az = 0; az <= 360; az += 3) {
        const p = project(az, 0, w, h, f, basis);
        if (p.visible) {
          if (pen) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
          pen = true;
        } else pen = false;
      }
      ctx.stroke();
    }
    // Marcas cada 15° y puntos cardinales
    ctx.strokeStyle = 'rgba(140,235,185,0.5)';
    ctx.lineWidth = 1.2 * state.dpr;
    for (let az = 0; az < 360; az += 15) {
      const a = project(az, 0, w, h, f, basis);
      const b = project(az, az % 45 === 0 ? 2.2 : 1.1, w, h, f, basis);
      if (a.visible && b.visible) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    const cards = [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SO', 225], ['O', 270], ['NO', 315]];
    ctx.textAlign = 'center';
    for (const [label, az] of cards) {
      const p = project(az, 0, w, h, f, basis);
      if (p.visible) {
        ctx.font = `bold ${(az % 90 === 0 ? 14 : 11) * state.dpr}px system-ui, sans-serif`;
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 4 * state.dpr;
        ctx.fillStyle = label === 'N' ? '#ffd34d' : 'rgba(150,238,190,0.95)';
        ctx.fillText(label, p.x, p.y + 20 * state.dpr);
        ctx.shadowBlur = 0;
      }
    }
    ctx.textAlign = 'left';
  }

  // Luna con su fase real: semicírculo iluminado + elipse del terminador
  function drawMoon(p, r, illum, brightAngle) {
    drawGlow('220,228,255', p.x, p.y, r * 4.4, 0.65);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(brightAngle);
    ctx.fillStyle = '#2a2d3f';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e9e9e2';
    ctx.beginPath();
    ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);             // mitad iluminada (lado +x)
    ctx.ellipse(0, 0, r * Math.abs(2 * illum - 1), r, 0, Math.PI / 2, -Math.PI / 2, illum < 0.5);
    ctx.fill();
    ctx.restore();
  }

  function drawArrowToTarget(tgt, w, h, f, basis, now) {
    const u = Astro.altAzToVector(tgt.az, tgt.alt);
    const xc = dot(u, basis.right);
    const yc = dot(u, basis.up);
    const len = Math.hypot(xc, yc) || 1;
    const dx = xc / len, dy = -yc / len;
    const pulse = 1 + 0.08 * Math.sin(now * 5);
    const r = (Math.min(w, h) / 2 - 70 * state.dpr) * 1;
    const ax = w / 2 + dx * r;
    const ay = h / 2 + dy * r;
    const ang = Math.atan2(dy, dx);
    drawGlow('255,211,77', ax, ay, 34 * state.dpr, 0.35);
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(ang);
    ctx.scale(pulse, pulse);
    const s = 16 * state.dpr;
    ctx.fillStyle = '#ffd34d';
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 2 * state.dpr;
    ctx.beginPath();
    ctx.moveTo(s, 0);
    ctx.lineTo(-s * 0.7, s * 0.62);
    ctx.lineTo(-s * 0.25, 0);
    ctx.lineTo(-s * 0.7, -s * 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function render(ts) {
    const now = (ts || 0) / 1000;
    const dt = Math.min(0.1, Math.max(0.001, now - state.lastFrame));
    state.lastFrame = now;

    const date = new Date();
    const jd = Astro.jdFromDate(date);
    const w = canvas.width, h = canvas.height;
    const f = (h / 2) / Math.tan((state.fovY / 2) * DEG);
    let basis = null;
    if (state.mode === 'sensor') basis = smoothedBasis(dt);
    if (!basis) basis = manualBasis();
    const o = state.obs;

    const sunRd = Astro.sunRaDec(jd);
    const sunAa = Astro.raDecToAltAz(sunRd.ra, sunRd.dec, o.lat, o.lon, jd);
    skyBackground(sunAa.alt, w, h);

    const starDim = sunAa.alt > 0 ? 0.25 : (sunAa.alt > -9 ? 0.55 : 1);

    // Vía Láctea (solo con cielo oscuro)
    if (starDim > 0.5) {
      ctx.globalCompositeOperation = 'lighter';
      for (const b of MILKY_WAY) {
        const { aa, p } = projectRaDec(b.ra, b.dec, jd, w, h, f, basis);
        if (aa.alt < -12 || !p.visible) continue;
        const rad = f * Math.tan(b.sizeDeg * DEG);
        drawGlow(b.rgb, p.x, p.y, rad, b.alpha * starDim);
      }
      // Nebulosas y galaxias
      for (const d of DSOS) {
        const { aa, p } = projectRaDec(d.ra, d.dec, jd, w, h, f, basis);
        if (aa.alt < -8 || !p.visible) continue;
        const rad = f * Math.tan(d.sizeDeg * DEG);
        if (d.stretch) {
          // Galaxias: tres manchas solapadas formando un huso inclinado
          for (const k of [-1, 0, 1]) {
            drawGlow(d.rgb, p.x + k * rad * 0.55, p.y - k * rad * 0.3, rad * (1 - 0.3 * Math.abs(k)), d.alpha * starDim);
          }
        } else {
          drawGlow(d.rgb, p.x, p.y, rad, d.alpha * starDim);
          drawGlow('255,255,255', p.x, p.y, rad * 0.35, d.alpha * 0.7 * starDim);
        }
        if (d.name && starDim > 0.8) {
          ctx.font = `italic ${10 * state.dpr}px Georgia, serif`;
          ctx.fillStyle = `rgba(${d.rgb},0.75)`;
          ctx.fillText(d.name, p.x + rad * 0.5, p.y - rad * 0.5);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // Estrellas anónimas de fondo, con parpadeo
    if (starDim > 0.4) {
      for (const s of BG_STARS) {
        const { aa, p } = projectRaDec(s.ra, s.dec, jd, w, h, f, basis);
        if (aa.alt < -5 || !p.visible) continue;
        const tw = 0.55 + 0.45 * Math.sin(now * s.speed + s.phase);
        const r = Math.max(0.5, (5.9 - s.mag) * 0.36) * state.dpr;
        ctx.fillStyle = s.tint;
        ctx.globalAlpha = (0.22 + (5.7 - s.mag) * 0.13) * tw * starDim;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Estrellas fugaces ocasionales
    if (starDim > 0.5) {
      if (now > nextMeteorAt) {
        nextMeteorAt = now + 4 + Math.random() * 9;
        if (meteors.length < 3) {
          meteors.push({
            az: Math.random() * 360,
            alt: 25 + Math.random() * 45,
            dir: Math.random() * Math.PI * 2,
            len: 12 + Math.random() * 14,
            dur: 0.55 + Math.random() * 0.65,
            t0: now
          });
        }
      }
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        const pr = (now - m.t0) / m.dur;
        if (pr >= 1 || pr < 0) { meteors.splice(i, 1); continue; }
        const env = Math.sin(Math.PI * pr);
        const cosA = Math.max(0.25, Math.cos(m.alt * DEG));
        const headAz = m.az + Math.cos(m.dir) * m.len * pr / cosA;
        const headAlt = m.alt + Math.sin(m.dir) * m.len * pr;
        const tailPr = Math.max(0, pr - 0.35);
        const tailAz = m.az + Math.cos(m.dir) * m.len * tailPr / cosA;
        const tailAlt = m.alt + Math.sin(m.dir) * m.len * tailPr;
        const hp = project(headAz, headAlt, w, h, f, basis);
        const tp = project(tailAz, tailAlt, w, h, f, basis);
        if ((!hp.visible && !tp.visible) || hp.zc < 0.03 || tp.zc < 0.03) continue;
        const grad = ctx.createLinearGradient(tp.x, tp.y, hp.x, hp.y);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(1, `rgba(255,255,255,${0.95 * env})`);
        ctx.strokeStyle = grad;
        ctx.lineCap = 'round';
        ctx.lineWidth = 1.7 * state.dpr;
        ctx.beginPath();
        ctx.moveTo(tp.x, tp.y);
        ctx.lineTo(hp.x, hp.y);
        ctx.stroke();
        drawGlow('210,225,255', hp.x, hp.y, 11 * state.dpr, 0.55 * env);
      }
    }

    // Estrellas del catálogo (posiciones proyectadas se reutilizan para las líneas)
    const starPos = new Array(STARS.length);
    for (let i = 0; i < STARS.length; i++) {
      const s = STARS[i];
      const aa = Astro.raDecToAltAz(s.ra * 15, s.dec, o.lat, o.lon, jd);
      if (aa.alt < -10) { starPos[i] = null; continue; }
      starPos[i] = project(aa.az, aa.alt, w, h, f, basis);
    }

    // Líneas de constelaciones: trazo ancho difuso + trazo fino brillante
    ctx.lineCap = 'round';
    for (const [width, alpha] of [[3.6, 0.16], [1.2, 0.6]]) {
      ctx.lineWidth = width * state.dpr;
      ctx.strokeStyle = `rgba(106,150,235,${alpha * starDim})`;
      for (const c of CONSTELLATIONS) {
        for (const [aId, bId] of c.lines) {
          const a = starPos[STAR_INDEX[aId]];
          const b = starPos[STAR_INDEX[bId]];
          if (a && b && (a.visible || b.visible) && a.zc > 0.03 && b.zc > 0.03) {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
    }
    for (const c of CONSTELLATIONS) {
      let cx = 0, cy = 0, n = 0;
      for (const [aId, bId] of c.lines) {
        const a = starPos[STAR_INDEX[aId]];
        const b = starPos[STAR_INDEX[bId]];
        if (a && b && (a.visible || b.visible) && a.zc > 0.03 && b.zc > 0.03) {
          cx += a.x + b.x; cy += a.y + b.y; n += 2;
        }
      }
      if (n >= 4) {
        ctx.font = `italic ${11 * state.dpr}px Georgia, serif`;
        ctx.fillStyle = `rgba(130,165,240,${0.7 * starDim})`;
        ctx.fillText(c.name, cx / n, cy / n);
      }
    }

    // Puntos de estrellas con halo, color y picos de difracción en las más brillantes
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < STARS.length; i++) {
      const p = starPos[i];
      if (!p || !p.visible) continue;
      const s = STARS[i];
      const r = starRadius(s.mag);
      const tint = STAR_TINTS[s.id] || '#ffffff';
      const tw = s.mag > 0.6 ? 0.78 + 0.22 * Math.sin(now * (1.4 + (i % 7) * 0.5) + i * 2.1) : 1;
      const rgb = tint === '#ffffff' ? '235,240,255'
        : `${parseInt(tint.slice(1, 3), 16)},${parseInt(tint.slice(3, 5), 16)},${parseInt(tint.slice(5, 7), 16)}`;
      if (s.mag < 1.6) drawGlow(rgb, p.x, p.y, r * 7.5, 0.42 * starDim * tw);
      if (s.mag < 0.6) {
        // Picos de difracción en cruz
        const spike = r * 5.2 * tw;
        ctx.strokeStyle = `rgba(${rgb},${0.5 * starDim * tw})`;
        ctx.lineWidth = 1 * state.dpr;
        ctx.beginPath();
        ctx.moveTo(p.x - spike, p.y); ctx.lineTo(p.x + spike, p.y);
        ctx.moveTo(p.x, p.y - spike); ctx.lineTo(p.x, p.y + spike);
        ctx.stroke();
      }
      ctx.fillStyle = tint;
      ctx.globalAlpha = Math.min(1, (1.3 - s.mag * 0.16)) * starDim * tw;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < STARS.length; i++) {
      const p = starPos[i];
      if (p && p.visible && STARS[i].mag < 1.2) {
        drawLabel(STARS[i].name, p.x, p.y, `rgba(205,220,255,${0.85 * starDim})`);
      }
    }

    // Planetas
    for (const pl of PLANETS) {
      const rd = Astro.planetRaDec(pl.id, jd);
      const aa = Astro.raDecToAltAz(rd.ra, rd.dec, o.lat, o.lon, jd);
      if (aa.alt < -10) continue;
      const p = project(aa.az, aa.alt, w, h, f, basis);
      if (!p.visible) continue;
      const mag = Astro.planetMagnitude(pl.id, jd);
      const r = Math.max(2.6 * state.dpr, starRadius(mag));
      const rgb = `${parseInt(pl.color.slice(1, 3), 16)},${parseInt(pl.color.slice(3, 5), 16)},${parseInt(pl.color.slice(5, 7), 16)}`;
      drawGlow(rgb, p.x, p.y, r * 6.5, 0.5);
      ctx.fillStyle = pl.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      if (pl.id === 'saturn') {
        ctx.strokeStyle = `rgba(${rgb},0.85)`;
        ctx.lineWidth = 1.3 * state.dpr;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, r * 2.2, r * 0.75, -0.35, 0, Math.PI * 2);
        ctx.stroke();
      }
      drawLabel(pl.name, p.x, p.y, pl.color);
    }

    // Sol
    let sunProj = null;
    if (sunAa.alt > -12) {
      sunProj = project(sunAa.az, sunAa.alt, w, h, f, basis);
      if (sunProj.visible) {
        const r = Math.max(9 * state.dpr, f * 0.0047);
        const g = ctx.createRadialGradient(sunProj.x, sunProj.y, 0, sunProj.x, sunProj.y, r * 2.5);
        g.addColorStop(0, 'rgba(255,235,150,1)');
        g.addColorStop(0.4, 'rgba(255,210,90,0.9)');
        g.addColorStop(1, 'rgba(255,200,60,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(sunProj.x, sunProj.y, r * 2.5, 0, Math.PI * 2);
        ctx.fill();
        drawLabel('Sol', sunProj.x + r, sunProj.y - r, '#ffe9a0', 13);
      }
    } else {
      sunProj = project(sunAa.az, sunAa.alt, w, h, f, basis); // para orientar la fase lunar
    }

    // Luna con fase
    const moonRd = Astro.moonRaDec(jd);
    const moonAa = Astro.raDecToAltAz(moonRd.ra, moonRd.dec, o.lat, o.lon, jd);
    if (moonAa.alt > -10) {
      const p = project(moonAa.az, moonAa.alt, w, h, f, basis);
      if (p.visible) {
        const r = Math.max(8 * state.dpr, f * 0.0045);
        // Fracción iluminada a partir de la elongación Sol-Luna
        const vs = Astro.altAzToVector(sunAa.az, sunAa.alt);
        const vm = Astro.altAzToVector(moonAa.az, moonAa.alt);
        const elong = Math.acos(Math.max(-1, Math.min(1, dot(vs, vm))));
        const illum = (1 - Math.cos(elong)) / 2;
        const brightAngle = Math.atan2(-(sunProj.yc - p.yc), sunProj.xc - p.xc);
        drawMoon(p, r, illum, brightAngle);
        drawLabel('Luna', p.x + r, p.y - r, '#e8e8e0', 13);
      }
    }

    // Satélites
    for (const entry of Satellites.CATALOG) {
      const la = Satellites.observe(entry.id, o, date);
      if (!la || la.alt < -25) continue;
      const p = project(la.az, la.alt, w, h, f, basis);
      if (!p.visible) continue;
      const blink = 0.7 + 0.3 * Math.sin(now * 4);
      drawGlow('125,240,255', p.x, p.y, 16 * state.dpr, 0.4 * blink);
      ctx.fillStyle = '#7df0ff';
      ctx.strokeStyle = 'rgba(125,240,255,0.6)';
      ctx.lineWidth = 1.2 * state.dpr;
      const r = 4 * state.dpr;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(p.x - r * 2.4, p.y); ctx.lineTo(p.x - r * 1.2, p.y);
      ctx.moveTo(p.x + r * 1.2, p.y); ctx.lineTo(p.x + r * 2.4, p.y);
      ctx.stroke();
      drawLabel(entry.name.split(' (')[0], p.x, p.y, '#7df0ff');
    }

    // Horizonte y puntos cardinales
    drawHorizon(w, h, f, basis);

    // Viñeteado para dar profundidad
    if (vignette) ctx.drawImage(vignette, 0, 0);

    // Objetivo seleccionado: anillo pulsante + flecha guía
    const tgt = targetAltAz(jd, date);
    if (tgt) {
      if (tgt.az == null) {
        targetInfoEl.textContent = `🎯 ${tgt.name}: ${tgt.extra}`;
      } else {
        const p = project(tgt.az, tgt.alt, w, h, f, basis);
        const below = tgt.alt < 0;
        if (p.visible) {
          const ringR = (16 + 2.5 * Math.sin(now * 4)) * state.dpr;
          drawGlow('255,211,77', p.x, p.y, ringR * 2.4, 0.25);
          ctx.strokeStyle = '#ffd34d';
          ctx.lineWidth = 2 * state.dpr;
          ctx.beginPath();
          ctx.arc(p.x, p.y, ringR, 0, Math.PI * 2);
          ctx.stroke();
          targetInfoEl.textContent = `🎯 ${tgt.name} en pantalla · az ${tgt.az.toFixed(0)}° · alt ${tgt.alt.toFixed(0)}°` +
            (below ? ' · está bajo el horizonte' : '') + (tgt.extra ? ` · ${tgt.extra}` : '');
        } else {
          drawArrowToTarget(tgt, w, h, f, basis, now);
          targetInfoEl.textContent = `🎯 ${tgt.name}: sigue la flecha · az ${tgt.az.toFixed(0)}° · alt ${tgt.alt.toFixed(0)}°` +
            (below ? ' · ahora mismo está bajo el horizonte' : '') + (tgt.extra ? ` · ${tgt.extra}` : '');
        }
      }
      targetInfoEl.hidden = false;
    } else {
      targetInfoEl.hidden = true;
    }

    requestAnimationFrame(render);
  }

  // ---------- interacción táctil (modo manual y zoom) ----------
  let touchState = null;
  canvas.addEventListener('pointerdown', e => {
    touchState = { x: e.clientX, y: e.clientY, id: e.pointerId };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (!touchState || touchState.id !== e.pointerId) return;
    if (state.mode !== 'manual') return;
    const scale = state.fovY / canvas.clientHeight;
    state.manual.az = Astro.norm360(state.manual.az - (e.clientX - touchState.x) * scale);
    state.manual.alt = Math.max(-30, Math.min(89, state.manual.alt + (e.clientY - touchState.y) * scale));
    touchState.x = e.clientX;
    touchState.y = e.clientY;
  });
  canvas.addEventListener('pointerup', () => { touchState = null; });

  let pinchDist = null;
  canvas.addEventListener('touchmove', e => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (pinchDist) {
        state.fovY = Math.max(25, Math.min(100, state.fovY * pinchDist / d));
      }
      pinchDist = d;
    }
  }, { passive: false });
  canvas.addEventListener('touchend', () => { pinchDist = null; });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    state.fovY = Math.max(25, Math.min(100, state.fovY * (e.deltaY > 0 ? 1.08 : 0.93)));
  }, { passive: false });

  modeBtn.addEventListener('click', () => {
    if (state.mode === 'sensor') {
      // Congela la vista actual para explorar a mano
      if (state.quatSmooth) {
        const fw = quatToBasis(state.quatSmooth).fwd;
        state.manual.az = Astro.norm360(Math.atan2(fw.x, fw.y) * RAD);
        state.manual.alt = Math.asin(Math.max(-1, Math.min(1, fw.z))) * RAD;
      }
      state.mode = 'manual';
    } else if (state.sensorOk) {
      state.mode = 'sensor';
    }
    updateStatus();
  });

  targetSelect.addEventListener('change', () => { state.target = targetSelect.value; });

  // ---------- arranque ----------
  function resize() {
    state.dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(canvas.clientWidth * state.dpr);
    canvas.height = Math.round(canvas.clientHeight * state.dpr);
    buildVignette(canvas.width, canvas.height);
  }
  window.addEventListener('resize', resize);

  startBtn.addEventListener('click', async () => {
    overlay.hidden = true;
    await enableSensors();   // debe ocurrir dentro del gesto del usuario (iOS)
    requestLocation();
  });

  buildTargetList();
  resize();
  updateStatus();
  Satellites.init();
  requestAnimationFrame(render);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then(reg => {
        reg.update();                                  // busca versión nueva en cada arranque
        setInterval(() => reg.update(), 30 * 60 * 1000);
      }).catch(() => {});
      // Cuando un service worker nuevo toma el control, recarga una vez
      // para servir la versión recién cacheada
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return;
        reloaded = true;
        location.reload();
      });
    });
  }
})();
