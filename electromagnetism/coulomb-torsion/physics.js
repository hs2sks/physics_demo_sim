// 쿨롱 비틀림 저울 물리 모델 (DOM·Three.js 없음 → node로 검증 가능)
// 각도는 라디안, 길이 m, 전하 C, 시간 s.
export const K_E = 8.9875517923e9;          // 쿨롱 상수
export const L = 0.105;                     // 바늘 중심~구 중심 거리
export const BALL_R = 0.0045;               // 골심(pith) 구 반지름
export const KAPPA = 1.0e-7;                // 은 도선의 비틀림 상수 (N·m/rad)
export const T0 = 4.0;                      // 전하 없는 바늘의 비틀림 진동 주기(s)
export const I_NEEDLE = KAPPA * T0 * T0 / (4 * Math.PI * Math.PI);   // 바늘 관성모멘트
export const ZETA = 0.12;                   // 공기 저항에 의한 감쇠비
export const C_DAMP = 2 * ZETA * Math.sqrt(KAPPA * I_NEEDLE);
export const TAU_LEAK = 600;                // 전하 누설 시간상수(s)
export const THETA0 = 2 * Math.asin(BALL_R / L);   // 두 구가 닿을 때 중심 사이 각 (≈4.9°)
export const THETA_MAX = Math.PI;
/** 모델 요인 스위치(오차 토론에서 하나씩 꺼 본다) */
export const flags = { tangent:true, leak:true };
const proj = th => flags.tangent ? Math.cos(th / 2) : 1;

export const deg = r => r * 180 / Math.PI;
export const rad = d => d * Math.PI / 180;
/** 두 구 중심 사이 거리(현) */
export const chord = th => 2 * L * Math.sin(th / 2);
/** 서로 밀어내는 힘 */
export const coulombForce = (qn, qp, th) => K_E * qn * qp / (chord(th) ** 2);

/** 새 실험 상태 */
export function createState() {
  return { theta: THETA0, omega: 0, alpha: 0, qn: 0, qp: 0, t: 0, probeIn: true };
}

/** 바늘이 받는 알짜 토크: 도선 복원 + 전기 반발(원호 접선 성분 F·L·cos(θ/2)) − 감쇠 */
function torque(s, th, om) {
  const twist = th - THETA0 + s.alpha;              // 도선 위·아래 끝의 각도 차
  let tau = -KAPPA * twist - C_DAMP * om;
  if (s.probeIn) tau += coulombForce(s.qn, s.qp, th) * L * proj(th);
  return tau;
}

/** 시간 dt(s)만큼 진행. 반암시적 오일러, 내부 간격 ≤ 2ms. 탐침과 닿으면 θ0에서 막힘. */
export function step(s, dt) {
  const n = Math.max(1, Math.ceil(dt / 0.002)), h = dt / n;
  const leak = flags.leak ? Math.exp(-h / TAU_LEAK) : 1;
  for (let i = 0; i < n; i++) {
    s.omega += torque(s, s.theta, s.omega) / I_NEEDLE * h;
    s.theta += s.omega * h;
    if (s.probeIn && s.theta < THETA0) { s.theta = THETA0; if (s.omega < 0) s.omega = 0; }
    if (s.theta > THETA_MAX) { s.theta = THETA_MAX; if (s.omega > 0) s.omega = 0; }
    s.qn *= leak; s.qp *= leak; s.t += h;
  }
}

/** 정적 평형각(이분법). 전하가 없거나 반발이 약하면 탐침에 닿은 θ0. */
export function equilibrium(s) {
  const g = th => -KAPPA * (th - THETA0 + s.alpha) + (s.probeIn ? coulombForce(s.qn, s.qp, th) * L * proj(th) : 0);
  if (!s.probeIn) return THETA0 - s.alpha;
  if (g(THETA0) <= 0) return THETA0;
  let a = THETA0, b = THETA_MAX;
  if (g(b) > 0) return b;
  for (let i = 0; i < 80; i++) { const m = (a + b) / 2; if (g(m) > 0) a = m; else b = m; }
  return (a + b) / 2;
}

