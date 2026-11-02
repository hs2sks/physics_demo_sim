// 캐번디시 비틀림 저울 물리 모델 (DOM·Three.js 없음 → node로 검증 가능)
// SI 단위: 길이 m, 질량 kg, 각도 rad, 시간 s. 팔 끝 위치는 mm로 읽는다.
export const G_TRUE = 6.6743e-11;           // 모델 안의 '진짜' G (학생은 모르는 값)
export const ELL = 0.9144;                  // 회전축~작은 공 중심 (팔 길이 6피트의 절반)
export const M_SMALL = 0.73;                // 작은 납공 (1.61 lb)
export const M_BIG = 158;                   // 큰 납공 (348 lb)
export const R0 = 0.225;                    // 큰 공–작은 공 중심 거리(팔이 비틀리지 않았을 때, 8.85 in)
export const M_ROD = 0.2;                   // 나무 막대 질량(교육용 가정)
export const I_ARM = 2 * M_SMALL * ELL ** 2 + M_ROD * (2 * ELL) ** 2 / 12;   // 팔의 관성모멘트
export const T0 = 420;                      // 큰 공이 없을 때 비틀림 진동 주기(약 7분)
export const KAPPA = 4 * Math.PI ** 2 * I_ARM / T0 ** 2;       // 도선의 비틀림 상수
export const ZETA = 0.015;                  // 감쇠비(작아서 오래 흔들린다)
export const C_DAMP = 2 * ZETA * Math.sqrt(KAPPA * I_ARM);
export const PSI = 2 * Math.asin(R0 / (2 * ELL));              // 큰 공 위치각(팔 방향 기준)
export const G_EARTH = 9.80665, R_EARTH = 6.371e6;
export const MOVE_TIME = 40;                // 큰 공을 옮기는 데 걸리는 시간(s)
export const BEAM_AWAY = Math.PI / 2;       // 큰 공을 치워 둔 틀의 각(팔과 수직, 토크 0)
export const BEAM_A = PSI, BEAM_B = Math.PI - PSI;   // 위치 A, B (B는 틀이 같은 방향으로 더 돌아 팔 반대쪽에 온 상태)
/** 오차 요인 스위치 */
export const flags = { drift:true, read:true };
export const READ_RES = 0.05;               // 눈금 읽기 정밀도(mm)
export const DRIFT_MAX = 0.3;               // 영점 표류 최대 속도(mm/h)

export const mm = th => th * ELL * 1000;    // 팔 끝 위치(mm) ← 비틀린 각
export const toRad = x => x / (ELL * 1000);

/** 새 실험 상태. beam: 큰 공 틀의 각(A=PSI, 치워 둠=π/2, B=π−PSI) */
export function createState(driftRate) {
  const dr = driftRate !== undefined ? driftRate : (Math.random() * 2 - 1) * DRIFT_MAX;
  return { th:0, om:0, t:0, beam:BEAM_AWAY, beamFrom:BEAM_AWAY, beamTo:BEAM_AWAY, beamT:1e9, drift:dr, pos:'none' };
}

/** 틀의 현재 각(코사인 곡선으로 부드럽게 이동) */
function beamAngle(s) {
  const u = Math.min(1, Math.max(0, s.beamT / MOVE_TIME));
  return s.beamFrom + (s.beamTo - s.beamFrom) * (0.5 - 0.5 * Math.cos(Math.PI * u));
}
export function moveBeam(s, where) {
  const to = where === 'A' ? BEAM_A : where === 'B' ? BEAM_B : BEAM_AWAY;
  s.beamFrom = s.beam; s.beamTo = to; s.beamT = 0; s.pos = where;
}
export const moving = s => s.beamT < MOVE_TIME;

/** 큰 공 두 개가 팔에 주는 알짜 토크 (네 쌍의 인력을 모두 계산) */
export function gravTorque(th, beam) {
  let tau = 0;
  for (const sa of [0, Math.PI]) {                    // 작은 공 두 개
    const sx = ELL * Math.cos(sa + th), sy = ELL * Math.sin(sa + th);
    for (const ba of [beam, Math.PI + beam]) {        // 큰 공 두 개
      const bx = ELL * Math.cos(ba), by = ELL * Math.sin(ba);
      const dx = bx - sx, dy = by - sy, d2 = dx * dx + dy * dy, d = Math.sqrt(d2);
      const F = G_TRUE * M_BIG * M_SMALL / d2;
      tau += sx * (F * dy / d) - sy * (F * dx / d);   // r × F (z성분)
    }
  }
  return tau;
}

