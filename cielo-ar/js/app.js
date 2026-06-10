/* app.js — Cielo AR: visor del cielo en tiempo real según la orientación del teléfono. */
'use strict';

(() => {
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
    { id: 'mercury', name: 'Mercurio', color: '#c9b8a8' },
    { id: 'venus', name: 'Venus', color: '#f5eecb' },
    { id: 'mars', name: 'Marte', color: '#ff7a5c' },
    { id: 'jupiter', name: 'Júpiter', color: '#f3d3a4' },
    { id: 'saturn', name: 'Saturno', color: '#f0e2b6' },
    { id: 'uranus', name: 'Urano', color: '#a8ecec' },
    { id: 'neptune', name: 'Neptuno', color: '#7da2ff' }
  ];

  const state = {
    obs: { lat: 40.4168, lon: -3.7038, altM: 650 },  // por defecto Madrid; se reemplaza con GPS
    obsSource: 'por defecto',
    fovY: 65,                       // campo de visión vertical en grados
    mode: 'manual',                 // 'sensor' | 'manual'
    sensorOk: false,
    manual: { az: 0, alt: 25 },     // cámara en modo manual (arrastre)
    basis: null,                    // {right, up, fwd} vectores ENU de la cámara
    target: '',                     // valor del dropdown
    dpr: 1
  };

  // ---------- utilidades vectoriales ----------
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

  function matMul(A, B) {
    const C = [[0,0,0],[0,0,0],[0,0,0]];
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        C[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
    return C;
  }
  const matVec = (M, v) => ({
    x: M[0][0] * v.x + M[0][1] * v.y + M[0][2] * v.z,
    y: M[1][0] * v.x + M[1][1] * v.y + M[1][2] * v.z,
    z: M[2][0] * v.x + M[2][1] * v.y + M[2][2] * v.z
  });
  const Rz = a => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
  const Rx = a => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
  const Ry = a => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];

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
    state.basis = {
      right: matVec(M, { x: 1, y: 0, z: 0 }),
      up:    matVec(M, { x: 0, y: 1, z: 0 }),
      fwd:   matVec(M, { x: 0, y: 0, z: -1 })
    };
    if (!state.sensorOk) {
      state.sensorOk = true;
      state.mode = 'sensor';
      updateStatus();
    }
  }

  function manualBasis() {
    const fwd = Astro.altAzToVector(state.manual.az, state.manual.alt);
    // right = fwd × cenit, up = right × fwd
    let rx = fwd.y, ry = -fwd.x, rz = 0;
    const rl = Math.hypot(rx, ry) || 1;
    rx /= rl; ry /= rl;
    const right = { x: rx, y: ry, z: rz };
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
    statusEl.textContent = `📍 ${loc} · 🧭 ${sens}`;
    modeBtn.textContent = state.mode === 'sensor' ? '🧭' : '👆';
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
    const onScreen = px > -40 && px < w + 40 && py > -40 && py < h + 40;
    return { visible: onScreen, x: px, y: py, xc, yc, zc };
  }

  // ---------- dibujo ----------
  function starRadius(mag) {
    return Math.max(0.9, 4.6 - 0.62 * mag) * state.dpr;
  }

  function drawLabel(text, x, y, color, size) {
    ctx.font = `${(size || 11) * state.dpr}px system-ui, sans-serif`;
    ctx.fillStyle = color || 'rgba(180,200,255,0.85)';
    ctx.fillText(text, x + 6 * state.dpr, y - 6 * state.dpr);
  }

  function skyBackground(sunAlt, w, h) {
    let top, bottom;
    if (sunAlt > 0) { top = '#2a6fd6'; bottom = '#7db4ef'; }            // día
    else if (sunAlt > -9) { top = '#0b1740'; bottom = '#b1551f'; }      // crepúsculo
    else if (sunAlt > -16) { top = '#050a23'; bottom = '#1c2350'; }     // anochecer
    else { top = '#02040f'; bottom = '#0a1128'; }                       // noche
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function drawHorizon(w, h, f, basis) {
    ctx.strokeStyle = 'rgba(120,220,160,0.55)';
    ctx.lineWidth = 1.4 * state.dpr;
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
    const cards = [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SO', 225], ['O', 270], ['NO', 315]];
    ctx.textAlign = 'center';
    for (const [label, az] of cards) {
      const p = project(az, 0, w, h, f, basis);
      if (p.visible) {
        ctx.font = `bold ${13 * state.dpr}px system-ui, sans-serif`;
        ctx.fillStyle = 'rgba(140,235,180,0.9)';
        ctx.fillText(label, p.x, p.y + 18 * state.dpr);
      }
    }
    ctx.textAlign = 'left';
  }

  function drawArrowToTarget(tgt, w, h, f, basis) {
    const u = Astro.altAzToVector(tgt.az, tgt.alt);
    const xc = dot(u, basis.right);
    const yc = dot(u, basis.up);
    // Dirección en pantalla hacia el objetivo
    const len = Math.hypot(xc, yc) || 1;
    const dx = xc / len, dy = -yc / len;
    const r = Math.min(w, h) / 2 - 70 * state.dpr;
    const ax = w / 2 + dx * r;
    const ay = h / 2 + dy * r;
    const ang = Math.atan2(dy, dx);
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(ang);
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

  function render() {
    const date = new Date();
    const jd = Astro.jdFromDate(date);
    const w = canvas.width, h = canvas.height;
    const f = (h / 2) / Math.tan((state.fovY / 2) * DEG);
    const basis = (state.mode === 'sensor' && state.basis) ? state.basis : manualBasis();
    const o = state.obs;

    const sunRd = Astro.sunRaDec(jd);
    const sunAa = Astro.raDecToAltAz(sunRd.ra, sunRd.dec, o.lat, o.lon, jd);
    skyBackground(sunAa.alt, w, h);

    const starDim = sunAa.alt > 0 ? 0.3 : (sunAa.alt > -9 ? 0.6 : 1);

    // Estrellas (posiciones proyectadas se reutilizan para las líneas)
    const starPos = new Array(STARS.length);
    for (let i = 0; i < STARS.length; i++) {
      const s = STARS[i];
      const aa = Astro.raDecToAltAz(s.ra * 15, s.dec, o.lat, o.lon, jd);
      if (aa.alt < -10) { starPos[i] = null; continue; }
      starPos[i] = project(aa.az, aa.alt, w, h, f, basis);
    }

    // Líneas de constelaciones
    ctx.strokeStyle = `rgba(90,130,210,${0.45 * starDim})`;
    ctx.lineWidth = 1 * state.dpr;
    for (const c of CONSTELLATIONS) {
      let cx = 0, cy = 0, n = 0;
      for (const [aId, bId] of c.lines) {
        const a = starPos[STAR_INDEX[aId]];
        const b = starPos[STAR_INDEX[bId]];
        if (a && b && (a.visible || b.visible) && a.zc > 0.03 && b.zc > 0.03) {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          cx += a.x + b.x; cy += a.y + b.y; n += 2;
        }
      }
      if (n >= 4) {
        ctx.font = `italic ${11 * state.dpr}px system-ui, sans-serif`;
        ctx.fillStyle = `rgba(110,150,230,${0.55 * starDim})`;
        ctx.fillText(c.name, cx / n, cy / n);
      }
    }

    // Puntos de estrellas
    for (let i = 0; i < STARS.length; i++) {
      const p = starPos[i];
      if (!p || !p.visible) continue;
      const s = STARS[i];
      const r = starRadius(s.mag);
      ctx.fillStyle = `rgba(255,255,255,${Math.min(1, (1.3 - s.mag * 0.16)) * starDim})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      if (s.mag < 1.2) drawLabel(s.name, p.x, p.y, `rgba(200,215,255,${0.8 * starDim})`);
    }

    // Planetas
    for (const pl of PLANETS) {
      const rd = Astro.planetRaDec(pl.id, jd);
      const aa = Astro.raDecToAltAz(rd.ra, rd.dec, o.lat, o.lon, jd);
      if (aa.alt < -10) continue;
      const p = project(aa.az, aa.alt, w, h, f, basis);
      if (!p.visible) continue;
      const mag = Astro.planetMagnitude(pl.id, jd);
      const r = Math.max(2.2 * state.dpr, starRadius(mag));
      ctx.fillStyle = pl.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      drawLabel(pl.name, p.x, p.y, pl.color);
    }

    // Sol
    if (sunAa.alt > -10) {
      const p = project(sunAa.az, sunAa.alt, w, h, f, basis);
      if (p.visible) {
        const r = Math.max(9 * state.dpr, f * 0.0047);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.5);
        g.addColorStop(0, 'rgba(255,235,150,1)');
        g.addColorStop(0.4, 'rgba(255,210,90,0.9)');
        g.addColorStop(1, 'rgba(255,200,60,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 2.5, 0, Math.PI * 2);
        ctx.fill();
        drawLabel('Sol', p.x + r, p.y - r, '#ffe9a0', 13);
      }
    }

    // Luna
    const moonRd = Astro.moonRaDec(jd);
    const moonAa = Astro.raDecToAltAz(moonRd.ra, moonRd.dec, o.lat, o.lon, jd);
    if (moonAa.alt > -10) {
      const p = project(moonAa.az, moonAa.alt, w, h, f, basis);
      if (p.visible) {
        const r = Math.max(7 * state.dpr, f * 0.0045);
        ctx.fillStyle = '#e8e8e0';
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        drawLabel('Luna', p.x + r, p.y - r, '#e8e8e0', 13);
      }
    }

    // Satélites
    for (const entry of Satellites.CATALOG) {
      const la = Satellites.observe(entry.id, o, date);
      if (!la || la.alt < -25) continue;
      const p = project(la.az, la.alt, w, h, f, basis);
      if (!p.visible) continue;
      ctx.fillStyle = '#7df0ff';
      ctx.strokeStyle = 'rgba(125,240,255,0.5)';
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

    // Objetivo seleccionado: anillo + flecha guía
    const tgt = targetAltAz(jd, date);
    if (tgt) {
      if (tgt.az == null) {
        targetInfoEl.textContent = `🎯 ${tgt.name}: ${tgt.extra}`;
      } else {
        const p = project(tgt.az, tgt.alt, w, h, f, basis);
        const below = tgt.alt < 0;
        if (p.visible) {
          ctx.strokeStyle = '#ffd34d';
          ctx.lineWidth = 2 * state.dpr;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 16 * state.dpr, 0, Math.PI * 2);
          ctx.stroke();
          targetInfoEl.textContent = `🎯 ${tgt.name} en pantalla · az ${tgt.az.toFixed(0)}° · alt ${tgt.alt.toFixed(0)}°` +
            (below ? ' · está bajo el horizonte' : '') + (tgt.extra ? ` · ${tgt.extra}` : '');
        } else {
          drawArrowToTarget(tgt, w, h, f, basis);
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
      if (state.basis) {
        const fw = state.basis.fwd;
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
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
})();
