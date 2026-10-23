/* game.js — 게임 엔진: 상태·충돌·점수·그리기. 화면(DOM)은 ui.js 가 맡고, 여기서는 hooks 로만 알린다. */
(function (root) {
  'use strict';
  const VD = root.VD, C = VD.C, P = VD.physics, SP = VD.sprites;
  const PX = C.PXM, GY = C.GROUND_PX;
  const toPx = x => x * PX, toPy = y => GY - y * PX;

  // 3×5 숫자 글꼴(거리 눈금용)
  const DIG = { 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001',
    5: '111100111001111', 6: '111100111101111', 7: '111001001001001', 8: '111101111101111', 9: '111101111001111' };
  function drawNum(g, str, x, y, col) {
    g.fillStyle = col;
    for (const ch of String(str)) {
      const m = DIG[ch];
      if (m) for (let i = 0; i < 15; i++) if (m[i] === '1') g.fillRect(x + (i % 3), y + (i / 3 | 0), 1, 1);
      x += 4;
    }
  }
  function rnd(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const rect = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };

  // ---------- 배경 (스테이지마다 한 번 그려 둔다) ----------
  const LOOK = {
    era0: { sky: ['#7ec4ee', '#bfe3f6'], mtn: ['#8fb0c8', '#6f9a86'], gnd: '#6fae4a', gnd2: '#4f8a34', edge: '#8fce5c' },
    era1: { sky: ['#e9a468', '#fbe0b0'], mtn: ['#b98a6a', '#8a6a4a'], gnd: '#b8955a', gnd2: '#96763e', edge: '#d4b074' },
    era2: { sky: ['#6f869e', '#b6c4d2'], mtn: ['#7a8896', '#566472'], gnd: '#6a7d5a', gnd2: '#4e5f42', edge: '#86996f' },
    era3: { sky: ['#0e0828', '#3a1d6a'], mtn: ['#2a2058', '#1c1640'], gnd: '#3a4560', gnd2: '#27304a', edge: '#25e0d0' },
    moon: { sky: ['#03040a', '#0a0c18'], mtn: ['#5a5a66', '#42424c'], gnd: '#8a8a92', gnd2: '#6e6e78', edge: '#b4b4be' },
    mars: { sky: ['#c9794a', '#f0c294'], mtn: ['#a8503a', '#7e3a2a'], gnd: '#b4573a', gnd2: '#8f4230', edge: '#cf7450' },
    jupiter: { sky: ['#a8582e', '#e6c496'], mtn: ['#9a5a3a', '#7a4630'], gnd: '#d4a070', gnd2: '#b07a4e', edge: '#ecc496' },
  };
  function makeBackground(stage, era) {
    const key = stage.body || 'era' + era, L = LOOK[key];
    const cv = document.createElement('canvas'); cv.width = C.CW; cv.height = C.CH;
    const g = cv.getContext('2d'), R = rnd(stage.id.charCodeAt(0) * 31 + stage.id.charCodeAt(2));
    // 하늘: 가로 띠(도트 느낌)
    const bands = 12;
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1), a = L.sky[0], b = L.sky[1];
      const mix = k => Math.round(parseInt(a.substr(k, 2), 16) * (1 - t) + parseInt(b.substr(k, 2), 16) * t);
      rect(g, 0, i * (GY / bands), C.CW, Math.ceil(GY / bands), '#' + [1, 3, 5].map(k => mix(k).toString(16).padStart(2, '0')).join(''));
    }
    if (key === 'moon' || key === 'era3') {                  // 별
      for (let i = 0; i < 70; i++) rect(g, R() * C.CW | 0, R() * 120 | 0, 1, 1, R() < 0.2 ? '#ffffff' : '#8a90b8');
    }
    if (key === 'moon') {                                    // 지구
      rect(g, 300, 24, 22, 22, '#2c6fd0'); rect(g, 302, 22, 18, 26, '#2c6fd0'); rect(g, 298, 28, 26, 14, '#2c6fd0');
      rect(g, 304, 28, 6, 5, '#4aa860'); rect(g, 312, 36, 5, 4, '#4aa860'); rect(g, 306, 24, 10, 2, '#e8f0ff');
    }
    if (key === 'mars') { rect(g, 60, 34, 7, 7, '#d8c8b0'); rect(g, 300, 56, 4, 4, '#b8a890'); }
    if (key === 'jupiter') {                                 // 거대한 띠무늬 행성
      const cx = 290, cy = 78, r = 62;
      for (let y = -r; y <= r; y++) { const hw = Math.round(Math.sqrt(r * r - y * y)); const bandc = ['#c8905a', '#e8c89a', '#a86a3e', '#d8ae80'][(Math.floor((y + r) / 9)) % 4]; rect(g, cx - hw, cy + y, hw * 2, 1, bandc); }
      rect(g, cx - 18, cy + 14, 14, 8, '#a8402a');
    }
    if (key === 'era0' || key === 'era1') {                  // 구름
      for (let i = 0; i < 5; i++) { const x = 20 + R() * 330 | 0, y = 14 + R() * 60 | 0, w = 14 + R() * 18 | 0; rect(g, x, y, w, 3, '#fff'); rect(g, x + 3, y - 2, w - 7, 2, '#fff'); }
    }
    // 먼 산(두 겹)
    [0, 1].forEach(layer => {
      let h = 20 + layer * 6, v = 0;
      g.fillStyle = L.mtn[layer];
      for (let x = 0; x < C.CW; x += 2) {
        v += (R() - 0.5) * 3; v *= 0.93; h = Math.max(10, Math.min(52, h + v + (layer ? 0.1 : -0.05)));
        const top = GY - 10 - h - (layer ? 0 : 22) | 0;
        g.fillRect(x, top, 2, GY - top);
      }
    });
    if (key === 'era3') {                                    // 도시 스카이라인
      for (let x = 0; x < C.CW; x += 9) { const hh = 14 + R() * 38 | 0; rect(g, x, GY - hh - 6, 8, hh, '#161036'); for (let k = 0; k < hh / 6; k++) if (R() < 0.5) rect(g, x + 2 + (R() * 3 | 0), GY - hh - 3 + k * 6, 1, 2, R() < 0.5 ? '#25e0d0' : '#ff5ab4'); }
    }
    // 땅
    rect(g, 0, GY, C.CW, C.CH - GY, L.gnd); rect(g, 0, GY, C.CW, 2, L.edge);
    for (let i = 0; i < 160; i++) rect(g, R() * C.CW | 0, GY + 3 + (R() * (C.CH - GY - 4) | 0), 2, 1, L.gnd2);
    if (key === 'moon') for (let i = 0; i < 9; i++) { const x = 20 + R() * 340 | 0, w = 8 + R() * 10 | 0; rect(g, x, GY + 5 + (R() * 10 | 0), w, 2, L.gnd2); }
    if (key === 'era3') for (let x = 0; x < C.CW; x += 16) rect(g, x, GY + 2, 1, C.CH - GY, '#1c2438');
    // 거리 눈금: 대포에서 10 m 간격 (계산할 때 쓰는 자)
    for (let d = 10; d <= 50; d += 10) {
      const px = toPx(C.CANNON_X + d);
      rect(g, px, GY, 1, 5, '#ffffffcc'); drawNum(g, d, px - (String(d).length * 2 - 1), GY + 7, '#ffffffdd');
    }
    // 높이 눈금(오른쪽 끝, 10 m 간격)
    for (let hgt = 10; hgt <= 30; hgt += 10) {
      const py = toPy(hgt); for (let x = 0; x < C.CW; x += 6) rect(g, x, py, 2, 1, '#ffffff33');
      drawNum(g, hgt, C.CW - 12, py - 6, '#ffffffaa');
    }
    return cv;
  }

  // ---------- 무기(시대별) ----------
  function line(g, x0, y0, ang, len, th, col) {
    g.fillStyle = col;
    for (let i = 0; i <= len; i++) g.fillRect(Math.round(x0 + Math.cos(ang) * i - th / 2), Math.round(y0 - Math.sin(ang) * i - th / 2), th, th);
  }
  function drawWeapon(g, era, angDeg, qSign) {
    const ox = toPx(C.CANNON_X), oy = toPy(C.MUZZLE_Y), a = angDeg * Math.PI / 180;
    // 받침
    if (era === 0) { rect(g, ox - 8, oy + 1, 16, 2, '#6a4524'); rect(g, ox - 6, oy + 3, 2, 8, '#6a4524'); rect(g, ox + 4, oy + 3, 2, 8, '#6a4524'); rect(g, ox - 8, oy + 3, 2, 8, '#8a5a30'); }
    else if (era === 1) { rect(g, ox - 7, oy + 1, 14, 2, '#9a6b3a'); rect(g, ox - 5, oy + 3, 2, 8, '#6a4524'); rect(g, ox + 3, oy + 3, 2, 8, '#6a4524'); }
    else if (era === 2) { rect(g, ox - 9, oy + 3, 14, 3, '#6a4524'); [ox - 6, ox + 4].forEach(wx => { rect(g, wx - 3, oy + 3, 7, 8, '#4a3018'); rect(g, wx - 2, oy + 4, 5, 6, '#8a5a30'); rect(g, wx, oy + 6, 1, 2, '#2c2f36'); }); }
    else { rect(g, ox - 8, oy + 3, 16, 8, '#364458'); rect(g, ox - 8, oy + 3, 16, 1, '#8a98b0'); rect(g, ox - 4, oy + 6, 8, 2, '#25e0d0'); }
    // 포신
    if (era === 0) {
      line(g, ox, oy, a, 12, 2, '#6a4524'); const tx = ox + Math.cos(a) * 12, ty = oy - Math.sin(a) * 12;
      rect(g, tx - 2, ty - 2, 4, 4, '#9a9a8c'); rect(g, tx - 1, ty - 1, 2, 2, '#c8c8b8');
    } else if (era === 1) {
      line(g, ox, oy, a, 11, 1, '#9a6b3a');
      const mx = ox + Math.cos(a) * 7, my = oy - Math.sin(a) * 7, pa = a + Math.PI / 2;
      line(g, mx, my, pa, 5, 1, '#d89a3a'); line(g, mx, my, pa + Math.PI, 5, 1, '#d89a3a');
      const e1x = mx + Math.cos(pa) * 5, e1y = my - Math.sin(pa) * 5, e2x = mx - Math.cos(pa) * 5, e2y = my + Math.sin(pa) * 5;
      g.strokeStyle = '#f0e8d0'; g.lineWidth = 1; g.beginPath(); g.moveTo(e1x + .5, e1y + .5); g.lineTo(ox - Math.cos(a) * 2 + .5, oy + Math.sin(a) * 2 + .5); g.lineTo(e2x + .5, e2y + .5); g.stroke();
      line(g, ox, oy, a, 12, 1, '#f4ecd8'); rect(g, ox + Math.cos(a) * 12 - 1, oy - Math.sin(a) * 12 - 1, 2, 2, '#d89a3a');
    } else if (era === 2) {
      line(g, ox, oy, a, 13, 4, '#2c2f36'); line(g, ox, oy, a, 13, 2, '#454a54');
      const tx = ox + Math.cos(a) * 12, ty = oy - Math.sin(a) * 12; rect(g, tx - 2, ty - 2, 4, 4, '#aab4c2');
      rect(g, ox - 2, oy - 2, 4, 4, '#aab4c2');
    } else {
      line(g, ox, oy, a, 14, 3, '#aab8d0');
      for (let i = 2; i < 13; i += 4) line(g, ox + Math.cos(a) * i, oy - Math.sin(a) * i, a, 1, 3, '#25e0d0');
      const tx = ox + Math.cos(a) * 14, ty = oy - Math.sin(a) * 14; rect(g, tx - 1, ty - 1, 3, 3, qSign < 0 ? '#4aa8ff' : '#ff5a6a');
    }
    // 사수
    const pe = SP.make('person', era, false, true);
    g.drawImage(pe, Math.round(ox - 20), GY - pe.height);
  }

  // ---------- 게임 본체 ----------
  class Game {
    constructor(canvas, hooks) {
      this.cv = canvas; this.g = canvas.getContext('2d'); this.g.imageSmoothingEnabled = false;
      this.hooks = hooks || {}; this.running = false; this.acc = 0; this.last = 0;
      this.aim = { angle: 45, speed: 15, sign: 1 };
      canvas.addEventListener('pointerdown', e => this._drag(e, true));
      canvas.addEventListener('pointermove', e => { if (this.dragging) this._drag(e); });
      window.addEventListener('pointerup', () => { this.dragging = false; });
    }
    start(stage, opt) {
      const W = VD.WORLDS[stage.world - 1], mission = opt && opt.mission;
      Object.assign(this, { stage, world: W, era: W.era, env: stage.env, t: 0, hp: stage.hp, maxHp: stage.hp, ammo: stage.ammo,
        shots: 0, kills: 0, score: 0, enemies: [], balls: [], parts: [], ghost: null, cool: 0,
        spawnIdx: 0, over: false, paused: false, dragging: false, shake: 0, uid: 0,
        phase: mission ? 'mission' : 'combat', mShots: 0 });
      if (mission) for (const t of mission.targets) this.enemies.push({ id: ++this.uid, type: 'dummy', kind: t.kind, x: t.x, cy: t.cy, w: t.w, h: t.h, armor: !!t.armor, hp: 1e9, maxhp: 1, speed: 0, age: 0, flash: 0 });
      this.total = stage.spawns.length;
      this.bg = makeBackground(stage, this.era);
      this.aim = { angle: stage.lockAngle || stage.angle.init, speed: stage.lockSpeed || stage.v.init, sign: 1 };
      this.running = true; this.last = performance.now(); this.acc = 0;
      this.hooks.hud && this.hooks.hud(this);
      requestAnimationFrame(ts => this.loop(ts));
    }
    stop() { this.running = false; }
    beginCombat() {                                           // 연습(미션)을 마치고 전투 시작: 과녁 치우고 시계·탄을 새로
      this.enemies = this.enemies.filter(e => e.type !== 'dummy'); this.balls = []; this.ghost = null;
      this.phase = 'combat'; this.t = 0; this.spawnIdx = 0; this.cool = 0.3; this.ammo = this.stage.ammo;
      this.hooks.hud && this.hooks.hud(this);
    }
    setPaused(p) { this.paused = p; }
    setAim(a) {
      const s = this.stage;
      if (a.angle != null && !s.lockAngle) this.aim.angle = Math.max(s.angle.min, Math.min(s.angle.max, a.angle));
      if (a.speed != null && !s.lockSpeed) this.aim.speed = Math.max(s.v.min, Math.min(s.v.max, a.speed));
      if (a.sign != null) this.aim.sign = a.sign;
    }
    _drag(e, start) {
      if (!this.running || this.over) return;
      const r = this.cv.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width * C.CW, py = (e.clientY - r.top) / r.height * C.CH;
      const dx = (px - toPx(C.CANNON_X)) / PX, dy = (toPy(C.MUZZLE_Y) - py) / PX;
      if (start && Math.hypot(dx, dy) > 30) return;            // 대포 근처에서 시작한 끌기만 조준
      this.dragging = true;
      const s = this.stage, ang = Math.atan2(dy, Math.max(dx, 0.01)) * 180 / Math.PI;
      const sp = s.v.min + (s.v.max - s.v.min) * Math.min(1, Math.hypot(dx, dy) / 30);
      this.setAim({ angle: Math.round(ang), speed: Math.round(sp) });
      this.hooks.aim && this.hooks.aim(this.aim);
    }
    qm() { const c = this.stage.charge; return c ? this.aim.sign * c.q / c.m : 0; }

    fire() {
      const mis = this.phase === 'mission';
      if (this.over || this.paused || this.cool > 0 || (!mis && this.ammo <= 0)) return false;
      const a = this.aim, p = P.launch(C.CANNON_X, C.MUZZLE_Y, a.speed, a.angle, this.qm());
      if (mis) this.mShots++; else { this.ammo--; this.shots++; }
      this.cool = mis ? 0.4 : 0.5;
      this.balls.push({ p, t: 0, trail: [], path: [[p.x, p.y]], angle: a.angle, speed: a.speed, sign: a.sign, maxY: p.y, ft: 0, inF: false, enter: null, exit: null });
      const ox = toPx(C.CANNON_X) + Math.cos(a.angle * Math.PI / 180) * 12, oy = toPy(C.MUZZLE_Y) - Math.sin(a.angle * Math.PI / 180) * 12;
      for (let i = 0; i < 6; i++) this.parts.push({ x: ox, y: oy, vx: (Math.random() - 0.3) * 30 + Math.cos(a.angle * Math.PI / 180) * 20, vy: -(Math.random() - 0.3) * 30, life: 0.25, col: this.era === 3 ? '#25e0d0' : '#e8e0c8' });
      this.shake = 0.08;
      this.hooks.hud && this.hooks.hud(this);
      return true;
    }

    loop(ts) {
      if (!this.running) return;
      const dt = Math.min(0.05, (ts - this.last) / 1000); this.last = ts;
      if (!this.paused && !this.over) {
        const fast = this.phase === 'combat' && this.ammo <= 0 && !this.balls.length ? 3 : 1;
        this.acc += dt * fast;
        while (this.acc >= C.DT) { this.update(C.DT); this.acc -= C.DT; }
      }
      this.updateParts(dt);
      this.render(ts / 1000);
      requestAnimationFrame(t => this.loop(t));
    }

    enemyBox(e) { return { x: e.x, y: e.type === 'dummy' ? e.cy : e.type === 'eagle' ? e.alt + 0.6 * Math.sin(e.age * 2) : VD.ENEMY[e.type].h / 2 }; }

    update(dt) {
      this.cool = Math.max(0, this.cool - dt);
      if (this.phase === 'mission') {                         // 연습: 과녁만 있고 적·시간 제한 없음
        for (const e of this.enemies) { e.age += dt; e.flash = Math.max(0, e.flash - dt); }
        for (const b of this.balls) this.stepBall(b, dt);
        this.balls = this.balls.filter(b => !b.end); return;
      }
      this.t += dt;
      const sp = this.stage.spawns;
      while (this.spawnIdx < sp.length && sp[this.spawnIdx].t <= this.t) {
        const s = sp[this.spawnIdx++], d = VD.ENEMY[s.type];
        this.enemies.push({ id: ++this.uid, type: s.type, x: C.SPAWN_X, speed: s.speed, armor: !!s.armor, alt: s.alt || 0, hp: d.hp, maxhp: d.hp, age: 0 });
      }
      for (const e of this.enemies) {
        e.age += dt; e.x -= e.speed * dt;
        if (e.x <= C.BASE_X && !e.done) {
          e.done = true; this.hp--; this.shake = 0.25;
          const b = this.enemyBox(e); this.burst(toPx(C.BASE_X), toPy(b.y), '#e8334a', 8);
          this.hooks.float && this.hooks.float('마을 피해!', C.BASE_X, b.y + 3, 'bad');
          this.hooks.hud && this.hooks.hud(this);
        }
      }
      this.enemies = this.enemies.filter(e => !e.done && !e.dead);
      for (const b of this.balls) this.stepBall(b, dt);
      this.balls = this.balls.filter(b => !b.end);
      if (this.hp <= 0) return this.finish(false);
      if (this.spawnIdx >= sp.length && !this.enemies.length && !this.balls.length) this.finish(true);
    }

    stepBall(b, dt) {
      const p = b.p; b.t += dt;
      P.step(p, this.env, dt);
      if (p.y > b.maxY) b.maxY = p.y;
      const f = this.env.field;
      if (f && b.p.qm) {                                      // 평행판 구역 출입(들어갈 때·나올 때 속도 기록)
        const inside = p.x >= f.x0 && p.x <= f.x1 && p.y >= f.y0 && p.y <= f.y1;
        const snap = () => ({ vx: p.vx, vy: p.vy, speed: Math.hypot(p.vx, p.vy), ang: Math.atan2(p.vy, p.vx) * 180 / Math.PI });
        if (inside) b.ft += dt;
        if (inside && !b.inF) b.enter = snap(); else if (!inside && b.inF) b.exit = snap();
        b.inF = inside;
      }
      if (((b.t * 60) | 0) !== (((b.t - dt) * 60) | 0)) { b.path.push([p.x, p.y]); b.trail.push([p.x, p.y]); if (b.trail.length > 9) b.trail.shift(); }
      for (const e of this.enemies) {
        if (e.dead) continue;
        const dummy = e.type === 'dummy', d = dummy ? e : VD.ENEMY[e.type], c = this.enemyBox(e), r = C.BALL_R;
        if (Math.abs(p.x - e.x) <= d.w / 2 + r && Math.abs(p.y - c.y) <= d.h / 2 + r) {
          const ang = Math.atan2(-p.vy, Math.abs(p.vx)) * 180 / Math.PI;
          const tinfo = dummy ? { kind: e.kind, ascending: p.vy > 0, descDeg: ang, t: b.t } : null;
          if (e.armor) {
            if (!(p.vy < 0 && ang >= C.ARMOR_DEG)) {
              this.burst(toPx(p.x), toPy(p.y), '#ffe08a', 7);
              this.hooks.float && this.hooks.float(p.vy < 0 ? '튕겨냄! (' + Math.round(ang) + '°)' : '튕겨냄!', p.x, p.y + 3, 'bad');
              return this.endBall(b, 'bounce', tinfo && Object.assign(tinfo, { bounce: true }));
            }
          }
          if (dummy) {
            e.flash = 0.25; this.burst(toPx(p.x), toPy(p.y), '#ffe08a', 8);
            this.hooks.float && this.hooks.float('명중!', e.x, c.y + 3, 'good');
            return this.endBall(b, 'target', Object.assign(tinfo, { hit: true }));
          }
          e.hp--;
          this.burst(toPx(p.x), toPy(p.y), this.era === 3 ? '#25e0d0' : '#e8334a', 6);
          if (e.hp <= 0) {
            e.dead = true; this.kills++;
            const pts = 100 * d.hp + (e.armor ? 50 : 0); this.score += pts;
            this.burst(toPx(e.x), toPy(c.y), '#ffe08a', 12);
            this.hooks.float && this.hooks.float('+' + pts, e.x, c.y + 3, 'good');
          } else this.hooks.float && this.hooks.float('명중!', e.x, c.y + 3, 'good');
          return this.endBall(b, 'hit');
        }
      }
      if (p.y <= 0) { this.burst(toPx(p.x), GY - 1, '#d8c8a0', 5); return this.endBall(b, 'ground'); }
      if (p.x > 70 || p.x < -6 || p.y > 90 || b.t > 40) return this.endBall(b, 'out');
    }

    endBall(b, how, target) {
      b.end = true; const p = b.p, d = p.x - C.CANNON_X;
      this.ghost = b.path.slice();
      const g = this.env.g;
      this.hooks.shot && this.hooks.shot({ how, range: d, time: b.t, angle: b.angle, speed: b.speed, sign: b.sign, apex: b.maxY, target: target || null,
        vac: g > 0 ? P.vacuumRange(b.speed, b.angle, C.MUZZLE_Y, g) : null, earth: P.vacuumRange(b.speed, b.angle, C.MUZZLE_Y, 10),
        field: b.p.qm ? { time: b.ft, enter: b.enter, exit: b.exit } : null });
      this.hooks.hud && this.hooks.hud(this);
    }

    burst(x, y, col, n) { for (let i = 0; i < n; i++) this.parts.push({ x, y, vx: (Math.random() - 0.5) * 70, vy: -Math.random() * 60 - 10, life: 0.4 + Math.random() * 0.3, col }); }
    updateParts(dt) {
      this.shake = Math.max(0, (this.shake || 0) - dt);
      for (const q of this.parts) { q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 160 * dt; }
      this.parts = this.parts.filter(q => q.life > 0);
    }

    finish(win) {
      if (this.over) return; this.over = true;
      const s = this.stage, full = this.hp === this.maxHp;
      const hpBonus = win ? this.hp * 150 : 0, ammoBonus = win ? this.ammo * 30 : 0;
      const total = win ? this.score + hpBonus + ammoBonus : 0;
      const stars = win ? 1 + (full ? 1 : 0) + (this.shots <= s.par ? 1 : 0) : 0;
      const res = { win, stars, score: total, shots: this.shots, par: s.par, kills: this.kills, total: this.total, hp: this.hp,
        parts: { kills: this.score, hp: hpBonus, ammo: ammoBonus } };
      setTimeout(() => this.hooks.end && this.hooks.end(res), win ? 700 : 900);
    }

    // ---------- 그리기 ----------
    render(time) {
      const g = this.g, era = this.era;
      g.save();
      if (this.shake > 0) g.translate(Math.round((Math.random() - 0.5) * 3), Math.round((Math.random() - 0.5) * 3));
      g.drawImage(this.bg, 0, 0);
      this.drawField(g, time);
      this.drawWind(g, time);
      const v = SP.village(era); g.drawImage(v, 0, GY - v.height + 1);
      drawWeapon(g, era, this.aim.angle, this.aim.sign);
      this.drawPreview(g);
      if (this.ghost) { g.fillStyle = 'rgba(255,255,255,0.35)'; this.ghost.forEach(([x, y], i) => { if (i % 2 === 0) g.fillRect(Math.round(toPx(x)), Math.round(toPy(y)), 1, 1); }); }
      for (const e of this.enemies) (e.type === 'dummy' ? this.drawDummy(g, e) : this.drawEnemy(g, e, time));
      for (const b of this.balls) this.drawBall(g, b);
      for (const q of this.parts) { g.fillStyle = q.col; g.fillRect(Math.round(q.x), Math.round(q.y), 2, 2); }
      g.restore();
    }

    drawDummy(g, e) {
      const x = Math.round(toPx(e.x)), y = Math.round(toPy(e.cy)), A = SP.PAL[this.era].A;
      if (e.kind === 'balloon') {
        const r = Math.round(e.w * PX / 2);
        rect(g, x, y + r, 1, 14, '#e8e0c8');
        for (let dy = -r; dy <= r; dy++) { const hw = Math.round(Math.sqrt(r * r - dy * dy)); rect(g, x - hw, y + dy, hw * 2 + 1, 1, e.flash > 0 ? '#fff' : (dy < -r / 3 ? '#ff6a7a' : '#e8334a')); }
        rect(g, x - r / 2, y - r / 2, 2, 2, '#ffd0d6'); return;
      }
      const hs = Math.round(e.h * PX / 2), half = hs;
      rect(g, x - 1, y + hs - 1, 3, GY - (y + hs) + 1, '#6a4524');               // 받침대
      rect(g, x - half, y - half, half * 2, half * 2, e.armor ? (SP.PAL[this.era].A) : '#8a5a30');
      const ring = [['#fff', 0.8], ['#e8334a', 0.62], ['#fff', 0.44], ['#e8334a', 0.26], ['#fff', 0.1]];
      ring.forEach(([c, k]) => { const h = Math.max(1, Math.round(half * k)); rect(g, x - h, y - h, h * 2, h * 2, e.flash > 0 ? '#ffe08a' : c); });
      if (e.armor) { [[-half, -half], [half - 2, -half], [-half, half - 2], [half - 2, half - 2]].forEach(([dx, dy]) => rect(g, x + dx, y + dy, 2, 2, '#2c2f36')); }
    }
    drawEnemy(g, e, time) {
      const d = VD.ENEMY[e.type], c = this.enemyBox(e);
      const name = e.type === 'eagle' ? 'eagle' + (Math.floor(time * 5) % 2) : e.type;
      const sp = SP.make(name, this.era, false, e.armor);
      const bob = e.type === 'eagle' ? 0 : Math.floor(e.age * 6) % 2;
      const x = Math.round(toPx(e.x) - sp.width / 2), y = e.type === 'eagle' ? Math.round(toPy(c.y) - sp.height / 2) : GY - sp.height - bob + 1;
      g.drawImage(sp, x, y);
      if (e.maxhp > 1) for (let i = 0; i < e.maxhp; i++) { g.fillStyle = i < e.hp ? '#e8334a' : '#444'; g.fillRect(x + sp.width / 2 - e.maxhp * 2 + i * 4, y - 4, 3, 2); }
    }
    drawBall(g, b) {
      const p = b.p, x = toPx(p.x), y = toPy(p.y), era = this.era;
      if (era === 3) { g.fillStyle = 'rgba(255,255,255,0.25)'; b.trail.forEach(([tx, ty], i) => g.fillRect(Math.round(toPx(tx)), Math.round(toPy(ty)), 1, 1)); }
      else { g.fillStyle = 'rgba(255,255,255,0.4)'; b.trail.forEach(([tx, ty]) => g.fillRect(Math.round(toPx(tx)), Math.round(toPy(ty)), 1, 1)); }
      if (era === 0) { rect(g, x - 1, y - 1, 3, 3, '#9a9a8c'); rect(g, x, y, 1, 1, '#d8d8c8'); }
      else if (era === 1) { const a = Math.atan2(p.vy, p.vx); line(g, x - Math.cos(a) * 3, y + Math.sin(a) * 3, a, 6, 1, '#f4ecd8'); rect(g, x + Math.cos(a) * 3, y - Math.sin(a) * 3, 1, 1, '#d89a3a'); }
      else if (era === 2) { rect(g, x - 2, y - 1, 4, 3, '#2c2f36'); rect(g, x - 1, y - 2, 2, 5, '#2c2f36'); rect(g, x - 1, y - 1, 1, 1, '#aab4c2'); }
      else { const col = b.sign < 0 ? '#4aa8ff' : '#ff5a6a'; g.fillStyle = col + '55'; g.fillRect(Math.round(x - 3), Math.round(y - 3), 6, 6); rect(g, x - 1, y - 1, 3, 3, col); rect(g, x, y, 1, 1, '#fff'); }
    }
    drawPreview(g) {
      const pv = this.stage.preview; if (!pv || pv.mode === 'none' || this.over) return;
      const a = this.aim, env = this.env;
      g.fillStyle = pv.mode === 'vacuum' ? 'rgba(255,255,255,0.45)' : 'rgba(255,240,140,0.9)';
      if (pv.mode === 'vacuum') {
        for (let i = 1; i <= pv.dots; i++) {
          const q = P.vacuumPoint(C.CANNON_X, C.MUZZLE_Y, a.speed, a.angle, env.g, i * 0.1);
          if (q.y < 0) break; g.fillRect(Math.round(toPx(q.x)) - 1, Math.round(toPy(q.y)) - 1, 2, 2);
        }
      } else {
        const pts = P.trace(P.launch(C.CANNON_X, C.MUZZLE_Y, a.speed, a.angle, this.qm()), env, { dt: 1 / 60, tmax: pv.dots * 0.1 + 0.05 });
        for (let i = 6; i < pts.length; i += 6) { const q = pts[i]; if (q.y < 0) break; g.fillRect(Math.round(toPx(q.x)) - 1, Math.round(toPy(q.y)) - 1, 2, 2); }
      }
    }
    drawField(g, time) {
      const f = this.env.field; if (!f) return;
      const full = f.x0 < 0 && f.x1 > C.FIELD_W + 5;
      const x0 = full ? 0 : toPx(f.x0), x1 = full ? C.CW : toPx(f.x1), y0 = full ? 0 : toPy(f.y1), y1 = toPy(Math.max(f.y0, 0));
      if (!full) { g.fillStyle = 'rgba(80,220,255,0.13)'; g.fillRect(x0, y0, x1 - x0, y1 - y0); }
      // 전기장 화살표(방향 표시)
      const dirx = Math.sign(f.ex), diry = Math.sign(f.ey), off = (time * 14) % 24;
      g.fillStyle = full ? 'rgba(255,255,255,0.35)' : 'rgba(150,240,255,0.7)';
      for (let x = x0 + 12; x < x1 - 6; x += 24) for (let y = y0 + 14; y < y1 - 6; y += 24) {
        const ax = x + (dirx ? ((off * dirx) % 24) : 0), ay = y + (diry ? ((-off * diry) % 24) : 0);
        if (ax < x0 || ax > x1 - 4 || ay < y0 + 3 || ay > y1 - 3) continue;
        if (dirx) { g.fillRect(Math.round(ax) - 2 * dirx, Math.round(ay), 5, 1); g.fillRect(Math.round(ax) + 2 * dirx, Math.round(ay) - 1, 1, 3); }
        if (diry) { g.fillRect(Math.round(ax), Math.round(ay) - 2 * -diry, 1, 5); g.fillRect(Math.round(ax) - 1, Math.round(ay) + 2 * -diry, 3, 1); }
      }
      if (!full && diry) {                                    // 평행판: E가 위(+y)를 향하면 아래판이 +, 위판이 −
        const top = diry > 0 ? '−' : '+', bot = diry > 0 ? '+' : '−';
        [[y0, top], [y1 - 3, bot]].forEach(([py, sg]) => {
          rect(g, x0, py, x1 - x0, 3, sg === '+' ? '#ff5a6a' : '#4aa8ff');
          for (let x = x0 + 4; x < x1 - 3; x += 8) { rect(g, x, py + 1, 3, 1, '#fff'); if (sg === '+') rect(g, x + 1, py, 1, 3, '#fff'); }
        });
      }
    }
    drawWind(g, time) {
      const w = this.env.wind; if (!w) return;
      [toPx(22), toPx(46)].forEach(x => {
        rect(g, x, GY - 14, 1, 14, '#6a4524');
        const len = Math.round(3 + Math.abs(w) * 1.6), dir = Math.sign(w);
        for (let i = 0; i < len; i++) { const wy = Math.round(Math.sin(time * 6 + i * 0.6) * (1 + i * 0.1)); rect(g, x + 1 + (dir > 0 ? i : -i - 1), GY - 14 + wy, 1, 4 - (i > len * 0.6 ? 2 : 0), '#e8334a'); }
      });
    }
  }

  VD.Game = Game;
})(window);