/** 영점 표류(열 대류·도선의 느린 변형을 흉내) */
export const zeroShift = s => flags.drift ? toRad(s.drift / 3600 * s.t) : 0;

/** 시간 dt(s) 진행. 내부 간격 ≤ 1s */
export function step(s, dt) {
  const n = Math.max(1, Math.ceil(dt)), h = dt / n;
  for (let i = 0; i < n; i++) {
    s.beamT += h; s.beam = beamAngle(s);
    const tau = gravTorque(s.th, s.beam) - KAPPA * (s.th - zeroShift(s)) - C_DAMP * s.om;
    s.om += tau / I_ARM * h; s.th += s.om * h; s.t += h;
  }
}

/** 팔 끝 눈금 읽기(mm) */
export const readMM = (s, round = true) => {
  const x = mm(s.th); return (round && flags.read) ? Math.round(x / READ_RES) * READ_RES : x;
};

/** 정적 평형(표류 제외): κθ = τ(θ). 불동점 반복 */
export function equilibrium(beam) {
  let th = 0;
  for (let i = 0; i < 60; i++) th = gravTorque(th, beam) / KAPPA;
  return th;
}

/** 진동 시험: 큰 공을 치우고 팔을 amp(mm)만큼 밀어 놓았다 놓는다 */
export function startOscillation(s, ampMM) {
  s.beam = s.beamFrom = s.beamTo = BEAM_AWAY; s.beamT = 1e9; s.pos = 'none';
  s.th = toRad(ampMM); s.om = 0; s.t = 0;
}

/** 연속한 세 극점(x1,x2,x3)에서 평형 위치 추정 — 감쇠 진동의 중심 */
export const eqFromTurns = (x1, x2, x3) => ((x1 + x3) / 2 + x2) / 2;

/** 측정값 → G.  Δx: 위치 A와 B의 평형 위치 차(mm), κ: 도선의 비틀림 상수 */
export function gFromDelta(dxMM, kappa) {
  const theta = (dxMM / 1000) / (2 * ELL);                  // 한쪽 평형각
  const tau = kappa * theta;                                 // 도선이 버티는 토크
  const F = tau / (2 * ELL);                                 // 공 한 개가 받는 인력
  return { theta, tau, F, G: F * R0 ** 2 / (M_BIG * M_SMALL) };
}
export const earthMass = G => G_EARTH * R_EARTH ** 2 / G;
export const earthDensity = G => 3 * G_EARTH / (4 * Math.PI * G * R_EARTH);   // kg/m³

/** 최소제곱 평균과 표준오차 */
export function meanSE(a) {
  const n = a.length, m = a.reduce((x, y) => x + y, 0) / n;
  const sd = n > 1 ? Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (n - 1)) : 0;
  return { m, se: n > 1 ? sd / Math.sqrt(n) : 0 };
}

/** 한 번의 '위치 평형' 측정을 자동으로 흉내: 틀을 옮기고 극점 3개를 읽어 평형을 추정 */
export function measureAt(s, where) {
  moveBeam(s, where);
  step(s, MOVE_TIME + 60);
  const xs = []; let prev = s.om, guard = 0;
  while (xs.length < 3 && guard++ < 4000) {
    step(s, 1);
    if ((prev > 0 && s.om <= 0) || (prev < 0 && s.om >= 0)) xs.push(readMM(s));
    prev = s.om;
  }
  return eqFromTurns(...xs);
}

/** 같은 순서(A,B,A,B…)로 실험을 처음부터 다시 돌려 G를 구한다 (오차 토론용) */
export function replay(nPairs = 2, opt = {}) {
  const save = { ...flags }; flags.drift = opt.drift ?? true; flags.read = opt.read ?? true;
  const s = createState(opt.driftRate ?? 0.1);
  const seq = []; for (let i = 0; i < nPairs; i++) seq.push('A', 'B');
  const xs = seq.map(w => measureAt(s, w));
  const Gs = [];
  for (let i = 0; i + 1 < xs.length; i++) Gs.push(gFromDelta(Math.abs(xs[i] - xs[i + 1]), KAPPA).G);
  Object.assign(flags, save);
  return { xs, Gs, G: Gs.reduce((a, b) => a + b, 0) / Gs.length };
}
