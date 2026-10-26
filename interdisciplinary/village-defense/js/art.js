/* art.js — 고해상도(2배) 도트 그림: 배경·무기·탄·과녁. 게임 좌표(논리 px, 1 m = 6 px)는 그대로 두고 그림만 반 칸 단위로 그린다.
   배경은 장치 픽셀(논리×S)에 직접 그려 두고, 나머지는 논리 좌표를 반올림 단위 1/S 로 그린다. */
(function (root) {
  'use strict';
  const VD = root.VD, C = VD.C, SP = VD.sprites, S = SP.HS;
  const PX = C.PXM, GY = C.GROUND_PX, W = C.CW * S, H = C.CH * S, GYD = GY * S;
  const toPx = x => x * PX, toPy = y => GY - y * PX;

  // ---------- 색·난수 도우미 ----------
  const rgb = c => [parseInt(c.substr(1, 2), 16), parseInt(c.substr(3, 2), 16), parseInt(c.substr(5, 2), 16)];
  const hex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };
  const lite = (c, f) => mix(c, '#ffffff', f), dark = (c, f) => mix(c, '#000000', f);
  function rnd(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function noise1(R) {                                       // 부드러운 1차원 값 잡음
    const tab = Array.from({ length: 512 }, () => R());
    return x => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return tab[i & 511] * (1 - u) + tab[(i + 1) & 511] * u; };
  }
  function noise2(R) {
    const tab = Array.from({ length: 1024 }, () => R());
    const at = (i, j) => tab[(((i * 73 + j * 151) % 1024) + 1024) % 1024];
    return (x, y) => { const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
      return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v; };
  }
  const DIG = { 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001',
    5: '111100111001111', 6: '111100111101111', 7: '111001001001001', 8: '111101111101111', 9: '111101111001111' };

  // 장치 픽셀 좌표로 그리는 도우미(배경용)
  const fr = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
  function disc(g, cx, cy, r, col) { g.fillStyle = col; for (let dy = -r; dy <= r; dy++) { const hw = Math.floor(Math.sqrt(r * r - dy * dy + r * 0.3)); g.fillRect(Math.round(cx - hw), Math.round(cy + dy), hw * 2 + 1, 1); } }
  function numD(g, str, x, y, col) {                          // 3×5 숫자, 한 점 = S 장치 픽셀
    g.fillStyle = col;
    for (const ch of String(str)) { const m = DIG[ch]; if (m) for (let i = 0; i < 15; i++) if (m[i] === '1') g.fillRect(x + (i % 3) * S, y + (i / 3 | 0) * S, S, S); x += 4 * S; }
  }
  function sphere(g, cx, cy, rad, colorAt) {                  // 빛이 왼쪽 위에서 오는 공 모양(행성·지구)
    const cv = document.createElement('canvas'); cv.width = cv.height = rad * 2 + 1;
    const c2 = cv.getContext('2d'), im = c2.createImageData(cv.width, cv.height);
    for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) {
      const d2 = x * x + y * y; if (d2 > rad * rad) continue;
      const nx = x / rad, ny = y / rad, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const light = Math.max(0, -0.45 * nx - 0.55 * ny + 0.7 * nz), col = colorAt(nx, ny, light, nz), i = ((y + rad) * cv.width + x + rad) * 4;
      im.data[i] = col[0]; im.data[i + 1] = col[1]; im.data[i + 2] = col[2]; im.data[i + 3] = 255;
    }
    c2.putImageData(im, 0, 0); g.drawImage(cv, Math.round(cx - rad), Math.round(cy - rad));
  }
  function cloud(g, cx, cy, w, main, shade, R) {              // 겹친 원 구름: 아래 그림자 → 본체 → 위 하이라이트
    const blobs = [], n = 5 + (R() * 3 | 0);
    for (let i = 0; i < n; i++) blobs.push([cx + (i / (n - 1) - 0.5) * w + (R() - 0.5) * w * 0.12, cy - Math.sin(i / (n - 1) * Math.PI) * w * 0.12 + (R() - 0.5) * 3, w * (0.1 + R() * 0.07 + Math.sin(i / (n - 1) * Math.PI) * 0.08)]);
    blobs.forEach(([x, y, r]) => disc(g, x, y + 3, r, shade)); blobs.forEach(([x, y, r]) => disc(g, x, y, r, main));
    blobs.forEach(([x, y, r]) => disc(g, x - r * 0.25, y - r * 0.35, Math.max(2, r * 0.55), lite(main, 0.35)));
    fr(g, cx - w * 0.5, cy + w * 0.14, Math.round(w), 2, main);
  }

  // ---------- 배경 ----------
  const LOOK = {
    era0: { sky: ['#6fb8ee', '#cdeaf8'], mtn: ['#8fb0c8', '#5f9a7a'], gnd: '#6fae4a', gnd2: '#4f8a34', edge: '#9bd860' },
    era1: { sky: ['#d9884e', '#fde4b0'], mtn: ['#b98a6a', '#8a6a4a'], gnd: '#b8955a', gnd2: '#96763e', edge: '#d9b87a' },
    era2: { sky: ['#5f7790', '#b6c4d2'], mtn: ['#7a8896', '#566472'], gnd: '#6a7d5a', gnd2: '#4e5f42', edge: '#8aa074' },
    era3: { sky: ['#0a0620', '#43207a'], mtn: ['#2a2058', '#1c1640'], gnd: '#3a4560', gnd2: '#27304a', edge: '#25e0d0' },
    moon: { sky: ['#02030a', '#0a0c18'], mtn: ['#5a5a66', '#42424c'], gnd: '#8a8a92', gnd2: '#6e6e78', edge: '#c4c4ce' },
    mars: { sky: ['#b8683c', '#f4c9a0'], mtn: ['#a8503a', '#7e3a2a'], gnd: '#b4573a', gnd2: '#8f4230', edge: '#d98058' },
    jupiter: { sky: ['#9a4c28', '#ead0a0'], mtn: ['#9a5a3a', '#7a4630'], gnd: '#d4a070', gnd2: '#b07a4e', edge: '#f0cc9c' },
  };

  function makeBackground(stage, era) {
    const key = stage.body || 'era' + era, L = LOOK[key];
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'), R = rnd(stage.id.charCodeAt(0) * 31 + stage.id.charCodeAt(2)), n1 = noise1(R), n2 = noise2(R);
    const night = key === 'moon' || key === 'era3';

    // 1. 하늘: 순서 디더링 그라데이션(도트 느낌의 부드러운 하늘)
    { const steps = 20, a = rgb(L.sky[0]), b = rgb(L.sky[1]), cols = Array.from({ length: steps }, (_, k) => a.map((v, i) => v + (b[i] - v) * k / (steps - 1)));
      const im = g.createImageData(W, GYD + 2); const y1 = GYD + 2;
      for (let y = 0; y < y1; y++) { const lv = Math.min(1, y / GYD) * (steps - 1), bs = Math.floor(lv), f = lv - bs;
        for (let x = 0; x < W; x++) { const k = Math.min(steps - 1, bs + (f > (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 ? 1 : 0)), c = cols[k], i = (y * W + x) * 4; im.data[i] = c[0]; im.data[i + 1] = c[1]; im.data[i + 2] = c[2]; im.data[i + 3] = 255; } }
      g.putImageData(im, 0, 0); }

    // 2. 하늘의 것들
    if (night) {
      for (let i = 0; i < 160; i++) { const x = R() * W | 0, y = R() * GYD * 0.62 | 0, v = R(); fr(g, x, y, 1, 1, v < 0.15 ? '#ffffff' : v < 0.5 ? '#aab0d8' : '#6a70a0'); if (v < 0.05) { fr(g, x - 1, y, 3, 1, '#ffffff99'); fr(g, x, y - 1, 1, 3, '#ffffff99'); } }
    }
    if (key === 'era0') { const sx = 62 * S, sy = 30 * S; g.globalAlpha = 0.16; disc(g, sx, sy, 26 * S / 2 * 1.9, '#ffffff'); g.globalAlpha = 0.22; disc(g, sx, sy, 17 * S / 2 * 1.9, '#fff7c8'); g.globalAlpha = 1; disc(g, sx, sy, 8 * S, '#ffe27a'); disc(g, sx - 2, sy - 2, 6 * S, '#fff6c0'); }
    if (key === 'era1') { const sx = 300 * S, sy = 150 * S; g.globalAlpha = 0.2; disc(g, sx, sy, 44 * S, '#fff0b0'); g.globalAlpha = 0.3; disc(g, sx, sy, 30 * S, '#ffd070'); g.globalAlpha = 1; disc(g, sx, sy, 18 * S, '#ffb050'); disc(g, sx - 3, sy - 3, 15 * S, '#ffe090'); }
    if (key === 'moon') {                                       // 지구
      const ec = [310 * S, 36 * S], er = 14 * S, nz = n2;
      sphere(g, ec[0], ec[1], er, (x, y, l) => {
        const u = x * 3 + 5, v = y * 3 + 2, land = nz(u, v) > 0.58, cloudy = nz(u * 2.1 + 9, v * 2.1) > 0.66, k = 0.3 + 0.7 * l;
        let c = land ? [74, 168, 96] : [44, 111, 208]; if (cloudy) c = [240, 246, 255]; return c.map(q => q * k + (k < 0.5 ? 0 : (l - 0.5) * 30)); });
    }
    if (key === 'mars') { disc(g, 62 * S, 36 * S, 4 * S, '#d8c8b0'); disc(g, 61 * S, 35 * S, 3 * S, '#efe2cc'); disc(g, 300 * S, 58 * S, 2 * S + 1, '#b8a890'); }
    if (key === 'jupiter') {                                    // 띠무늬 행성(가장자리가 어두워지는 구)
      const bandc = [[200, 144, 90], [232, 200, 154], [168, 106, 62], [216, 174, 128], [190, 120, 76]];
      sphere(g, 292 * S, 80 * S, 62 * S, (x, y, l, z) => { const yy = y + Math.sin(x * 5 + y * 16) * 0.025 + (n2(x * 4, y * 18) - 0.5) * 0.05, bi = Math.floor((yy + 1) * 5.5) % bandc.length, c = bandc[Math.max(0, bi)].slice();
        const gx = (x + 0.22) / 0.2, gy = (y - 0.32) / 0.1; if (gx * gx + gy * gy < 1) { c[0] = 176; c[1] = 64; c[2] = 42; }
        const k = 0.25 + 0.75 * Math.pow(Math.max(0, l), 0.8) * (0.55 + 0.45 * z); return c.map(q => q * k); });
    }
    if (key === 'era3') {                                       // 고리 달린 행성 + 도시 불빛
      const px = 296 * S, py = 50 * S, pr = 22 * S;
      g.strokeStyle = '#b48cff88'; g.lineWidth = 3; g.beginPath(); g.ellipse(px, py, pr * 1.9, pr * 0.46, -0.32, Math.PI, Math.PI * 2); g.stroke();
      sphere(g, px, py, pr, (x, y, l) => { const k = 0.2 + 0.8 * l, band = 0.5 + 0.5 * Math.sin(y * 12 + n2(x * 3, y * 3) * 3); return [(90 + 60 * band) * k, (60 + 40 * band) * k, (170 + 50 * band) * k]; });
      g.strokeStyle = '#d6b8ffcc'; g.beginPath(); g.ellipse(px, py, pr * 1.9, pr * 0.46, -0.32, 0, Math.PI); g.stroke();
    }
    if (key === 'era0' || key === 'era1' || key === 'era2') {   // 구름
      const cn = key === 'era2' ? 6 : 5, main = key === 'era1' ? '#ffe6c8' : key === 'era2' ? '#aab6c4' : '#ffffff', shade = key === 'era1' ? '#e8b48a' : key === 'era2' ? '#7f8c9c' : '#c4dcee';
      for (let i = 0; i < cn; i++) cloud(g, (30 + R() * 330) * S, (18 + R() * 62) * S, (14 + R() * 20) * S, main, shade, R);
    }

    // 3. 산: 3겹(멀수록 하늘색에 섞임), 빛이 왼쪽에서 와서 왼쪽 비탈이 밝다
    const haze = L.sky[1];
    [[0, 62, 44, 0.5, 0.0035], [1, 42, 26, 0.22, 0.007], [2, 26, 10, 0, 0.012]].forEach(([layer, hi, lo, hz, f]) => {
      const base = layer === 2 ? L.mtn[1] : L.mtn[0], col = mix(layer === 2 ? dark(base, 0.05) : base, haze, hz);
      const top = new Array(W);
      for (let x = 0; x < W; x++) { const v = 0.6 * n1(x * f + layer * 40) + 0.3 * n1(x * f * 3.1 + 7 + layer) + 0.1 * n1(x * f * 9 + 3); top[x] = Math.round(GYD - (lo + v * (hi - lo)) * S); }
      for (let x = 0; x < W; x++) {
        const t = top[x], sl = top[Math.max(0, x - 3)] - top[Math.min(W - 1, x + 3)];        // >0: 오른쪽으로 오를수록 높아짐(왼쪽을 향한 비탈, 밝음)
        const lit = sl > 1 ? 0.12 : sl < -1 ? -0.14 : 0;
        const c0 = lit > 0 ? lite(col, lit) : lit < 0 ? dark(col, -lit) : col;
        fr(g, x, t, 1, GYD - t + 2, c0);
        fr(g, x, t, 1, 1, lite(col, 0.28)); if (layer < 2 && (x + t) % 4 === 0) fr(g, x, t + 3 + (x % 3), 1, 1, dark(c0, 0.1));
        if (layer === 2) { fr(g, x, GYD - 14, 1, 16, dark(c0, 0.08)); }
      }
      if (hz) { for (let y = 0; y < 26; y++) { g.globalAlpha = 0.35 * (1 - y / 26); fr(g, 0, GYD - y, W, 1, haze); } g.globalAlpha = 1; }
    });

    // 4. 먼 숲·바위·도시(지평선 바로 앞의 작은 장식)
    const u = S;
    if (key === 'era0') {
      for (let x = 100 * S; x < W - 4; x += (6 + R() * 12) * S | 0) {
        const r = (2.4 + R() * 1.8) * u, cx = x, base = GYD - 2, g1 = lite('#3f8a3a', R() * 0.15);
        fr(g, cx - 1, base - r * 0.9, 2, r * 0.9 + 2, '#5a3a1e'); disc(g, cx, base - r * 1.5, r, dark(g1, 0.2)); disc(g, cx - 1, base - r * 1.6, r - 1, g1); disc(g, cx - r * 0.35, base - r * 1.95, Math.max(1, r * 0.45), lite(g1, 0.3));
      }
    } else if (key === 'era1') {
      for (let x = 100 * S; x < W - 4; x += (8 + R() * 14) * S | 0) {
        if (R() < 0.6) { const h = (4 + R() * 3) * u; fr(g, x, GYD - h, 2, h + 1, '#6a8a3a'); fr(g, x - 3, GYD - h * 0.65, 3, 2, '#6a8a3a'); fr(g, x - 3, GYD - h * 0.65 - 3, 2, 3, '#6a8a3a'); fr(g, x + 2, GYD - h * 0.5, 3, 2, '#6a8a3a'); fr(g, x + 3, GYD - h * 0.5 - 3, 2, 3, '#6a8a3a'); fr(g, x, GYD - h, 1, h, '#8aaa5a'); }
        else { const r = (2 + R() * 2) * u; disc(g, x, GYD - r * 0.6, r, '#8a6a4a'); disc(g, x - 1, GYD - r * 0.8, r - 1, '#a88a62'); }
      }
    } else if (key === 'era2') {
      for (let x = 100 * S; x < W - 4; x += (6 + R() * 10) * S | 0) {
        const h = (6 + R() * 5) * u, c1 = '#2f4a36';
        for (let r = 0; r < 4; r++) { const w = (r + 1) * 2 + 1; fr(g, x - w, GYD - h + r * h * 0.24, w * 2 + 1, Math.ceil(h * 0.28), r % 2 ? dark(c1, 0.15) : c1); }
        fr(g, x - 1, GYD - 3, 2, 4, '#3a2616'); fr(g, x - 2, GYD - h, 2, 1, '#8fb08f');
      }
    } else if (key === 'era3') {                                 // 도시 스카이라인
      for (let x = 0; x < W; x += 18 + (R() * 8 | 0)) { const bw = 14 + (R() * 8 | 0), bh = (16 + R() * 40) * u | 0, by = GYD - bh - 6; fr(g, x, by, bw, bh, '#161036'); fr(g, x, by, 1, bh, '#2a2058'); fr(g, x, by, bw, 1, '#2a2058');
        for (let wy = by + 4; wy < by + bh - 3; wy += 6) for (let wx = x + 3; wx < x + bw - 3; wx += 4) if (R() < 0.45) fr(g, wx, wy, 2, 2, R() < 0.5 ? '#25e0d0' : R() < 0.5 ? '#ffd24a' : '#ff6aa8');
        if (R() < 0.3) { fr(g, x + bw / 2 | 0, by - 8, 1, 8, '#8a98b0'); fr(g, (x + bw / 2 | 0) - 1, by - 9, 3, 2, '#ff3355'); } }
    } else if (key === 'moon') {
      for (let x = 100 * S; x < W - 4; x += (14 + R() * 24) * S | 0) { const r = (1.5 + R() * 2) * u; disc(g, x, GYD - r * 0.5, r, '#6e6e78'); disc(g, x - 1, GYD - r * 0.7, Math.max(1, r - 1), '#9a9aa4'); }
    } else {
      for (let x = 100 * S; x < W - 4; x += (12 + R() * 22) * S | 0) { const r = (2 + R() * 3) * u, c1 = key === 'mars' ? '#8f4230' : '#9a6a44'; disc(g, x, GYD - r * 0.5, r, dark(c1, 0.15)); disc(g, x - 1, GYD - r * 0.7, Math.max(1, r - 1), c1); disc(g, x - r * 0.4, GYD - r * 0.95, Math.max(1, r * 0.4), lite(c1, 0.3)); }
    }

    // 5. 땅
    for (let y = GYD; y < H; y++) { const t = (y - GYD) / (H - GYD); fr(g, 0, y, W, 1, mix(L.gnd, dark(L.gnd, 0.18), t)); }
    for (let i = 0; i < 900; i++) { const x = R() * W | 0, y = GYD + 6 + (R() * (H - GYD - 8) | 0), v = R(); fr(g, x, y, 1 + (R() < 0.4 ? 1 : 0), 1, v < 0.55 ? L.gnd2 : v < 0.8 ? lite(L.gnd, 0.1) : dark(L.gnd, 0.28)); }
    for (let y = GYD + 18; y < H; y += 18) { g.globalAlpha = 0.07; fr(g, 0, y, W, 2, '#000'); g.globalAlpha = 1; }
    fr(g, 0, GYD, W, 3, L.edge); fr(g, 0, GYD + 3, W, 2, mix(L.edge, L.gnd, 0.5)); fr(g, 0, GYD + 5, W, 1, dark(L.gnd, 0.25));
    if (key === 'era0') {
      for (let x = 0; x < W; x += 3 + (R() * 5 | 0)) { const hh = 2 + (R() * 4 | 0); fr(g, x, GYD - hh, 1, hh, R() < 0.5 ? '#5fa83a' : '#3f7a2a'); }
      for (let i = 0; i < 26; i++) { const x = R() * W | 0, y = GYD + 8 + (R() * 40 | 0), c = ['#ffffff', '#ffe27a', '#ff9ab8'][i % 3]; fr(g, x, y, 2, 2, c); fr(g, x, y + 2, 1, 2, '#3f7a2a'); }
    } else if (key === 'era1') {
      for (let i = 0; i < 22; i++) { let x = R() * W | 0, y = GYD + 8 + (R() * 50 | 0); for (let k = 0; k < 8; k++) { fr(g, x, y, 2, 1, '#6a4e26'); x += 2; y += (R() < 0.5 ? 1 : -1); } }
    } else if (key === 'era2') {
      for (let y = GYD + 8, row = 0; y < H - 2; y += 6, row++) for (let x = (row % 2) * 6; x < W; x += 12) { fr(g, x, y, 11, 1, dark(L.gnd, 0.3)); fr(g, x + 11, y, 1, 6, dark(L.gnd, 0.3)); }
    } else if (key === 'era3') {
      for (let x = 0; x < W; x += 32) fr(g, x, GYD + 6, 1, H - GYD, '#1c2438');
      g.globalAlpha = 0.35; fr(g, 0, GYD - 3, W, 3, '#25e0d0'); g.globalAlpha = 0.18; fr(g, 0, GYD - 6, W, 3, '#25e0d0'); g.globalAlpha = 1;
      for (let x = 16; x < W; x += 32) { fr(g, x, GYD + 10, 2, 2, '#4a5878'); }
    } else if (key === 'moon') {
      for (let i = 0; i < 9; i++) { const x = (20 + R() * 340) * S | 0, w = (4 + R() * 6) * S | 0, y = GYD + 12 + (R() * 28 | 0); g.fillStyle = '#5a5a64'; g.beginPath(); g.ellipse(x, y, w, w * 0.32, 0, 0, 7); g.fill(); g.strokeStyle = '#b4b4be'; g.lineWidth = 1; g.beginPath(); g.ellipse(x, y - 1, w, w * 0.32, 0, Math.PI, Math.PI * 2); g.stroke(); }
    } else {
      for (let i = 0; i < 24; i++) { const x = R() * W | 0, y = GYD + 8 + (R() * 50 | 0), r = 2 + (R() * 3 | 0); disc(g, x, y, r, dark(L.gnd, 0.2)); disc(g, x - 1, y - 1, Math.max(1, r - 1), lite(L.gnd, 0.1)); }
    }

    // 6. 거리 눈금(대포에서 10 m 간격: 계산할 때 쓰는 자) · 높이 눈금
    for (let d = 10; d <= 50; d += 10) {
      const x = Math.round(toPx(C.CANNON_X + d) * S);
      fr(g, x, GYD, 2, 5 * S, '#ffffffcc'); numD(g, d, x - (String(d).length * 2 - 1) * S + 1, GYD + 7 * S, '#ffffffee');
    }
    for (let hgt = 10; hgt <= 30; hgt += 10) {
      const py = Math.round(toPy(hgt) * S); for (let x = 0; x < W; x += 6 * S) fr(g, x, py, 2 * S, 1, '#ffffff33');
      numD(g, hgt, W - 12 * S, py - 6 * S, '#ffffffbb');
    }
    return cv;
  }

  // ---------- 논리 좌표(반 칸 단위) 그리기 도우미 ----------
  const q = v => Math.round(v * S) / S;
  const rect = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(q(x), q(y), w, h); };
  function ball(g, cx, cy, r, col, hi, sh) {                    // 논리 좌표 원(음영 포함)
    g.fillStyle = sh || dark(col, 0.35); for (let dy = -r; dy <= r; dy += 1 / S) { const hw = Math.sqrt(Math.max(0, r * r - dy * dy)); g.fillRect(q(cx - hw), q(cy + dy), q(hw * 2) || 1 / S, 1 / S); }
    g.fillStyle = col; for (let dy = -r; dy <= r - 0.5; dy += 1 / S) { const hw = Math.sqrt(Math.max(0, r * r - dy * dy)) - 0.5; if (hw > 0) g.fillRect(q(cx - hw - 0.25), q(cy + dy), q(hw * 2 + 0.25) || 1 / S, 1 / S); }
    if (hi !== false) { g.fillStyle = hi || lite(col, 0.55); g.fillRect(q(cx - r * 0.5), q(cy - r * 0.55), Math.max(1 / S, r * 0.45), Math.max(1 / S, r * 0.3)); }
  }
  function bar(g, x0, y0, ang, len, th, col, hi, sh) {            // 막대(포신·활대): 본체 + 윗면 하이라이트 + 아랫면 그림자
    const c = Math.cos(ang), s = Math.sin(ang), ux = -s, uy = -c, st = 1 / S;
    for (let i = 0; i <= len; i += st) {
      const x = x0 + c * i, y = y0 - s * i;
      g.fillStyle = col; g.fillRect(q(x - th / 2), q(y - th / 2), th, th);
      if (th >= 2 && hi) { g.fillStyle = hi; g.fillRect(q(x + ux * th * 0.28 - th * 0.14), q(y + uy * th * 0.28 - th * 0.14), th * 0.3, th * 0.3); }
      if (th >= 2 && sh) { g.fillStyle = sh; g.fillRect(q(x - ux * th * 0.32 - th * 0.14), q(y - uy * th * 0.32 - th * 0.14), th * 0.3, th * 0.3); }
    }
  }

  // ---------- 무기(시대별) ----------
  function drawWeapon(g, era, angDeg, qSign) {
    const ox = toPx(C.CANNON_X), oy = toPy(C.MUZZLE_Y), a = angDeg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    if (era === 0) {                                              // 나무 투석기
      rect(g, ox - 8, oy + 1, 16, 2, '#6a4524'); rect(g, ox - 8, oy + 1, 16, 0.5, '#9a6b3a'); rect(g, ox - 8, oy + 2.5, 16, 0.5, '#3a2616');
      [[-6, '#6a4524'], [4, '#6a4524'], [-8, '#8a5a30']].forEach(([dx, col]) => { rect(g, ox + dx, oy + 3, 2, 8, col); rect(g, ox + dx, oy + 3, 0.5, 8, lite(col, 0.25)); });
      rect(g, ox - 7, oy + 7, 14, 1, '#4a3018');
      bar(g, ox, oy, a, 12, 2, '#6a4524', '#9a6b3a', '#3a2616');
      const tx = ox + c * 12, ty = oy - s * 12; ball(g, tx, ty, 2, '#9a9a8c', '#d8d8c8', '#5e5e52');
    } else if (era === 1) {                                       // 활
      rect(g, ox - 7, oy + 1, 14, 2, '#9a6b3a'); rect(g, ox - 7, oy + 1, 14, 0.5, '#c8924e'); rect(g, ox - 5, oy + 3, 2, 8, '#6a4524'); rect(g, ox + 3, oy + 3, 2, 8, '#6a4524');
      const mx = ox + c * 7, my = oy - s * 7, pa = a + Math.PI / 2;
      bar(g, ox, oy, a, 11, 1, '#9a6b3a'); bar(g, mx, my, pa, 5.5, 1, '#d89a3a', '#f0c070'); bar(g, mx, my, pa + Math.PI, 5.5, 1, '#d89a3a', '#f0c070');
      const e1 = [mx + Math.cos(pa) * 5.5, my - Math.sin(pa) * 5.5], e2 = [mx - Math.cos(pa) * 5.5, my + Math.sin(pa) * 5.5], pull = [ox - c * 2, oy + s * 2];
      g.strokeStyle = '#f0e8d0'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(e1[0] + .25, e1[1] + .25); g.lineTo(pull[0] + .25, pull[1] + .25); g.lineTo(e2[0] + .25, e2[1] + .25); g.stroke();
      bar(g, pull[0], pull[1], a, 14, 0.5, '#f4ecd8'); rect(g, ox + c * 12, oy - s * 12 - 0.5, 1.5, 1.5, '#d89a3a'); rect(g, pull[0], pull[1] - 1, 1, 0.5, '#c0483a');
    } else if (era === 2) {                                       // 대포
      [ox - 6, ox + 4].forEach(wx => { ball(g, wx + 0.5, oy + 7, 4.5, '#8a5a30', '#b5804a', '#3a2412'); ball(g, wx + 0.5, oy + 7, 2.5, '#5a3a1e', false, '#3a2412'); rect(g, wx - 0.5, oy + 6.5, 2, 1, '#aab4c2'); rect(g, wx + 0.25, oy + 2.5, 0.5, 9, '#4a3018'); rect(g, wx - 4, oy + 6.75, 9, 0.5, '#4a3018'); });
      rect(g, ox - 9, oy + 3, 14, 3, '#6a4524'); rect(g, ox - 9, oy + 3, 14, 0.5, '#9a6b3a');
      bar(g, ox, oy, a, 13, 4, '#363a44', '#6a7080', '#1a1c22');
      [3, 10].forEach(i => bar(g, ox + c * i - s * 0, oy - s * i, a + Math.PI / 2, 2.6, 0.9, '#5a606c')); ball(g, ox, oy, 2.4, '#aab4c2', '#e8eef8', '#6a7080');
      const tx = ox + c * 13, ty = oy - s * 13; ball(g, tx, ty, 2.4, '#454a54', '#8a92a0', '#1a1c22');
    } else {                                                      // 레일건
      rect(g, ox - 8, oy + 3, 16, 8, '#364458'); rect(g, ox - 8, oy + 3, 16, 1, '#8a98b0'); rect(g, ox - 8, oy + 10, 16, 1, '#1c2634'); rect(g, ox - 4, oy + 6, 8, 2, '#25e0d0'); rect(g, ox - 7, oy + 4.5, 0.5, 0.5, '#aab8d0'); rect(g, ox + 6, oy + 4.5, 0.5, 0.5, '#aab8d0');
      g.globalAlpha = 0.3; rect(g, ox - 5, oy + 5, 10, 4, '#25e0d0'); g.globalAlpha = 1;
      bar(g, ox, oy, a, 14, 3, '#aab8d0', '#e8f0ff', '#5a6a88');
      for (let i = 2; i < 13; i += 4) bar(g, ox + c * i, oy - s * i, a, 1, 3.4, '#25e0d0');
      const tx = ox + c * 14, ty = oy - s * 14, col = qSign < 0 ? '#4aa8ff' : '#ff5a6a';
      g.globalAlpha = 0.3; ball(g, tx, ty, 3, col, false); g.globalAlpha = 1; ball(g, tx, ty, 1.5, col, '#ffffff');
    }
    const pe = SP.makeHi('person', era, false, true);
    g.drawImage(pe, Math.round(ox - 20), GY - pe.lh, pe.lw, pe.lh);
  }

  // ---------- 탄(시대별) ----------
  function drawBall(g, b, era) {
    const p = b.p, x = toPx(p.x), y = toPy(p.y);
    const n = b.trail.length;
    b.trail.forEach(([tx, ty], i) => {
      const k = (i + 1) / n; g.globalAlpha = 0.12 + 0.4 * k;
      if (era === 3) { const col = b.sign < 0 ? '#4aa8ff' : '#ff5a6a'; ball(g, toPx(tx), toPy(ty), 0.6 + 0.9 * k, col, false, col); } else { rect(g, toPx(tx) - 0.5, toPy(ty) - 0.5, 1, 1, '#ffffff'); }
    }); g.globalAlpha = 1;
    if (era === 0) ball(g, x, y, 1.6, '#9a9a8c', '#e0e0d0', '#5e5e52');
    else if (era === 1) { const a = Math.atan2(p.vy, p.vx); bar(g, x - Math.cos(a) * 3.5, y + Math.sin(a) * 3.5, a, 7, 0.5, '#f4ecd8'); rect(g, x + Math.cos(a) * 3.2 - 0.5, y - Math.sin(a) * 3.2 - 0.5, 1.5, 1.5, '#d89a3a'); rect(g, x - Math.cos(a) * 3.5 - 0.5, y + Math.sin(a) * 3.5 - 1, 1, 0.5, '#c0483a'); rect(g, x - Math.cos(a) * 3.5 - 0.5, y + Math.sin(a) * 3.5 + 0.5, 1, 0.5, '#c0483a'); }
    else if (era === 2) ball(g, x, y, 2.2, '#2c2f36', '#aab4c2', '#101216');
    else { const col = b.sign < 0 ? '#4aa8ff' : '#ff5a6a'; g.globalAlpha = 0.18; ball(g, x, y, 4.5, col, false, col); g.globalAlpha = 0.35; ball(g, x, y, 3, col, false, col); g.globalAlpha = 1; ball(g, x, y, 1.7, col, '#ffffff', col); }
  }

  // ---------- 과녁 ----------
  function drawDummy(g, e, era) {
    const x = toPx(e.x), y = toPy(e.cy), A = SP.PAL[era].A;
    if (e.kind === 'balloon') {
      const r = e.w * PX / 2, body = e.flash > 0 ? '#ffffff' : '#e8334a', hi = e.flash > 0 ? '#ffffff' : '#ff8a98';
      rect(g, x - 0.25, y + r, 0.5, 14, '#e8e0c8'); rect(g, x - 1.5, y + r - 0.5, 3, 1.5, '#b82238');
      ball(g, x, y, r, body, hi, '#a01c2e'); return;
    }
    const half = e.h * PX / 2;
    rect(g, x - 1, y + half - 1, 3, GY - (y + half) + 1, '#6a4524'); rect(g, x - 1, y + half - 1, 0.75, GY - (y + half) + 1, '#9a6b3a');
    ball(g, x, y, half + 1, e.armor ? A : '#8a5a30', e.armor ? lite(A, 0.4) : '#b5804a', '#3a2412');
    [['#ffffff', 0.78], ['#e8334a', 0.6], ['#ffffff', 0.42], ['#e8334a', 0.25], ['#ffffff', 0.1]].forEach(([c, k]) => ball(g, x, y, Math.max(0.6, half * k), e.flash > 0 ? '#ffe08a' : c, false, e.flash > 0 ? '#ffe08a' : c));
    if (e.armor) [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([dx, dy]) => { ball(g, x + dx * (half - 0.2), y + dy * (half - 0.2), 0.7, '#2c2f36', '#8a92a0'); });
  }

  VD.art = { makeBackground, drawWeapon, drawBall, drawDummy, S };
})(window);
