/* physics.js — 투사체 운동(중력·공기저항·바람·전기장). 브라우저와 node 양쪽에서 쓴다.
   env = { g, k, wind, field:{x0,x1,y0,y1,ex,ey}|null }   p = { x, y, vx, vy, qm }
   공기저항: a = -k·|v-w|·(v-w) (속력 제곱에 비례), 전기장 안에서 a += (q/m)·E */
(function (root) {
  'use strict';
  const VD = root.VD = root.VD || {};

  function accel(p, env, out) {
    const rx = p.vx - (env.wind || 0), ry = p.vy, k = env.k || 0;
    const sp = Math.hypot(rx, ry);
    let ax = -k * sp * rx;
    let ay = -env.g - k * sp * ry;
    const f = env.field;
    if (f && p.qm && p.x >= f.x0 && p.x <= f.x1 && p.y >= f.y0 && p.y <= f.y1) {
      ax += p.qm * f.ex;
      ay += p.qm * f.ey;
    }
    out[0] = ax; out[1] = ay;
  }

  const _a1 = [0, 0], _a2 = [0, 0], _a3 = [0, 0], _a4 = [0, 0];
  function step(p, env, dt) {            // RK4 한 걸음
    const q = { x: p.x, y: p.y, vx: p.vx, vy: p.vy, qm: p.qm };
    accel(q, env, _a1);
    const k1x = p.vx, k1y = p.vy, k1ax = _a1[0], k1ay = _a1[1];
    q.x = p.x + k1x * dt / 2; q.y = p.y + k1y * dt / 2; q.vx = p.vx + k1ax * dt / 2; q.vy = p.vy + k1ay * dt / 2;
    accel(q, env, _a2);
    const k2x = q.vx, k2y = q.vy, k2ax = _a2[0], k2ay = _a2[1];
    q.x = p.x + k2x * dt / 2; q.y = p.y + k2y * dt / 2; q.vx = p.vx + k2ax * dt / 2; q.vy = p.vy + k2ay * dt / 2;
    accel(q, env, _a3);
    const k3x = q.vx, k3y = q.vy, k3ax = _a3[0], k3ay = _a3[1];
    q.x = p.x + k3x * dt; q.y = p.y + k3y * dt; q.vx = p.vx + k3ax * dt; q.vy = p.vy + k3ay * dt;
    accel(q, env, _a4);
    const k4x = q.vx, k4y = q.vy, k4ax = _a4[0], k4ay = _a4[1];
    p.x += dt / 6 * (k1x + 2 * k2x + 2 * k3x + k4x);
    p.y += dt / 6 * (k1y + 2 * k2y + 2 * k3y + k4y);
    p.vx += dt / 6 * (k1ax + 2 * k2ax + 2 * k3ax + k4ax);
    p.vy += dt / 6 * (k1ay + 2 * k2ay + 2 * k3ay + k4ay);
  }

  function launch(mx, my, v, angleDeg, qm) {
    const a = angleDeg * Math.PI / 180;
    return { x: mx, y: my, vx: v * Math.cos(a), vy: v * Math.sin(a), qm: qm || 0 };
  }

  // 지면(y=0)에 닿거나 화면 밖으로 나갈 때까지 궤적 점 목록(미리보기·검증용)
  function trace(p0, env, opt) {
    opt = opt || {};
    const dt = opt.dt || 1 / 120, tmax = opt.tmax || 30, xmax = opt.xmax || 70;
    const p = { x: p0.x, y: p0.y, vx: p0.vx, vy: p0.vy, qm: p0.qm };
    const pts = [{ t: 0, x: p.x, y: p.y, vx: p.vx, vy: p.vy }];
    for (let t = 0; t < tmax; t += dt) {
      step(p, env, dt);
      pts.push({ t: t + dt, x: p.x, y: p.y, vx: p.vx, vy: p.vy });
      if (p.y < 0 || p.x > xmax || p.x < -5) break;
    }
    return pts;
  }

  // 공기저항·바람·전기장이 없을 때의 이론 궤적(점선 안내선, 사거리 비교용)
  function vacuumPoint(mx, my, v, angleDeg, g, t) {
    const a = angleDeg * Math.PI / 180;
    return { x: mx + v * Math.cos(a) * t, y: my + v * Math.sin(a) * t - 0.5 * g * t * t };
  }
  function vacuumRange(v, angleDeg, h0, g) {       // 발사 높이 h0에서 지면까지의 수평 거리
    const a = angleDeg * Math.PI / 180, vy = v * Math.sin(a);
    const t = (vy + Math.sqrt(vy * vy + 2 * g * h0)) / g;
    return { range: v * Math.cos(a) * t, time: t, apex: h0 + vy * vy / (2 * g) };
  }

  VD.physics = { accel, step, launch, trace, vacuumPoint, vacuumRange };
  if (typeof module !== 'undefined') module.exports = VD.physics;
})(typeof window !== 'undefined' ? window : globalThis);
