/* game.js — 게임 엔진: 상태·충돌·점수·그리기. 화면(DOM)은 ui.js 가 맡고, 여기서는 hooks 로만 알린다. */
(function (root) {
  'use strict';
  const VD = root.VD, C = VD.C, P = VD.physics, SP = VD.sprites;
  const PX = C.PXM, GY = C.GROUND_PX;
  const toPx = x => x * PX, toPy = y => GY - y * PX;

  const S = SP.HS;                                          // 그림 해상도 배율: 캔버스는 (논리 크기 × S) 장치 픽셀
  const q = v => Math.round(v * S) / S;
  const rect = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(q(x), q(y), w, h); };

  // ---------- 게임 본체 ----------
  class Game {
    constructor(canvas, hooks) {
      this.cv = canvas; canvas.width = C.CW * S; canvas.height = C.CH * S; this.g = canvas.getContext('2d'); this.g.imageSmoothingEnabled = false;
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
      this.bg = VD.art.makeBackground(stage, this.era);
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
      g.setTransform(S, 0, 0, S, 0, 0); g.imageSmoothingEnabled = false;
      g.save();
      if (this.shake > 0) g.translate(Math.round((Math.random() - 0.5) * 3 * S) / S, Math.round((Math.random() - 0.5) * 3 * S) / S);
      g.drawImage(this.bg, 0, 0, C.CW, C.CH);
      this.drawField(g, time);
      this.drawWind(g, time);
      const v = SP.villageHi(era); g.drawImage(v, 0, GY - v.lh + 1, v.lw, v.lh);
      VD.art.drawWeapon(g, era, this.aim.angle, this.aim.sign);
      this.drawPreview(g);
      if (this.ghost) { g.fillStyle = 'rgba(255,255,255,0.35)'; this.ghost.forEach(([x, y], i) => { if (i % 2 === 0) g.fillRect(q(toPx(x)), q(toPy(y)), 1, 1); }); }
      for (const e of this.enemies) (e.type === 'dummy' ? VD.art.drawDummy(g, e, era) : this.drawEnemy(g, e, time));
      for (const b of this.balls) VD.art.drawBall(g, b, era);
      for (const q2 of this.parts) { g.fillStyle = q2.col; g.fillRect(q(q2.x), q(q2.y), 1.5, 1.5); }
      g.restore();
    }

    drawEnemy(g, e, time) {
      const d = VD.ENEMY[e.type], c = this.enemyBox(e);
      const name = e.type === 'eagle' ? 'eagle' + (Math.floor(time * 5) % 2) : e.type;
      const sp = SP.makeHi(name, this.era, false, e.armor);
      const bob = e.type === 'eagle' ? 0 : (Math.floor(e.age * 6) % 2) * 0.5;
      const x = q(toPx(e.x) - sp.lw / 2), y = e.type === 'eagle' ? q(toPy(c.y) - sp.lh / 2) : GY - sp.lh - bob + 1;
      if (e.type !== 'eagle') { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(q(x + 1), GY, sp.lw - 2, 1); }                    // 그림자
      g.drawImage(sp, x, y, sp.lw, sp.lh);
      if (e.maxhp > 1) for (let i = 0; i < e.maxhp; i++) { g.fillStyle = '#10162c'; g.fillRect(q(x + sp.lw / 2 - e.maxhp * 2 + i * 4 - 0.5), y - 4.5, 4, 3); g.fillStyle = i < e.hp ? '#e8334a' : '#444'; g.fillRect(q(x + sp.lw / 2 - e.maxhp * 2 + i * 4), y - 4, 3, 2); }
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