/** "바로 안정": 정적 평형으로 보내고, 측정에 걸리는 시간(sec)만큼 전하만 누설시킨다. */
export function settle(s, waitSec = 10) {
  s.theta = equilibrium(s); s.omega = 0;
  const leak = flags.leak ? Math.exp(-waitSec / TAU_LEAK) : 1;
  s.qn *= leak; s.qp *= leak; s.t += waitSec;
  s.theta = equilibrium(s);
}

/** 거의 정지했는지 (각속도 < 0.05°/s, 그리고 평형각 근처) */
export function isSteady(s) {
  return Math.abs(deg(s.omega)) < 0.05 && Math.abs(deg(s.theta - equilibrium(s))) < 0.15;
}

// ----- 조작 -----
/** 대전체를 탐침구에 닿게 해 전하를 준다 */
export function chargeProbe(s, q = 1.0e-9) { s.qp = q; }
/** 탐침구를 바늘 구에 닿게 해 전하를 똑같이 나눈다 (닿아 있을 때만) */
export function shareCharge(s) {
  if (!s.probeIn || deg(s.theta - THETA0) > 1.5) return false;
  const q = (s.qn + s.qp) / 2; s.qn = s.qp = q; return true;
}
/** 같은 크기의 중성 구와 탐침구를 접촉시켜 탐침구 전하를 절반으로 */
export function halveProbeCharge(s) { s.qp /= 2; }

/** 눈금을 읽는 정밀도(0.5°). 쿨롱도 눈금 사이를 눈대중으로 읽었다. */
export const readAngle = th => Math.round(deg(th) * 2) / 2;

/** 비틀림 진동 시험: 탐침을 빼고 바늘을 θ0+amp 만큼 돌려 놓았다 놓는다 */
export function startOscillation(s, ampDeg) {
  s.probeIn = false; s.qn = s.qp = 0; s.alpha = 0;
  s.theta = THETA0 + rad(ampDeg); s.omega = 0; s.t = 0;
}

/** 최소제곱 직선 y = a + b x */
export function linfit(xs, ys) {
  const n = xs.length; if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); syy += (ys[i] - my) ** 2; }
  if (sxx === 0) return null;
  const b = sxy / sxx; return { a: my - b * mx, b, r2: syy ? sxy * sxy / (sxx * syy) : 1 };
}

/** 한 번의 측정을 기록 형태로 만든다 (눈금을 읽은 값 기준) */
export function makeRow(s, tag, round = true) {
  const alphaRead = round ? Math.round(deg(s.alpha)) : deg(s.alpha), thetaRead = round ? readAngle(s.theta) : deg(s.theta);
  const Theta = alphaRead + thetaRead - deg(THETA0);                 // 총 비틀림각(°)
  const r = chord(rad(thetaRead)) * 100;                              // 거리(cm)
  return { tag, alpha: alphaRead, theta: thetaRead, Theta, r, Tr2: Theta * r * r };
}

/** 같은 α 순서로 실험을 다시 돌려 본다(오차 요인을 끄고 켜 보는 용도). 앱의 흐름과 같게 대전→접촉→8초 후 시작. */
export function replay(alphasDeg, opt = {}) {
  const o = { leak:true, tangent:true, round:true, wait:10, ...opt };
  const save = { ...flags }; flags.leak = o.leak; flags.tangent = o.tangent;
  const st = createState(); chargeProbe(st, 1.0e-9); shareCharge(st); settle(st, 8);
  const rows = [];
  for (const a of alphasDeg) { st.alpha = rad(a); settle(st, o.wait); rows.push(makeRow(st, 'q', o.round)); }
  Object.assign(flags, save);
  const q = rows.filter(r => r.Theta > 0);
  return { rows, fit:linfit(q.map(r => Math.log(r.r)), q.map(r => Math.log(r.Theta))) };
}
