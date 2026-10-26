/* 자유 조립 실험실 (저항의 직렬·병렬) — 건전지·스위치·저항·전류계·전압계를 끌어다 놓고 도선으로 직접 연결한다.
 * 1) 엔진(FreeLabEngine): 도선으로 묶인 단자 → 마디, 마디 전압법으로 회로 전체를 한 번에 푼다. DOM 없음(node로 시험 가능).
 * 2) 화면: SVG 보드, 부품 끌기, 단자→단자 도선(끌기 또는 두 번 탭), 아날로그·디지털 계기, 기록표.
 * index.html의 #freeLab 컨테이너와 #tabs 탭 줄에 붙는다. 다른 탭의 코드는 건드리지 않는다. */
(function (root) {
  'use strict';

  /* ================= 부품 정의 ================= */
  const T2 = { a: { x: -70, y: 0, d: [-1, 0] }, b: { x: 70, y: 0, d: [1, 0] } };
  const TD = { a: { x: -70, y: 0, d: [-1, 0] }, k: { x: 70, y: 0, d: [1, 0] } };
  const TOP2 = { '+': { x: -40, y: -58, d: [0, -1] }, '-': { x: 40, y: -58, d: [0, -1] } };
  const TERMS = {
    res: T2, cap: T2, coil: T2, bulb: T2, diode: TD, led: TD,
    sw: { a: { x: -60, y: 0, d: [-1, 0] }, b: { x: 60, y: 0, d: [1, 0] } },
    sw2: { c: { x: -60, y: 0, d: [-1, 0] }, t1: { x: 60, y: -26, d: [1, 0] }, t2: { x: 60, y: 26, d: [1, 0] } },
    pot: { a: { x: -70, y: 0, d: [-1, 0] }, w: { x: 0, y: -56, d: [0, -1] }, b: { x: 70, y: 0, d: [1, 0] } },
    bat: TOP2, acv: TOP2,
    mtr: { '+': { x: -35, y: 100, d: [0, 1] }, '-': { x: 35, y: 100, d: [0, 1] } }
  };
  const termsOf = p => TERMS[p.type.startsWith('amm') || p.type.startsWith('vm') ? 'mtr' : p.type];
  const isA = p => p.type === 'ammA' || p.type === 'ammD';
  const isV = p => p.type === 'vmA' || p.type === 'vmD';
  const isAnalog = p => p.type === 'ammA' || p.type === 'vmA';
  const RANGES = { A: [0.03, 0.3, 3], V: [3, 15] };
  const CELL_E = 1.5, CELL_R = 0.3, R_SW = 0.005, R_RATED_W = 0.25, R_AC = 1;
  const E_NOMINAL = [10, 20, 30, 47, 68, 100, 150, 200, 330, 470, 680, 1000, 2200];
  const CAP_UF = [10, 47, 100, 220, 470, 1000, 4700], COIL_MH = [10, 50, 100, 500, 1000];
  const POT_R = [47, 100, 470, 1000, 10000], FREQS = [10, 50, 100, 500, 1000];
  const R_COIL_DCR = 10, COIL_MAX_A = 0.5;   // 코일 권선 저항 10 Ω, 허용 전류 0.5 A
  const BULBS = [{ n: '2.5 V 0.3 A', v: 2.5, i: 0.3 }, { n: '3.8 V 0.3 A', v: 3.8, i: 0.3 }, { n: '6 V 0.5 A', v: 6, i: 0.5 }];
  const LEDS = [{ n: '빨강', vf: 1.9, c: '#ff3b30' }, { n: '노랑', vf: 2.0, c: '#ffd400' }, { n: '초록', vf: 2.1, c: '#2ecc71' }, { n: '파랑', vf: 3.0, c: '#4aa3ff' }];
  const LED_MAX_A = 0.05, DIODE_MAX_A = 1.5;
  const diodeSpec = p => p.type === 'led' ? { vf: LEDS[p.col || 0].vf, rd: 10 } : { vf: 0.7, rd: 1 };

  function rangeOf(p) { return (isA(p) ? RANGES.A : RANGES.V)[p.range || 0]; }
  function meterR(p) {            // 전류계: 풀스케일에서 0.1 V 강하, 전압계: 아날로그 1 kΩ/V, 디지털 1 MΩ
    const r = rangeOf(p);
    if (isA(p)) return 0.1 / r;
    return isAnalog(p) ? 1000 * r : 1e6;
  }
  function resActual(p) { return p.nom * (1 + (p.tol || 0)); }
  const rd = r => (r.disp !== undefined ? r.disp : r.reading);   // 계기가 보여 주는 값(교류에서는 평균·실효값)

  /* ================= 엔진 ================= */
  function solveOnce(parts, wires, c) {
    const idx = new Map(), names = [];
    parts.forEach(p => Object.keys(termsOf(p)).forEach(t => { idx.set(p.id + '.' + t, names.length); names.push(p.id + '.' + t); }));
    const uf = names.map((_, i) => i);
    const find = i => { while (uf[i] !== i) { uf[i] = uf[uf[i]]; i = uf[i]; } return i; };
    wires.forEach(w => { const a = idx.get(w.a), b = idx.get(w.b); if (a !== undefined && b !== undefined) uf[find(a)] = find(b); });
    const nodeId = new Map(); let n = 0;
    const node = key => { const r = find(idx.get(key)); if (!nodeId.has(r)) nodeId.set(r, n++); return nodeId.get(r); };
    names.forEach(k => node(k));

    const dt = c.dt, dyn = c.dyn, tr = dt && c.m === 'tr', els = [], src = new Array(n).fill(0);
    const st = p => (dyn && dyn[p.id]) || { v: 0, i: 0 };
    const add = (p, a, b, g, extra) => els.push(Object.assign({ p, a, b, g }, extra));
    parts.forEach(p => {
      const nd = t => node(p.id + '.' + t);
      switch (p.type) {
        case 'res': add(p, nd('a'), nd('b'), 1 / (c.ideal ? p.nom : resActual(p))); break;
        case 'bulb': { const B = BULBS[p.bt || 0]; add(p, nd('a'), nd('b'), p.blown ? 0 : B.i / B.v); break; }
        case 'pot': {
          const R = Math.max(1, p.nom), x = Math.min(1, Math.max(0, p.pos == null ? 0.5 : p.pos));
          add(p, nd('a'), nd('w'), 1 / Math.max(0.01, R * x), { seg: 'aw' }); add(p, nd('w'), nd('b'), 1 / Math.max(0.01, R * (1 - x)), { seg: 'wb' }); break;
        }
        case 'sw': add(p, nd('a'), nd('b'), p.closed ? 1 / (c.ideal ? 1e-6 : R_SW) : 0); break;
        case 'sw2': add(p, nd('c'), nd(p.pos === 2 ? 't2' : 't1'), 1 / (c.ideal ? 1e-6 : R_SW)); break;
        case 'bat': {
          const a = nd('+'), b = nd('-'), e = CELL_E * p.cells, r = c.ideal ? 1e-4 : CELL_R * p.cells;
          add(p, a, b, 1 / r, { e, r }); src[a] += e / r; src[b] -= e / r; break;
        }
        case 'acv': {
          const a = nd('+'), b = nd('-'), e = p.amp * Math.sin(2 * Math.PI * p.f * (c.t || 0)), r = c.ideal ? 1e-4 : R_AC;
          add(p, a, b, 1 / r, { e, r }); src[a] += e / r; src[b] -= e / r; break;
        }
        case 'cap': {
          const a = nd('a'), b = nd('b'), s = st(p);
          if (dt) { const g = (tr ? 2 : 1) * p.c * 1e-6 / dt, j = g * s.v + (tr ? s.i : 0); add(p, a, b, g, { vp: s.v, ip: s.i }); src[a] += j; src[b] -= j; }
          else add(p, a, b, 0, { vp: s.v, ip: 0 });
          break;
        }
        case 'coil': {
          const a = nd('a'), b = nd('b'), s = st(p);
          if (dt) {
            const Ls = p.l * 1e-3 / dt;
            if (tr) { const g = 1 / (2 * Ls + R_COIL_DCR), ieq = g * (s.v + (2 * Ls - R_COIL_DCR) * s.i); add(p, a, b, g, { ieq }); src[a] -= ieq; src[b] += ieq; }
            else { const g = 1 / (R_COIL_DCR + Ls), ieq = g * Ls * s.i; add(p, a, b, g, { ieq }); src[a] -= ieq; src[b] += ieq; }
          } else add(p, a, b, 1 / R_COIL_DCR, { ieq: 0 });
          break;
        }
        case 'diode': case 'led': {
          const a = nd('a'), b = nd('k'), D = diodeSpec(p), on = !p.blown && c.ds && c.ds[p.id];
          if (on) { const g = 1 / D.rd; add(p, a, b, g, { D, on: true }); src[a] += g * D.vf; src[b] -= g * D.vf; }
          else add(p, a, b, 0, { D, on: false });
          break;
        }
        default: add(p, nd('+'), nd('-'), c.ideal ? (isA(p) ? 1e6 : 1e-12) : 1 / meterR(p));
      }
    });

    // 연결된 덩어리마다 기준 마디(0 V) 하나를 정해 나머지를 푼다
    const adj = Array.from({ length: n }, () => []);
    els.forEach(e => { if (e.g > 0 && e.a !== e.b) { adj[e.a].push(e.b); adj[e.b].push(e.a); } });
    const comp = new Array(n).fill(-1), refs = [];
    for (let s = 0; s < n; s++) {
      if (comp[s] >= 0) continue;
      const k = refs.length; refs.push(s); comp[s] = k; const stk = [s];
      while (stk.length) { const u = stk.pop(); adj[u].forEach(v => { if (comp[v] < 0) { comp[v] = k; stk.push(v); } }); }
    }
    const fixed = new Set();   // 전원 (−) 마디를 기준으로 삼으면 전위가 읽기 쉽다
    parts.filter(p => p.type === 'bat' || p.type === 'acv').forEach(p => { const nb = node(p.id + '.-'), k = comp[nb]; if (!fixed.has(k)) { refs[k] = nb; fixed.add(k); } });
    const isRef = new Array(n).fill(false); refs.forEach(r => { isRef[r] = true; });
    const unk = [], pos = new Array(n).fill(-1);
    for (let i = 0; i < n; i++) if (!isRef[i]) { pos[i] = unk.length; unk.push(i); }
    const m = unk.length, A = Array.from({ length: m }, () => new Array(m + 1).fill(0));
    els.forEach(e => {
      if (e.g <= 0 || e.a === e.b) return;
      const ia = pos[e.a], ib = pos[e.b];
      if (ia >= 0) { A[ia][ia] += e.g; if (ib >= 0) A[ia][ib] -= e.g; }
      if (ib >= 0) { A[ib][ib] += e.g; if (ia >= 0) A[ib][ia] -= e.g; }
    });
    for (let i = 0; i < n; i++) if (pos[i] >= 0) A[pos[i]][m] += src[i];
    for (let i = 0; i < m; i++) {      // 가우스 소거(부분 피벗)
      let mx = i; for (let r = i + 1; r < m; r++) if (Math.abs(A[r][i]) > Math.abs(A[mx][i])) mx = r;
      [A[i], A[mx]] = [A[mx], A[i]];
      const d = A[i][i] || 1e-30;
      for (let r = i + 1; r < m; r++) { const f = A[r][i] / d; if (f) for (let k = i; k <= m; k++) A[r][k] -= f * A[i][k]; }
    }
    const x = new Array(m).fill(0);
    for (let i = m - 1; i >= 0; i--) { let s = A[i][m]; for (let k = i + 1; k < m; k++) s -= A[i][k] * x[k]; x[i] = s / (A[i][i] || 1e-30); }
    const v = new Array(n).fill(0); for (let i = 0; i < n; i++) if (pos[i] >= 0) v[i] = x[pos[i]];

    const res = {}, diodes = [];
    els.forEach(e => {
      const p = e.p, dv = v[e.a] - v[e.b];
      if (p.type === 'res') { const I = dv * e.g; res[p.id] = { V: dv, I, P: dv * I }; }
      else if (p.type === 'bulb') { const I = dv * e.g, B = BULBS[p.bt || 0], P = dv * I; res[p.id] = { V: dv, I, P, bright: Math.min(1.6, P / (B.v * B.i)), blow: P > 2 * B.v * B.i }; }
      else if (p.type === 'pot') {
        const I = dv * e.g, r = res[p.id] || (res[p.id] = { P: 0 });
        if (e.seg === 'aw') { r.Vaw = dv; r.Iaw = I; } else { r.Vwb = dv; r.Iwb = I; } r.P += dv * I;
      }
      else if (p.type === 'sw' || p.type === 'sw2') res[p.id] = { V: dv, I: dv * e.g };
      else if (p.type === 'cap') { const I = dt ? e.g * (dv - e.vp) - (tr ? e.ip : 0) : 0; res[p.id] = { V: dv, I }; }
      else if (p.type === 'coil') { const I = e.g * dv + e.ieq; res[p.id] = { V: dv, I }; }
      else if (p.type === 'diode' || p.type === 'led') {
        const I = e.on ? e.g * (dv - e.D.vf) : 0, lim = p.type === 'led' ? LED_MAX_A : DIODE_MAX_A;
        res[p.id] = { V: dv, I, on: !!e.on, blow: I > lim }; diodes.push({ id: p.id, V: dv, I, vf: e.D.vf, on: !!e.on });
      }
      else if (p.type === 'bat' || p.type === 'acv') { const I = (e.e - dv) / e.r; res[p.id] = { I, Vt: dv, e: e.e }; }
      else if (isA(p)) res[p.id] = { reading: dv * e.g, V: dv };
      else res[p.id] = { reading: dv, V: dv };
    });
    return { res, diodes, node: key => v[node(key)] };
  }

  /* dt가 있으면 축전기·코일을 그 시간 간격의 등가회로로 푼다(m: 'be' 후진 오일러, 'tr' 사다리꼴). 다이오드는 켜짐/꺼짐을 반복해서 맞춘다 */
  function analyze(parts, wires, dyn, dt, commit, t, opt) {
    opt = opt || {};
    const ds = {}; parts.forEach(p => { if (p.type === 'diode' || p.type === 'led') ds[p.id] = !!(dyn && dyn[p.id] && dyn[p.id].on); });
    let out;
    for (let it = 0; it < 14; it++) {
      out = solveOnce(parts, wires, { dyn, dt, t, ds, ideal: opt.ideal, m: opt.m || 'be' });
      let ch = false;
      out.diodes.forEach(d => { if (ds[d.id] && d.I < -1e-9) { ds[d.id] = false; ch = true; } else if (!ds[d.id] && d.V > d.vf + 1e-9) { ds[d.id] = true; ch = true; } });
      if (!ch) break;
    }
    if (commit && dt && dyn) parts.forEach(p => {
      const r = out.res[p.id];
      if (p.type === 'cap' || p.type === 'coil') dyn[p.id] = { v: r.V, i: r.I };
      else if (p.type === 'diode' || p.type === 'led') dyn[p.id] = { on: ds[p.id] };
    });
    out.issues = [];
    return out;
  }

  /* 경고 문장 만들기 */
  function diagnose(parts, R) {
    const out = [];
    const nm = p => p.name;
    parts.forEach(p => {
      const r = R.res[p.id]; if (!r) return;
      if ((p.type === 'bat' || p.type === 'acv') && (Math.abs(r.I) > 1.5 || (p.type === 'bat' && (r.e - r.Vt) > 0.4 * r.e && r.I > 0.5))) out.push(['bad', `⚠ 합선에 가까워요! ${nm(p)}에서 ${Math.abs(r.I).toFixed(1)} A가 흘러요. 스위치를 열고 도선·전류계 연결을 확인하세요. (전류계는 재려는 곳과 직렬)`]);
      if (p.type === 'res' && r.P > R_RATED_W) out.push(['warn', `🔥 ${nm(p)}(${p.nom} Ω)이 뜨거워요: ${r.P.toFixed(2)} W (정격 ${R_RATED_W} W). 큰 저항으로 바꾸거나 전압을 낮추세요.`]);
      if (p.type === 'pot' && r.P > 1) out.push(['warn', `🔥 ${nm(p)}이 뜨거워요: ${r.P.toFixed(2)} W (정격 1 W).`]);
      if (p.type === 'coil' && Math.abs(r.I) > COIL_MAX_A) out.push(['warn', `🔥 ${nm(p)}에 ${Math.abs(r.I).toFixed(2)} A가 흘러 뜨거워요 (허용 ${COIL_MAX_A} A). 저항을 직렬로 넣어 전류를 줄이세요.`]);
      if ((p.type === 'bulb' || p.type === 'led' || p.type === 'diode') && p.blown) out.push(['bad', `💥 ${nm(p)}이(가) 타 버렸어요. 부품을 눌러 '새 부품으로 교체'를 하고, 저항을 직렬로 넣거나 전압을 낮춰 다시 해 보세요.`]);
      else if (p.type === 'bulb' && r.bright > 1.3) out.push(['warn', `💡 ${nm(p)}에 정격(${BULBS[p.bt || 0].n})보다 센 전력이 걸려요. 곧 끊어질 수 있어요.`]);
      else if (p.type === 'led' && r.I > 0.03) out.push(['warn', `💡 ${nm(p)}에 ${(r.I * 1000).toFixed(0)} mA! LED는 보호 저항 없이 쓰면 타요.`]);
      if (isA(p) && Math.abs(rd(r)) > 1.15 * rangeOf(p)) out.push(['warn', `${nm(p)} 범위 초과: 더 큰 범위로 바꾸세요.`]);
      if (isV(p) && Math.abs(rd(r)) > 1.15 * rangeOf(p)) out.push(['warn', `${nm(p)} 범위 초과: 더 큰 범위로 바꾸세요.`]);
      if ((isA(p) || isV(p)) && rd(r) < -1e-6 * rangeOf(p) * 10 && Math.abs(rd(r)) > 0.02 * rangeOf(p)) out.push(['warn', `${nm(p)}: 바늘이 거꾸로 가요. (+)(−) 단자 연결이 반대예요.`]);
    });
    return out;
  }

  const engine = { analyze, diagnose, rangeOf, meterR, resActual, TERMS, termsOf, isA, isV, isAnalog, RANGES, CELL_E, CELL_R, E_NOMINAL, CAP_UF, COIL_MH, POT_R, FREQS, BULBS, LEDS, R_COIL_DCR, R_AC, diodeSpec, rd };
  if (typeof module !== 'undefined' && module.exports) module.exports = engine;
  root.FreeLabEngine = engine;
  root.FreeLabEngineReady = true;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initUI); else initUI();
  }

  /* ================= 화면 ================= */
  function initUI() {
    const host = document.getElementById('freeLab'), tabs = document.getElementById('tabs');
    if (!host || !tabs) return;
    const layout = document.querySelector('.layout');
    const NS = 'http://www.w3.org/2000/svg', BW = 1000, BH = 620;
    const KEY = 'freeLab-v1';
    const S = { parts: [], wires: [], nid: 1, sel: null, pending: null, theory: false, schem: false, dyn: {}, macc: {}, win: 0, beLeft: 3, t: 0, run: true, speed: 1, hist: [], hideVal: false, rows: [], cnt: { R: 0, A: 0, V: 0, B: 0 } };
    const WCOL = { red: '#d64545', black: '#26303c', blue: '#1f6fd6', green: '#1e8f4e', orange: '#e08a00' };
    const BANDS = ['#111', '#7a4a1c', '#d64545', '#f08a1c', '#f2d21b', '#2e9b45', '#2f6fd6', '#8a4fc7', '#888', '#fff'];
    const AR = ['30 mA', '300 mA', '3 A'], VR = ['3 V', '15 V'];
    let R = null, msgs = [], rafPending = false, needles = {}, drag = null;

    /* ---------- 저장 ---------- */
    function save() { try { localStorage.setItem(KEY, JSON.stringify({ parts: S.parts, wires: S.wires, nid: S.nid, rows: S.rows, cnt: S.cnt, hideVal: S.hideVal })); } catch (e) { } }
    function load() { try { const j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (j && Array.isArray(j.parts)) { Object.assign(S, { parts: j.parts, wires: j.wires || [], nid: j.nid || 1, rows: j.rows || [], cnt: j.cnt || S.cnt, hideVal: !!j.hideVal }); } } catch (e) { } }

    /* ---------- 화면 틀 ---------- */
    const css = document.createElement('style');
    css.textContent = `
    #freeLab{margin-top:4px}
    .fl-wrap{display:grid;grid-template-columns:224px minmax(0,1fr) 300px;gap:12px;align-items:start}
    .fl-tray,.fl-side>*{background:#fff;border:1px solid var(--border);border-radius:var(--radius);padding:10px}
    .fl-tray b{display:block;margin-bottom:4px}.fl-tray .fl-hint{font-size:.78em;color:var(--sub);margin-bottom:8px;line-height:1.4}
    .fl-items{display:flex;flex-direction:column;gap:6px}
    .fl-item{display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--border);border-radius:8px;background:#fafcff;cursor:grab;touch-action:none;user-select:none;font-size:.9em}
    .fl-item:hover{border-color:var(--accent);background:#eef5ff}.fl-item svg{flex:0 0 auto}
    .fl-item select{margin-left:auto;max-width:78px;flex:0 0 auto;font:inherit;font-size:.9em}.fl-pop{position:absolute;z-index:5;background:#fff;border:2px solid var(--accent);border-radius:10px;padding:6px 8px;display:flex;gap:6px;align-items:center;box-shadow:0 4px 14px rgba(0,0,0,.2);font-size:.88em;transform:translateX(-50%);white-space:nowrap}
    .fl-pop input{width:84px;font:inherit;padding:2px 4px}.fl-pop select{font:inherit}
    .fl-sim{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px;font-size:.9em}.fl-sim button,.fl-sim select{font:inherit;padding:4px 8px}#fl-t{font-variant-numeric:tabular-nums;min-width:70px}
    .fl-ch{width:100%;height:auto;background:#fff;border:1px solid var(--border);border-radius:8px;margin-top:8px}
    .fl-side select#fl-exsel{width:100%;font:inherit;padding:5px}.fl-side .errc{font-weight:700}.fl-sep{font-size:.75em;color:var(--sub);margin:6px 0 0}
    .fl-trash{margin-top:10px;border:2px dashed #c9d3e0;border-radius:8px;padding:10px 6px;text-align:center;font-size:.8em;color:var(--sub)}
    .fl-trash.hot{border-color:#d64545;color:#d64545;background:#fff1f1}
    .fl-bar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px;font-size:.88em}
    .fl-bar button{padding:6px 10px;font-size:.95em}.fl-bar label{display:inline-flex;gap:4px;align-items:center;cursor:pointer}
    .fl-board{position:relative;overflow:auto;border:1px solid var(--border);border-radius:var(--radius);background:#fff}
    .fl-board svg{display:block;width:100%;min-width:720px;height:auto;touch-action:none;user-select:none;-webkit-user-select:none}
    .fl-msgs{margin-top:8px;display:flex;flex-direction:column;gap:6px;min-height:20px}
    .fl-msg{padding:7px 10px;border-radius:8px;font-size:.9em;line-height:1.45;border:1px solid}
    .fl-msg.bad{background:#fff0f0;border-color:#e59a9a;color:#9a1f1f}.fl-msg.warn{background:#fff8e6;border-color:#e8c76f;color:#6b4e00}.fl-msg.info{background:#eef5ff;border-color:#b9d3f5;color:#1d4a85}
    .fl-side{display:flex;flex-direction:column;gap:10px}
    .fl-side table{width:100%;border-collapse:collapse;font-size:.86em}.fl-side th,.fl-side td{border:1px solid var(--border);padding:4px 6px;text-align:center}
    .fl-side th{background:#f2f5fa}.fl-side input[type=text]{width:100%;border:1px solid #cfd8e3;border-radius:5px;padding:3px 5px;font:inherit}
    .fl-side .fl-btns{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.fl-side .fl-btns button{padding:6px 10px;font-size:.88em}
    .fl-side summary{cursor:pointer;font-weight:700}.fl-side ol{margin:8px 0 0 18px;font-size:.86em;line-height:1.6}
    .fl-pend{animation:flpulse 1s infinite}@keyframes flpulse{0%,100%{stroke-opacity:1}50%{stroke-opacity:.2}}
    @media(max-width:1100px){.fl-wrap{grid-template-columns:minmax(0,1fr)}.fl-tray .fl-items{flex-direction:row;flex-wrap:wrap}.fl-item{flex:0 0 auto}}
    `;
    document.head.appendChild(css);

    host.innerHTML = `<div class="fl-wrap">
      <div class="fl-tray"><b>🧰 부품 상자</b><div class="fl-hint">끌어서 보드에 놓거나, 눌러서 추가하세요.</div><div class="fl-items" id="fl-items"></div>
        <div class="fl-trash" id="fl-trash">🗑 부품을 여기로 끌면 삭제</div></div>
      <div class="fl-mid"><div class="fl-bar">
          <button id="fl-rot" title="선택한 부품 회전 (R 키)">⟳ 회전</button><button id="fl-del">선택 삭제</button><button id="fl-clear">모두 지우기</button>
          <button id="fl-schem" class="primary">🔌 회로도 보기</button><label><input type="checkbox" id="fl-hide"> 저항 값 가리기(색띠로 읽기)</label>
          <label><input type="checkbox" id="fl-theory"> 이론값 보기(교사용)</label></div>
        <div class="fl-board" id="fl-board"></div><div class="fl-sim" id="fl-sim" hidden><b>⏱ 시간</b> <span id="fl-t">0.000 s</span>
          <button id="fl-run">⏸ 멈춤</button><button id="fl-reset">↺ 방전·처음으로</button>
          <label>화면 시간 <select id="fl-win"><option value="0">전체</option><option value="0.005">5 ms</option><option value="0.02">20 ms</option><option value="0.06">60 ms</option><option value="0.2">200 ms</option><option value="1">1 s</option><option value="5">5 s</option></select></label>
          <label>속도 <select id="fl-speed"><option value="0.01">1/100배 (아주 느리게)</option><option value="0.1">1/10배 (느리게)</option><option value="1">실제 속도</option><option value="10">10배 빠르게</option><option value="100">100배 빠르게</option></select></label></div>
        <div id="fl-chart"></div>
        <div class="fl-msgs" id="fl-msgs" aria-live="polite"></div></div>
      <div class="fl-side">
        <div><b>📟 계기</b><table id="fl-meters"></table></div>
        <div><b>📝 측정 기록</b><table id="fl-rec"></table><div class="fl-btns"><button id="fl-addrow" class="primary">지금 값 기록</button><button id="fl-copy">📋 보고서 복사</button><button id="fl-clrrows">표 지우기</button><button id="fl-link">🔗 회로 링크 복사</button><button id="fl-load">📥 링크로 불러오기</button></div></div>
        <details open><summary>❓ 사용법</summary><ol>
          <li>부품 상자에서 <b>건전지·스위치·저항·계기</b>를 보드로 끌어다 놓습니다.</li>
          <li>부품 끝의 <b>동그란 단자</b>를 끌어 다른 단자에 놓으면 도선이 이어집니다. (또는 두 단자를 차례로 탭)</li>
          <li><b>전류계</b>는 재려는 곳과 <b>직렬</b>, <b>전압계</b>는 재려는 곳과 <b>병렬</b>. 계기의 <b>(+)는 전지 (+)쪽</b>에 이어요.</li>
          <li><b>스위치를 닫고</b>(레버 클릭) 값을 읽습니다. 계기 아래 <b>범위</b> 단추로 눈금을 바꿔요.</li>
          <li>도선은 클릭해서 <b>선택 삭제</b>. 부품을 눌러 끌면 옮겨요. 값은 위 표에 기록하세요.</li></ol></details>
        <details><summary>🧑‍🏫 교사용 도구</summary><div class="fl-btns"><select id="fl-exsel"><option value="">예시 회로 불러오기…</option>
          <optgroup label="저항 연결"><option value="series">저항 직렬 (+전압계·전류계)</option><option value="parallel">저항 병렬 (+전압계·전류계)</option><option value="pot">가변저항 분압</option></optgroup>
          <optgroup label="전구·LED·스위치"><option value="bulbs-series">전구 직렬</option><option value="bulbs-parallel">전구 병렬</option><option value="led">LED와 보호 저항</option><option value="twoway">계단 스위치(쌍투 2개)</option></optgroup>
          <optgroup label="축전기·코일 (시간 변화)"><option value="rc">RC 충전</option><option value="rl">RL 전류 증가</option></optgroup>
          <optgroup label="교류"><option value="ac-rc">교류 RC (위상차)</option><option value="ac-rlc">교류 RLC 공진</option><option value="rectifier">반파 정류</option></optgroup></select></div></details>
      </div></div>`;
    const $ = id => host.querySelector('#' + id);
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${BW} ${BH}`);
    $('fl-board').appendChild(svg);

    /* ---------- SVG 도우미 ---------- */
    function h(tag, attrs, ...kids) {
      const e = document.createElementNS(NS, tag);
      if (attrs) for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
      kids.forEach(k => { if (k === undefined || k === null) return; e.appendChild(typeof k === 'string' ? document.createTextNode(k) : k); });
      return e;
    }
    const T = (txt, x, y, size, fill, anchor, weight) => h('text', { x, y, 'font-size': size, fill: fill || '#1c2733', 'text-anchor': anchor || 'middle', 'font-weight': weight || 400, 'font-family': '"Malgun Gothic","Segoe UI",sans-serif', 'pointer-events': 'none' }, txt);
    function toBoard(e) { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const m = svg.getScreenCTM(); if (!m) return { x: 0, y: 0 }; const q = pt.matrixTransform(m.inverse()); return { x: q.x, y: q.y }; }
    const snap = v => Math.round(v / 10) * 10;
    const partById = id => S.parts.find(p => p.id === id);
    const tdef = (p, t) => termsOf(p)[t];
    function rotv(x, y, rot) { switch (((rot || 0) % 360 + 360) % 360) { case 90: return [-y, x]; case 180: return [-x, -y]; case 270: return [y, -x]; default: return [x, y]; } }
    function tpos(key) { const [id, t] = key.split('.'); const p = partById(id); if (!p) return null; const d = tdef(p, t), o = rotv(d.x, d.y, p.rot); return { x: p.x + o[0], y: p.y + o[1], d: rotv(d.d[0], d.d[1], p.rot), p, t }; }

    /* ---------- 부품 만들기 ---------- */
    function bandColors(v) {
      v = Math.max(0.1, v); let e = Math.floor(Math.log10(v)) - 1, d = Math.round(v / Math.pow(10, e));
      if (d >= 100) { d = Math.round(d / 10); e++; }
      return [BANDS[Math.floor(d / 10)], BANDS[d % 10], e >= 0 ? BANDS[Math.min(9, e)] : (e === -1 ? '#d4a82a' : '#c0c0c0')];
    }
    function fmtOhm(v) { return v >= 1e6 ? (v / 1e6) + ' MΩ' : v >= 1000 ? (v / 1000) + ' kΩ' : v + ' Ω'; }
    const fmtC = v => v + ' µF', fmtL = v => v >= 1000 ? (v / 1000) + ' H' : v + ' mH';
    const valTxt = p => p.type === 'res' ? fmtOhm(p.nom) : p.type === 'cap' ? fmtC(p.c) : p.type === 'coil' ? fmtL(p.l) : '';
    const isRCL = p => p.type === 'res' || p.type === 'cap' || p.type === 'coil';
    const hasDyn = () => S.parts.some(p => p.type === 'cap' || p.type === 'coil' || p.type === 'acv');
    function freeSpot(type) {
      const big = type !== 'res' && type !== 'sw';
      for (let k = 0; k < 40; k++) {
        const x = 170 + (k % 5) * 165 + (big ? 0 : 0), y = (big ? 170 : 130) + Math.floor(k / 5) * 170;
        if (y > BH - 90) break;
        if (!S.parts.some(q => Math.abs(q.x - x) < 120 && Math.abs(q.y - y) < 110)) return { x, y };
      }
      return { x: 120 + Math.random() * 600, y: 120 + Math.random() * 300 };
    }
    const nx = k => (S.cnt[k] = (S.cnt[k] || 0) + 1);
    function addPart(type, opt, x, y) {
      const p = { id: 'p' + (S.nid++), type, x: 0, y: 0 };
      if (type === 'res') { p.nom = opt.nom || 100; p.tol = (Math.random() * 2 - 1) * 0.05; p.name = 'R' + (++S.cnt.R); }
      else if (type === 'sw') { p.closed = false; p.name = '스위치'; }
      else if (type === 'cap') { p.c = opt.val || 100; p.name = 'C' + (S.cnt.C = (S.cnt.C || 0) + 1); }
      else if (type === 'coil') { p.l = opt.val || 100; p.name = 'L' + (S.cnt.L = (S.cnt.L || 0) + 1); }
      else if (type === 'acv') { p.amp = 6; p.f = opt.val || 50; p.name = '교류전원' + nx('N'); }
      else if (type === 'bulb') { p.bt = opt.val || 0; p.name = '전구' + nx('G'); }
      else if (type === 'pot') { p.nom = opt.val || 470; p.pos = 0.5; p.name = 'RV' + nx('P'); }
      else if (type === 'diode') { p.name = 'D' + nx('D'); }
      else if (type === 'led') { p.col = opt.val || 0; p.name = 'LED' + nx('E'); }
      else if (type === 'sw2') { p.pos = 1; p.name = '스위치(쌍투)'; }
      else if (type === 'bat') { p.cells = 4; p.name = '건전지' + (++S.cnt.B > 1 ? S.cnt.B : ''); }
      else { p.range = 0; p.name = (isA(p) ? 'A' : 'V') + (isA(p) ? ++S.cnt.A : ++S.cnt.V); }
      const s0 = (x === undefined) ? freeSpot(type) : { x: snap(x), y: snap(y) };
      p.x = Math.max(80, Math.min(BW - 80, s0.x)); p.y = Math.max(80, Math.min(BH - 90, s0.y));
      S.parts.push(p); S.sel = { k: 'part', id: p.id }; update(); return p;
    }
    function removePart(id) {
      S.parts = S.parts.filter(p => p.id !== id); S.wires = S.wires.filter(w => !w.a.startsWith(id + '.') && !w.b.startsWith(id + '.'));
      if (S.sel && S.sel.id === id) S.sel = null; update();
    }
    function wireColor(a, b) {
      const pa = tpos(a), pb = tpos(b); const sym = [pa, pb].map(q => q && (q.p.type === 'bat' || q.p.type === 'acv' || q.p.type === 'mtr' || isA(q.p) || isV(q.p)) ? q.t : null);
      if (sym.includes('+')) return 'red'; if (sym.includes('-')) return 'black';
      return ['blue', 'green', 'orange'][S.wires.length % 3];
    }
    function addWire(a, b) {
      if (a === b || !tpos(a) || !tpos(b)) return;
      if (S.wires.some(w => (w.a === a && w.b === b) || (w.a === b && w.b === a))) return;
      S.wires.push({ id: 'w' + (S.nid++), a, b, c: wireColor(a, b) }); S.sel = null; update();
    }

    /* ---------- 부품 그림 ---------- */
    function drawResistor(p, r) {
      const g = h('g'), bands = bandColors(p.nom), hot = r && r.P > R_RATED_W;
      g.appendChild(h('line', { x1: -70, y1: 0, x2: -40, y2: 0, stroke: '#9aa5b3', 'stroke-width': 5, 'stroke-linecap': 'round' }));
      g.appendChild(h('line', { x1: 40, y1: 0, x2: 70, y2: 0, stroke: '#9aa5b3', 'stroke-width': 5, 'stroke-linecap': 'round' }));
      g.appendChild(h('rect', { x: -42, y: -15, width: 84, height: 30, rx: 12, fill: hot ? '#ffb3a0' : '#ecd5a6', stroke: hot ? '#d64545' : '#a58650', 'stroke-width': 2.5 }));
      [[-27, bands[0]], [-14, bands[1]], [-1, bands[2]], [24, '#d4a82a']].forEach(([x, c]) => g.appendChild(h('rect', { x, y: -15, width: 7, height: 30, fill: c, stroke: c === '#fff' ? '#bbb' : 'none' })));
      g.appendChild(T(p.name + (S.hideVal ? '' : ' · ' + fmtOhm(p.nom)), 0, -26, 15, '#6b4e17', 'middle', 700));
      if (hot) g.appendChild(T('🔥', 0, 5, 22, '#000', 'middle'));
      if (S.theory && r) g.appendChild(T(`V=${r.V.toFixed(2)} V · I=${(r.I * 1000).toFixed(1)} mA`, 0, 36, 13, '#1d4a85', 'middle', 700));
      return g;
    }
    function drawCap(p, r) {
      const g = h('g'), vc = r ? Math.abs(r.V) : 0;
      g.appendChild(h('line', { x1: -70, y1: 0, x2: -36, y2: 0, stroke: '#9aa5b3', 'stroke-width': 5, 'stroke-linecap': 'round' }));
      g.appendChild(h('line', { x1: 36, y1: 0, x2: 70, y2: 0, stroke: '#9aa5b3', 'stroke-width': 5, 'stroke-linecap': 'round' }));
      g.appendChild(h('rect', { x: -36, y: -20, width: 72, height: 40, rx: 8, fill: '#2f62b5', stroke: '#1d3f7a', 'stroke-width': 2.5 }));
      g.appendChild(h('rect', { x: -26, y: -11, width: 52, height: 22, rx: 4, fill: '#ffd166', 'fill-opacity': Math.min(1, vc / 6) * 0.95 + 0.05 }));
      g.appendChild(T('C', 0, 6, 17, '#1d3f7a', 'middle', 700));
      g.appendChild(T(p.name + ' · ' + fmtC(p.c), 0, -30, 15, '#1d3f7a', 'middle', 700));
      if (S.theory && r) g.appendChild(T(`Vc=${r.V.toFixed(2)} V · I=${(r.I * 1000).toFixed(1)} mA`, 0, 40, 13, '#1d4a85', 'middle', 700));
      return g;
    }
    function drawCoil(p, r) {
      const g = h('g'); let d = 'M-45 0';
      for (let i = 0; i < 6; i++) d += ' a7.5 20 0 0 1 15 0';
      g.appendChild(h('line', { x1: -70, y1: 0, x2: -45, y2: 0, stroke: '#9aa5b3', 'stroke-width': 5, 'stroke-linecap': 'round' }));
      g.appendChild(h('line', { x1: 45, y1: 0, x2: 70, y2: 0, stroke: '#9aa5b3', 'stroke-width': 5, 'stroke-linecap': 'round' }));
      g.appendChild(h('path', { d, fill: 'none', stroke: '#b8651b', 'stroke-width': 7, 'stroke-linecap': 'round' }));
      g.appendChild(T(p.name + ' · ' + fmtL(p.l), 0, -32, 15, '#8a4a10', 'middle', 700));
      g.appendChild(T('(권선 저항 ' + R_COIL_DCR + ' Ω)', 0, 24, 12, '#8a96a6', 'middle'));
      if (S.theory && r) g.appendChild(T(`V=${r.V.toFixed(2)} V · I=${(r.I * 1000).toFixed(1)} mA`, 0, 42, 13, '#1d4a85', 'middle', 700));
      return g;
    }
    function drawSwitch(p, r) {
      const g = h('g');
      g.appendChild(h('rect', { x: -78, y: 10, width: 156, height: 20, rx: 5, fill: '#4a5666' }));
      g.appendChild(h('rect', { x: -66, y: -6, width: 12, height: 20, rx: 3, fill: '#8a96a6' }));
      g.appendChild(h('rect', { x: 54, y: -6, width: 12, height: 20, rx: 3, fill: '#8a96a6' }));
      const ang = p.closed ? 0 : -38, lev = h('g', { transform: `translate(-60 0) rotate(${ang})`, style: 'cursor:pointer' },
        h('line', { x1: 0, y1: 0, x2: 118, y2: 0, stroke: p.closed ? '#1e8f4e' : '#c0861a', 'stroke-width': 7, 'stroke-linecap': 'round' }),
        h('circle', { cx: 118, cy: 0, r: 11, fill: p.closed ? '#1e8f4e' : '#c0861a' }),
        h('line', { x1: 8, y1: 0, x2: 112, y2: 0, stroke: 'transparent', 'stroke-width': 30 }));
      lev.setAttribute('data-act', 'sw'); g.appendChild(lev);
      g.appendChild(T('스위치 ' + (p.closed ? '닫힘' : '열림'), 0, 52, 14, p.closed ? '#1e8f4e' : '#8a5a00', 'middle', 700));
      return g;
    }
    function drawBattery(p, r) {
      const g = h('g'), e = CELL_E * p.cells;
      g.appendChild(h('rect', { x: -82, y: -50, width: 164, height: 100, rx: 10, fill: '#2d3b52', stroke: '#18212f', 'stroke-width': 2 }));
      for (let i = 0; i < 6; i++) g.appendChild(h('rect', { x: -70 + i * 24, y: -34, width: 18, height: 34, rx: 3, fill: i < p.cells ? '#ffd166' : '#46556e' }));
      g.appendChild(T(p.name + ' ' + e.toFixed(1) + ' V', 0, 24, 17, '#fff', 'middle', 700));
      g.appendChild(T('(1.5 V × ' + p.cells + ')', 0, 42, 12, '#b9c6da', 'middle'));
      [[-62, 36, '−', -1], [62, 36, '+', 1]].forEach(([x, y, c, d]) => { });
      const mk = (x, c, d) => { const b = h('g', { 'data-act': 'cell', 'data-d': d, style: 'cursor:pointer', transform: `translate(${x} 40)` }, h('circle', { r: 10, fill: '#eef2f8', stroke: '#9aa5b3' }), T(c, 0, 5, 15, '#1c2733', 'middle', 700)); return b; };
      g.appendChild(mk(-66, '−', -1)); g.appendChild(mk(66, '+', 1));
      if (S.theory && r) g.appendChild(T(`I=${(r.I * 1000).toFixed(1)} mA · 단자 ${r.Vt.toFixed(2)} V`, 0, 72, 13, '#1d4a85', 'middle', 700));
      return g;
    }
    function drawBulb(p, r) {
      const g = h('g'), B = BULBS[p.bt || 0], br = p.blown ? 0 : Math.min(1, (r ? r.bright : 0)), over = r && r.bright > 1.3;
      g.appendChild(h('line', { x1: -70, y1: 0, x2: -24, y2: 0, stroke: '#9aa5b3', 'stroke-width': 5, 'stroke-linecap': 'round' }));
      g.appendChild(h('line', { x1: 24, y1: 0, x2: 70, y2: 0, stroke: '#9aa5b3', 'stroke-width': 5, 'stroke-linecap': 'round' }));
      if (br > 0.02) g.appendChild(h('circle', { r: 26 + 20 * br, fill: '#ffe066', 'fill-opacity': 0.18 + 0.35 * br }));
      g.appendChild(h('circle', { r: 24, fill: br > 0.02 ? `rgba(255,${230 - 40 * (1 - br)},${150 - 110 * br},${0.35 + 0.65 * br})` : '#eef3f8', stroke: over ? '#d64545' : '#6b7a8c', 'stroke-width': 3 }));
      if (p.blown) g.appendChild(h('path', { d: 'M-12 -10 L-4 0 L-12 10 M12 -10 L4 0 L12 10', fill: 'none', stroke: '#444', 'stroke-width': 2.5 }));
      else g.appendChild(h('path', { d: 'M-12 8 L-8 -6 L-3 8 L2 -6 L7 8 L12 -6', fill: 'none', stroke: br > 0.02 ? '#ff8a00' : '#6b7a8c', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
      g.appendChild(T(p.name + ' · ' + B.n, 0, -38, 15, '#6b5600', 'middle', 700));
      if (p.blown) g.appendChild(T('💥 끊어짐', 0, 48, 14, '#9a1f1f', 'middle', 700));
      else if (S.theory && r) g.appendChild(T(`V=${r.V.toFixed(2)} V · I=${(r.I * 1000).toFixed(0)} mA · 밝기 ${Math.round(r.bright * 100)}%`, 0, 46, 13, '#1d4a85', 'middle', 700));
      return g;
    }
    function drawPot(p, r) {
      const g = h('g'), x = Math.min(1, Math.max(0, p.pos == null ? 0.5 : p.pos)), kx = -48 + 96 * x;
      g.appendChild(h('line', { x1: -70, y1: 0, x2: -52, y2: 0, stroke: '#9aa5b3', 'stroke-width': 5, 'stroke-linecap': 'round' }));
      g.appendChild(h('line', { x1: 52, y1: 0, x2: 70, y2: 0, stroke: '#9aa5b3', 'stroke-width': 5, 'stroke-linecap': 'round' }));
      g.appendChild(h('rect', { x: -54, y: -13, width: 108, height: 26, rx: 5, fill: '#2f7d5b', stroke: '#1b4d37', 'stroke-width': 2.5 }));
      g.appendChild(h('rect', { x: -48, y: -4, width: 96, height: 8, rx: 3, fill: '#c9b27a' }));
      g.appendChild(h('line', { x1: kx, y1: -56, x2: kx, y2: -4, stroke: '#3a4658', 'stroke-width': 3 }));
      g.appendChild(h('circle', { cx: kx, cy: -4, r: 6, fill: '#3a4658' }));
      g.appendChild(h('line', { x1: 0, y1: -56, x2: kx, y2: -56, stroke: '#9aa5b3', 'stroke-width': 5, 'stroke-linecap': 'round' }));
      g.appendChild(T(p.name + ' · ' + fmtOhm(p.nom) + ' · ' + Math.round(x * 100) + '%', 0, 34, 14, '#1b4d37', 'middle', 700));
      if (S.theory && r) g.appendChild(T(`위 ${(r.Vaw || 0).toFixed(2)} V · 아래 ${(r.Vwb || 0).toFixed(2)} V`, 0, 50, 13, '#1d4a85', 'middle', 700));
      return g;
    }
    function drawDiode(p, r) {
      const g = h('g'), isL = p.type === 'led', D = isL ? LEDS[p.col || 0] : null, on = r && r.on, br = isL && !p.blown ? Math.min(1, (r ? r.I : 0) / 0.02) : 0;
      g.appendChild(h('line', { x1: -70, y1: 0, x2: -26, y2: 0, stroke: '#9aa5b3', 'stroke-width': 5, 'stroke-linecap': 'round' }));
      g.appendChild(h('line', { x1: 26, y1: 0, x2: 70, y2: 0, stroke: '#9aa5b3', 'stroke-width': 5, 'stroke-linecap': 'round' }));
      if (isL) {
        if (br > 0.03) g.appendChild(h('circle', { cx: 0, cy: 0, r: 30 + 18 * br, fill: D.c, 'fill-opacity': 0.12 + 0.35 * br }));
        g.appendChild(h('rect', { x: -26, y: -20, width: 52, height: 40, rx: 20, fill: br > 0.03 ? D.c : '#e6ebf1', 'fill-opacity': br > 0.03 ? 0.35 + 0.65 * br : 1, stroke: '#6b7a8c', 'stroke-width': 2.5 }));
      } else g.appendChild(h('rect', { x: -26, y: -11, width: 52, height: 22, rx: 3, fill: '#2b2b2b' }));
      g.appendChild(h('polygon', { points: '-12,-12 -12,12 10,0', fill: isL ? '#444' : '#ddd', stroke: '#222', 'stroke-width': 1.5 }));
      g.appendChild(h('line', { x1: 12, y1: -13, x2: 12, y2: 13, stroke: isL ? '#222' : '#e8e8e8', 'stroke-width': 3 }));
      g.appendChild(T(p.name + (isL ? ' · ' + D.n : ''), 0, -34, 15, '#333', 'middle', 700));
      g.appendChild(T('A', -48, 22, 12, '#8a96a6', 'middle', 700)); g.appendChild(T('K', 48, 22, 12, '#8a96a6', 'middle', 700));
      if (p.blown) g.appendChild(T('💥 타 버림', 0, 44, 14, '#9a1f1f', 'middle', 700));
      else if (S.theory && r) g.appendChild(T(`${r.on ? '켜짐' : '꺼짐'} · V=${r.V.toFixed(2)} V · I=${(r.I * 1000).toFixed(1)} mA`, 0, 44, 13, '#1d4a85', 'middle', 700));
      return g;
    }
    function drawSw2(p, r) {
      const g = h('g'), up = p.pos !== 2, ty = up ? -26 : 26;
      g.appendChild(h('rect', { x: -78, y: 38, width: 156, height: 16, rx: 5, fill: '#4a5666' }));
      [[-60, 0], [60, -26], [60, 26]].forEach(([x, y]) => g.appendChild(h('circle', { cx: x, cy: y, r: 9, fill: '#8a96a6' })));
      const ang = Math.atan2(ty, 120) * 180 / Math.PI, lev = h('g', { transform: `translate(-60 0) rotate(${ang})`, style: 'cursor:pointer' },
        h('line', { x1: 0, y1: 0, x2: Math.hypot(120, ty), y2: 0, stroke: '#1e8f4e', 'stroke-width': 7, 'stroke-linecap': 'round' }),
        h('line', { x1: 8, y1: 0, x2: 112, y2: 0, stroke: 'transparent', 'stroke-width': 34 }));
      lev.setAttribute('data-act', 'sw2'); g.appendChild(lev);
      g.appendChild(T('①', 78, -22, 14, '#555', 'start', 700)); g.appendChild(T('②', 78, 32, 14, '#555', 'start', 700));
      g.appendChild(T('쌍투 스위치 → ' + (up ? '①' : '②'), 0, 72, 14, '#1e8f4e', 'middle', 700));
      return g;
    }
    function drawAcv(p, r) {
      const g = h('g');
      g.appendChild(h('rect', { x: -82, y: -50, width: 164, height: 100, rx: 10, fill: '#3b3358', stroke: '#1d1830', 'stroke-width': 2 }));
      g.appendChild(h('circle', { cx: 0, cy: -8, r: 26, fill: '#fff' }));
      g.appendChild(h('path', { d: 'M-16 -8 q8 -22 16 0 t16 0', fill: 'none', stroke: '#3b3358', 'stroke-width': 3 }));
      g.appendChild(T(p.name, 0, 28, 15, '#fff', 'middle', 700));
      g.appendChild(T(`${p.amp} V(최대) · ${p.f} Hz`, 0, 44, 12, '#cfc9e6', 'middle'));
      if (S.theory && r) g.appendChild(T(`실효값 ${(p.amp / Math.SQRT2).toFixed(2)} V`, 0, 72, 13, '#1d4a85', 'middle', 700));
      return g;
    }
    const DRAW = { res: drawResistor, cap: drawCap, coil: drawCoil, sw: drawSwitch, bat: drawBattery, bulb: drawBulb, pot: drawPot, diode: drawDiode, led: drawDiode, sw2: drawSw2, acv: drawAcv };
    const BB = { res: [-78, -34, 156, 68], cap: [-78, -40, 156, 90], coil: [-78, -42, 156, 90], sw: [-84, -30, 168, 70], bat: [-90, -72, 180, 150], acv: [-90, -72, 180, 160], bulb: [-78, -48, 156, 108], pot: [-78, -66, 156, 130], diode: [-78, -44, 156, 100], led: [-78, -44, 156, 100], sw2: [-84, -40, 168, 120], mtr: [-92, -86, 184, 214] };
    function dialGeom(frac) { const a = (-50 + 100 * frac) * Math.PI / 180; return { x: 56 * Math.sin(a), y: 30 - 56 * Math.cos(a) }; }
    function drawMeter(p, r) {
      const g = h('g'), A = isA(p), col = A ? '#1b8fb8' : '#7a4fd1', range = rangeOf(p), analog = isAnalog(p);
      g.appendChild(h('rect', { x: -85, y: -78, width: 170, height: 176, rx: 12, fill: analog ? '#f8f7f1' : '#dfe4ea', stroke: '#222c38', 'stroke-width': 2.5 }));
      g.appendChild(h('rect', { x: -85, y: -78, width: 170, height: 24, rx: 12, fill: col }));
      g.appendChild(h('rect', { x: -85, y: -66, width: 170, height: 12, fill: col }));
      g.appendChild(T(p.name + (A ? ' 전류계' : ' 전압계'), -14, -60, 14, '#fff', 'middle', 700));
      const unit = A ? (range >= 1 ? 'A' : 'mA') : 'V', sc = A && range < 1 ? 1000 : 1;
      if (analog) {
        const cx = 0, cy = 30;
        const arc = (f0, f1, rr) => { const a0 = (-50 + 100 * f0) * Math.PI / 180, a1 = (-50 + 100 * f1) * Math.PI / 180; return `M${cx + rr * Math.sin(a0)} ${cy - rr * Math.cos(a0)} A${rr} ${rr} 0 0 1 ${cx + rr * Math.sin(a1)} ${cy - rr * Math.cos(a1)}`; };
        g.appendChild(h('path', { d: arc(0, 1, 62), fill: 'none', stroke: '#333', 'stroke-width': 1.5 }));
        for (let i = 0; i <= 30; i++) {
          const f = i / 30, a = (-50 + 100 * f) * Math.PI / 180, major = i % 10 === 0, r0 = major ? 50 : 56;
          g.appendChild(h('line', { x1: Math.sin(a) * r0, y1: cy - Math.cos(a) * r0, x2: Math.sin(a) * 62, y2: cy - Math.cos(a) * 62, stroke: '#333', 'stroke-width': major ? 2.2 : 1 }));
          if (major) { const lab = ((range * sc) * i / 30); g.appendChild(T(String(Math.round(lab * 100) / 100), Math.sin(a) * 40, cy - Math.cos(a) * 40 + 4, 12, '#222', 'middle', 700)); }
        }
        g.appendChild(T(unit, 0, cy + 22, 15, col, 'middle', 700));
        const needle = h('line', { x1: 0, y1: cy, x2: 0, y2: cy - 58, stroke: '#c0392b', 'stroke-width': 2.4, 'stroke-linecap': 'round' });
        const ng = h('g', { transform: `rotate(${-50} ${cx} ${cy})` }, needle);
        g.appendChild(ng); g.appendChild(h('circle', { cx, cy, r: 5, fill: '#333' }));
        needles[p.id] = { el: ng, cy, ang: needles[p.id] ? needles[p.id].ang : -50 };
        const target = r ? Math.max(-6, Math.min(106, 100 * rd(r) / range)) - 50 : -50;
        needles[p.id].target = target;
        if (needles[p.id].ang === undefined) needles[p.id].ang = -50;
        ng.setAttribute('transform', `rotate(${needles[p.id].ang} ${cx} ${cy})`);
      } else {
        g.appendChild(h('rect', { x: -70, y: -42, width: 140, height: 62, rx: 6, fill: '#b9d1a0', stroke: '#6d7f5a', 'stroke-width': 2 }));
        let txt = '0.00'; if (r) { const v = rd(r); txt = Math.abs(v) > 1.1 * range ? 'OL' : fmtDigital(p, v); }
        g.appendChild(h('text', { x: 62, y: 8, 'text-anchor': 'end', 'font-size': 30, 'font-family': 'Consolas,"Courier New",monospace', 'font-weight': 700, fill: '#1f2a14', 'pointer-events': 'none' }, txt));
      }
      g.appendChild(h('g', { 'data-act': 'mode', style: 'cursor:pointer', transform: 'translate(66 -66)' }, h('rect', { x: -19, y: -9, width: 38, height: 18, rx: 9, fill: '#fff' }), T(p.mode === 'AC' ? '~AC' : '=DC', 0, 4, 12, col, 'middle', 700)));
      const rg = h('g', { 'data-act': 'range', style: 'cursor:pointer', transform: 'translate(0 70)' },
        h('rect', { x: -52, y: -13, width: 104, height: 26, rx: 13, fill: '#fff', stroke: col, 'stroke-width': 2 }),
        T('범위 ' + (A ? AR : VR)[p.range] + ' ▸', 0, 5, 13, col, 'middle', 700));
      g.appendChild(rg);
      if (S.theory && r) g.appendChild(T(`이론값 ${A ? (rd(r) * 1000).toFixed(2) + ' mA' : rd(r).toFixed(3) + ' V'}`, 0, 118, 13, '#1d4a85', 'middle', 700));
      return g;
    }
    function fmtDigital(p, v) {
      const r = rangeOf(p); if (Math.abs(v) < 5e-7 * Math.max(1, r)) v = 0;
      if (isA(p)) { if (r >= 1) return v.toFixed(3) + ' A'; if (r >= 0.3) return (v * 1000).toFixed(1) + ' mA'; return (v * 1000).toFixed(2) + ' mA'; }
      return r >= 10 ? v.toFixed(2) + ' V' : v.toFixed(3) + ' V';
    }

    /* ---------- 그리기 ---------- */
    function wirePath(a, b, bendTo) {
      const ds = Math.hypot(b.x - a.x, b.y - a.y), k = Math.max(40, Math.min(150, ds * 0.45)), da = a.d || [0, 0], db = b.d || [0, 0];
      const c1 = { x: a.x + da[0] * k, y: a.y + da[1] * k }, c2 = { x: b.x + db[0] * k, y: b.y + db[1] * k };
      return `M${a.x} ${a.y} C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`;
    }

    /* ---------- 회로도 ---------- */
    function symbol(p) {
      const g = h('g', { stroke: '#111', 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      const L = (x1, y1, x2, y2, w) => g.appendChild(h('line', { x1, y1, x2, y2, 'stroke-width': w || 3 }));
      if (p.type === 'res') {
        g.appendChild(h('polyline', { points: '-70,0 -34,0 -28,-14 -16,14 -4,-14 8,14 20,-14 28,0 34,0 70,0' }));
      } else if (p.type === 'cap') {
        L(-70, 0, -8, 0); L(8, 0, 70, 0); L(-8, -20, -8, 20, 5); L(8, -20, 8, 20, 5);
      } else if (p.type === 'coil') {
        L(-70, 0, -45, 0); L(45, 0, 70, 0); let d = 'M-45 0'; for (let i = 0; i < 6; i++) d += ' a7.5 18 0 0 1 15 0'; g.appendChild(h('path', { d }));
      } else if (p.type === 'sw') {
        L(-60, 0, -30, 0); L(30, 0, 60, 0);
        g.appendChild(h('circle', { cx: -30, cy: 0, r: 4, fill: '#111' })); g.appendChild(h('circle', { cx: 30, cy: 0, r: 4, fill: '#111' }));
        if (p.closed) L(-30, 0, 30, 0); else L(-30, 0, 24, -26);
      } else if (p.type === 'bat') {
        L(-40, -58, -40, -20); L(40, -58, 40, -20); L(-40, -20, -8, -20); L(8, -20, 40, -20);
        L(-8, -38, -8, -2, 5); L(8, -30, 8, -10, 5);
        g.appendChild(T('+', -52, -38, 20, '#111', 'middle', 700)); g.appendChild(T('−', 52, -38, 20, '#111', 'middle', 700));
        g.appendChild(h('g', { fill: '#111', stroke: 'none' }));
      } else if (!isA(p) && !isV(p)) {
        Object.keys(termsOf(p)).forEach(k => { const q = termsOf(p)[k]; L(q.x, q.y, Math.max(-24, Math.min(24, q.x)), Math.max(-14, Math.min(14, q.y))); });
        g.appendChild(h('rect', { x: -24, y: -14, width: 48, height: 28, fill: '#fff' }));
      } else {
        const A = isA(p);
        g.appendChild(h('circle', { cx: 0, cy: 40, r: 28, fill: '#fff' }));
        L(-35, 100, -35, 40); L(-35, 40, -28, 40); L(35, 100, 35, 40); L(35, 40, 28, 40);
        g.appendChild(T(A ? 'A' : 'V', 0, 50, 30, '#111', 'middle', 700));
        g.appendChild(T('+', -46, 84, 18, '#111', 'middle', 700)); g.appendChild(T('−', 46, 84, 18, '#111', 'middle', 700));
      }
      return g;
    }
    function symLabel(p, r) {
      const base = ['bulb', 'pot', 'diode', 'led', 'sw2', 'acv'].includes(p.type) ? [0, 38] : isRCL(p) ? [0, -26] : p.type === 'sw' ? [0, 28] : p.type === 'bat' ? [0, 10] : [0, 4];
      let t = p.name;
      if (isRCL(p)) t += ' ' + valTxt(p); else if (p.type === 'bat') t += ' ' + (CELL_E * p.cells).toFixed(1) + ' V';
      if (S.theory && r) { if (isRCL(p)) t += ` (${r.V.toFixed(2)} V, ${(r.I * 1000).toFixed(1)} mA)`; else if (isA(p) || isV(p)) t += ' ' + (isA(p) ? (rd(r) * 1000).toFixed(2) + ' mA' : rd(r).toFixed(3) + ' V'); }
      return T(t, base[0], base[1], 15, '#1c2733', 'middle', 700);
    }
    function schemPath(a, b) {
      const S0 = 26, a1 = { x: a.x + a.d[0] * S0, y: a.y + a.d[1] * S0 }, b1 = { x: b.x + b.d[0] * S0, y: b.y + b.d[1] * S0 };
      const pts = [a, a1];
      if (a.d[1] === 0 && a1.x !== b1.x) { const mx = (a1.x + b1.x) / 2; pts.push({ x: mx, y: a1.y }, { x: mx, y: b1.y }); }
      else if (a.d[0] === 0 && a1.y !== b1.y) { const my = (a1.y + b1.y) / 2; pts.push({ x: a1.x, y: my }, { x: b1.x, y: my }); }
      pts.push(b1, b);
      return pts.map(q => q.x + ',' + q.y).join(' ');
    }
    function renderSchemFree(note) {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      svg.appendChild(h('rect', { x: 0, y: 0, width: BW, height: BH, fill: '#fff' }));
      const cnt = {};
      S.wires.forEach(w => { cnt[w.a] = (cnt[w.a] || 0) + 1; cnt[w.b] = (cnt[w.b] || 0) + 1; });
      S.wires.forEach(w => { const a = tpos(w.a), b = tpos(w.b); if (a && b) svg.appendChild(h('polyline', { points: schemPath(a, b), fill: 'none', stroke: '#111', 'stroke-width': 3, 'stroke-linejoin': 'round' })); });
      S.parts.forEach(p => {
        const r = R && R.res[p.id], sy = symbol(p), lab = symLabel(p, r);
        const grp = h('g', { transform: `translate(${p.x} ${p.y}) rotate(${p.rot || 0})` }, sy, lab);
        if (p.rot) grp.querySelectorAll('text').forEach(t => t.setAttribute('transform', `rotate(${-p.rot} ${t.getAttribute('x')} ${t.getAttribute('y')})`));
        svg.appendChild(grp);
        Object.keys(termsOf(p)).forEach(t => { const q = tpos(p.id + '.' + t); svg.appendChild(h('circle', { cx: q.x, cy: q.y, r: (cnt[p.id + '.' + t] || 0) > 1 ? 6 : 4, fill: (cnt[p.id + '.' + t] || 0) ? '#111' : '#fff', stroke: '#111', 'stroke-width': 2 })); });
      });
      if (!S.parts.length) svg.appendChild(T('보드에 부품을 놓고 도선을 이으면 회로도가 그려져요', BW / 2, BH / 2, 24, '#9aa8b8', 'middle', 700));
      svg.appendChild(T(note || '', 14, BH - 12, 14, '#9a6a00', 'start', 700));
      renderPanels();
    }
    /* 표준 회로도: 직·병렬로 줄여서 전지 왼쪽, 부품은 위쪽 가로줄에 배치 */
    function spLayout() {
      const par = {}; const find = k => { if (par[k] === undefined) par[k] = k; return par[k] === k ? k : (par[k] = find(par[k])); };
      S.wires.forEach(w => { const ra = find(w.a), rb = find(w.b); par[ra] = rb; });
      const bats = S.parts.filter(p => p.type === 'bat' || p.type === 'acv');
      if (bats.length !== 1) return { err: bats.length ? '전원이 둘 이상이라' : '전원이 없어서' };
      const bat = bats[0], P = find(bat.id + '.+'), N = find(bat.id + '.-');
      if (P === N) return { err: '건전지 양쪽이 바로 이어져 있어서' };
      let edges = [];
      for (const p of S.parts) {
        if (p === bat) continue;
        if (p.type === 'pot') {
          const a = find(p.id + '.a'), w = find(p.id + '.w'), b = find(p.id + '.b'), used = S.wires.some(wi => wi.a === p.id + '.w' || wi.b === p.id + '.w');
          if (!used || w === a || w === b) { if (a === b) continue; edges.push({ u: a, v: b, tree: { k: 'leaf', p, rev: false, seg: !used ? 'all' : (w === a ? 'wb' : 'aw') } }); }
          else { edges.push({ u: a, v: w, tree: { k: 'leaf', p, rev: false, seg: 'aw' } }); edges.push({ u: w, v: b, tree: { k: 'leaf', p, rev: false, seg: 'wb' } }); }
          continue;
        }
        const ts = (isA(p) || isV(p)) ? ['+', '-'] : p.type === 'sw2' ? ['c', p.pos === 2 ? 't2' : 't1'] : (p.type === 'diode' || p.type === 'led') ? ['a', 'k'] : ['a', 'b'], u = find(p.id + '.' + ts[0]), v = find(p.id + '.' + ts[1]);
        if (u === v) return { err: '양쪽 단자가 같은 점에 이어진(합선) 부품이 있어서' };
        edges.push({ u, v, tree: { k: 'leaf', p, rev: false } });
      }
      const flip = t => t.k === 'leaf' ? { k: 'leaf', p: t.p, rev: !t.rev, seg: t.seg } : t.k === 'ser' ? { k: 'ser', kids: t.kids.slice().reverse().map(flip) } : { k: 'par', kids: t.kids.map(flip) };
      const orient = (e, from) => e.u === from ? e : { u: e.v, v: e.u, tree: flip(e.tree) };
      const kidsOf = (t, k) => t.k === k ? t.kids : [t];
      let dropped = 0, ch = true;
      while (ch) {
        ch = false;
        for (let i = 0; i < edges.length && !ch; i++) for (let j = i + 1; j < edges.length && !ch; j++) {
          const a = edges[i], b = edges[j];
          if ((a.u === b.u && a.v === b.v) || (a.u === b.v && a.v === b.u)) {
            const bb = orient(b, a.u); edges.splice(j, 1);
            edges[i] = { u: a.u, v: a.v, tree: { k: 'par', kids: kidsOf(a.tree, 'par').concat(kidsOf(bb.tree, 'par')) } }; ch = true;
          }
        }
        if (ch) continue;
        const deg = {}; edges.forEach(e => { deg[e.u] = (deg[e.u] || 0) + 1; deg[e.v] = (deg[e.v] || 0) + 1; });
        for (const n in deg) {
          if (n === P || n === N) continue;
          if (deg[n] === 1) { edges = edges.filter(e => e.u !== n && e.v !== n); dropped++; ch = true; break; }
          if (deg[n] === 2) {
            const es = edges.filter(e => e.u === n || e.v === n), e1 = es[0], e2 = es[1];
            const x = e1.u === n ? e1.v : e1.u, a1 = orient(e1, x), a2 = orient(e2, n);
            edges = edges.filter(e => e !== e1 && e !== e2);
            edges.push({ u: x, v: a2.v, tree: { k: 'ser', kids: kidsOf(a1.tree, 'ser').concat(kidsOf(a2.tree, 'ser')) } }); ch = true; break;
          }
        }
      }
      if (edges.length !== 1 || !((edges[0].u === P && edges[0].v === N) || (edges[0].u === N && edges[0].v === P))) return { err: edges.length ? '브리지처럼 직렬·병렬로 나눌 수 없는 연결이라' : '전지에서 이어진 부품이 없어서' };
      return { bat, tree: orient(edges[0], P).tree, dropped };
    }
    function renderSchem() {
      const SP = spLayout();
      if (SP.err) return renderSchemFree('※ ' + SP.err + ' 표준 모양으로 정리하지 못하고 보드 배치 그대로 그렸어요.');
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      svg.appendChild(h('rect', { x: 0, y: 0, width: BW, height: BH, fill: '#fff' }));
      const RAIL = 34, ST = { stroke: '#111', 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
      const g = h('g', ST);
      const ln = (x1, y1, x2, y2) => { if (x1 !== x2 || y1 !== y2) g.appendChild(h('line', { x1, y1, x2, y2 })); };
      const dot = (x, y) => g.appendChild(h('circle', { cx: x, cy: y, r: 5.5, fill: '#111', stroke: 'none' }));
      const tx = (t, x, y, sz, col, anc) => g.appendChild(h('text', { x, y, 'font-size': sz, fill: col || '#1c2733', 'text-anchor': anc || 'middle', 'font-weight': 700, stroke: 'none', 'font-family': '"Malgun Gothic","Segoe UI",sans-serif' }, t));
      const lay = t => {
        if (t.k === 'leaf') t.L = { w: (isA(t.p) || isV(t.p)) ? 110 : t.p.type === 'sw' ? 130 : ['bulb', 'led', 'sw2', 'pot'].includes(t.p.type) ? 170 : 140, h: 90, y: 45 };
        else {
          t.kids.forEach(lay);
          if (t.k === 'ser') { const top = Math.max(...t.kids.map(c => c.L.y)), bot = Math.max(...t.kids.map(c => c.L.h - c.L.y)); t.L = { w: t.kids.reduce((a, c) => a + c.L.w, 0), h: top + bot, y: top }; }
          else t.L = { w: Math.max(...t.kids.map(c => c.L.w)) + 2 * RAIL, h: t.kids.reduce((a, c) => a + c.L.h, 0), y: t.kids[0].L.y };
        }
      };
      function leaf(t, x, y) {
        const p = t.p, hw = t.L.w / 2, cx = x + hw, cy = y + t.L.y, r = R && R.res[p.id];
        const gg = h('g', { transform: `translate(${cx} ${cy})` }); const add = e => gg.appendChild(e);
        const L = (x1, y1, x2, y2) => add(h('line', { x1, y1, x2, y2 }));
        let name = p.name;
        if (p.type === 'res') {
          L(-hw, 0, -34, 0); L(34, 0, hw, 0); add(h('polyline', { points: '-34,0 -28,-14 -16,14 -4,-14 8,14 20,-14 28,0 34,0' }));
          name += ' ' + fmtOhm(p.nom);
        } else if (p.type === 'cap') {
          L(-hw, 0, -8, 0); L(8, 0, hw, 0); add(h('line', { x1: -8, y1: -22, x2: -8, y2: 22, 'stroke-width': 5 })); add(h('line', { x1: 8, y1: -22, x2: 8, y2: 22, 'stroke-width': 5 }));
          name += ' ' + fmtC(p.c);
        } else if (p.type === 'coil') {
          L(-hw, 0, -45, 0); L(45, 0, hw, 0); let d = 'M-45 0'; for (let i = 0; i < 6; i++) d += ' a7.5 18 0 0 1 15 0'; add(h('path', { d }));
          name += ' ' + fmtL(p.l);
        } else if (p.type === 'bulb') {
          L(-hw, 0, -24, 0); L(24, 0, hw, 0); add(h('circle', { cx: 0, cy: 0, r: 24, fill: '#fff' })); L(-17, -17, 17, 17); L(-17, 17, 17, -17);
          name += ' ' + BULBS[p.bt || 0].n;
        } else if (p.type === 'diode' || p.type === 'led') {
          L(-hw, 0, -16, 0); L(16, 0, hw, 0);
          const dg = h('g', t.rev ? { transform: 'scale(-1 1)' } : {});
          dg.appendChild(h('polygon', { points: '-16,-20 -16,20 14,0', fill: '#fff' })); dg.appendChild(h('line', { x1: 16, y1: -20, x2: 16, y2: 20 }));
          if (p.type === 'led') { dg.appendChild(h('line', { x1: -2, y1: -26, x2: 10, y2: -40 })); dg.appendChild(h('line', { x1: 10, y1: -26, x2: 22, y2: -40 })); dg.appendChild(h('polyline', { points: '4,-40 10,-41 9,-35', 'stroke-width': 2 })); dg.appendChild(h('polyline', { points: '16,-40 22,-41 21,-35', 'stroke-width': 2 })); name += ' ' + LEDS[p.col || 0].n; }
          add(dg);
        } else if (p.type === 'pot') {
          L(-hw, 0, -34, 0); L(34, 0, hw, 0); add(h('polyline', { points: '-34,0 -28,-14 -16,14 -4,-14 8,14 20,-14 28,0 34,0' }));
          const R0 = p.nom, x0 = p.pos == null ? 0.5 : p.pos, sg = t.seg;
          name += ' ' + fmtOhm(Math.round(sg === 'aw' ? R0 * x0 : sg === 'wb' ? R0 * (1 - x0) : sg === 'all' ? R0 : R0));
          if (sg === 'all' || sg === 'wb' || sg === 'aw') { add(h('line', { x1: -22, y1: 30, x2: 22, y2: -30, 'stroke-width': 2.5 })); add(h('polygon', { points: '22,-30 12,-24 16,-18', fill: '#111' })); }
        } else if (p.type === 'sw' || p.type === 'sw2') {
          L(-hw, 0, -30, 0); L(30, 0, hw, 0); add(h('circle', { cx: -30, cy: 0, r: 4.5, fill: '#111' })); add(h('circle', { cx: 30, cy: 0, r: 4.5, fill: '#111' }));
          if (p.type === 'sw2') name = '쌍투 ' + (p.pos === 2 ? '②' : '①');
          if (p.closed || p.type === 'sw2') L(-30, 0, 30, 0); else L(-30, 0, 24, -28);
        } else {
          const A = isA(p), lp = t.rev ? -1 : 1;
          L(-hw, 0, -26, 0); L(26, 0, hw, 0); add(h('circle', { cx: 0, cy: 0, r: 26, fill: '#fff' }));
          const q = h('text', { x: 0, y: 10, 'font-size': 28, 'text-anchor': 'middle', 'font-weight': 700, fill: '#111', stroke: 'none' }, A ? 'A' : 'V'); add(q);
          [[-1, lp === 1 ? '+' : '−'], [1, lp === 1 ? '−' : '+']].forEach(([sd, c]) => add(h('text', { x: sd * 38, y: -8, 'font-size': 18, 'text-anchor': 'middle', 'font-weight': 700, fill: '#111', stroke: 'none' }, c)));
        }
        g.appendChild(gg);
        tx(name, cx, cy - 38, 15);
        if (S.theory && r) tx(p.type === 'pot' ? `${(t.seg === 'wb' ? r.Vwb : t.seg === 'aw' ? r.Vaw : r.Vaw + r.Vwb).toFixed(2)} V · ${((t.seg === 'wb' ? r.Iwb : r.Iaw) * 1000).toFixed(1)} mA` : (r.V !== undefined && !isA(p) && !isV(p)) ? `${r.V.toFixed(2)} V · ${(r.I * 1000).toFixed(1)} mA` : (isA(p) ? (rd(r) * 1000).toFixed(2) + ' mA' : isV(p) ? rd(r).toFixed(3) + ' V' : ''), cx, cy + 44, 13, '#1d4a85');
      }
      function draw(t, x, y) {
        if (t.k === 'leaf') return leaf(t, x, y);
        if (t.k === 'ser') { let cx = x; t.kids.forEach(c => { draw(c, cx, y + t.L.y - c.L.y); cx += c.L.w; }); return; }
        const mw = t.L.w - 2 * RAIL; let cy = y; const ys = [];
        t.kids.forEach(c => {
          const off = (mw - c.L.w) / 2, py = cy + c.L.y; ys.push(py);
          draw(c, x + RAIL + off, cy);
          ln(x + RAIL, py, x + RAIL + off, py); ln(x + RAIL + off + c.L.w, py, x + t.L.w - RAIL, py);
          cy += c.L.h;
        });
        ln(x, ys[0], x + RAIL, ys[0]); ln(x + t.L.w - RAIL, ys[0], x + t.L.w, ys[0]);
        ln(x + RAIL, ys[0], x + RAIL, ys[ys.length - 1]); ln(x + t.L.w - RAIL, ys[0], x + t.L.w - RAIL, ys[ys.length - 1]);
        ys.forEach((py, i) => { if (i < ys.length - 1) { dot(x + RAIL, py); dot(x + t.L.w - RAIL, py); } });
      }
      const tree = SP.tree; lay(tree);
      const BX = 150, X0 = BX + 90, ym = tree.L.y, yb = Math.max(tree.L.h + 30, ym + 150);
      draw(tree, X0, 0);
      const cyb = (ym + yb) / 2, bat = SP.bat;
      if (bat.type === 'acv') {
        ln(BX, ym, X0, ym); ln(BX, ym, BX, cyb - 26); ln(BX, cyb + 26, BX, yb);
        g.appendChild(h('circle', { cx: BX, cy: cyb, r: 26, fill: '#fff' })); g.appendChild(h('path', { d: `M${BX - 16} ${cyb} q8 -22 16 0 t16 0` }));
        tx(bat.name, BX - 36, cyb - 2, 15, '#1c2733', 'end'); tx(`${bat.amp} V · ${bat.f} Hz`, BX - 36, cyb + 18, 14, '#1c2733', 'end');
      } else {
        ln(BX, ym, X0, ym); ln(BX, ym, BX, cyb - 9); ln(BX, cyb + 9, BX, yb);
        ln(BX - 20, cyb - 9, BX + 20, cyb - 9); g.appendChild(h('line', { x1: BX - 11, y1: cyb + 9, x2: BX + 11, y2: cyb + 9, 'stroke-width': 6 }));
        tx('+', BX + 30, cyb - 12, 20); tx('−', BX + 30, cyb + 22, 20);
        tx(bat.name, BX - 30, cyb - 2, 15, '#1c2733', 'end'); tx((CELL_E * bat.cells).toFixed(1) + ' V', BX - 30, cyb + 18, 15, '#1c2733', 'end');
      }
      const XR = X0 + tree.L.w; ln(XR, ym, XR, yb); ln(XR, yb, BX, yb);
      const W = XR + 24, H = yb + 24, sc = Math.min(1.25, (BW - 40) / W, (BH - 60) / H);
      g.setAttribute('transform', `translate(${(BW - W * sc) / 2 + 8 * sc} ${(BH - H * sc) / 2 + 16 * sc}) scale(${sc})`);
      svg.appendChild(g);
      svg.appendChild(T('회로도 · 도선 연결 점 ●' + (SP.dropped ? ' · 연결이 끊긴 부품은 뺐어요' : ''), 14, BH - 12, 14, '#6b7a8c', 'start', 700));
      renderPanels();
    }
    function render() {
      if (S.schem) { rafPending = false; return renderSchem(); }
      rafPending = false; needles = Object.assign({}, needles);
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      svg.appendChild(h('defs', null, h('pattern', { id: 'flgrid', width: 20, height: 20, patternUnits: 'userSpaceOnUse' }, h('circle', { cx: 1, cy: 1, r: 1, fill: '#d2dae6' }))));
      svg.appendChild(h('rect', { x: 0, y: 0, width: BW, height: BH, fill: '#f7f9fc' }));
      svg.appendChild(h('rect', { x: 0, y: 0, width: BW, height: BH, fill: 'url(#flgrid)' }));
      const gP = h('g'), gW = h('g'), gT = h('g'), gX = h('g');
      S.parts.forEach(p => {
        const r = R && R.res[p.id];
        const body = (DRAW[p.type] || drawMeter)(p, r);
        if (p.rot) body.querySelectorAll('text').forEach(t => t.setAttribute('transform', `rotate(${-p.rot} ${t.getAttribute('x')} ${t.getAttribute('y')})`));
        const grp = h('g', { transform: `translate(${p.x} ${p.y}) rotate(${p.rot || 0})`, 'data-id': p.id, style: 'cursor:move' }, body);
        if (S.sel && S.sel.k === 'part' && S.sel.id === p.id) {
          const bb = BB[p.type.startsWith('amm') || p.type.startsWith('vm') ? 'mtr' : p.type];
          grp.insertBefore(h('rect', { x: bb[0], y: bb[1], width: bb[2], height: bb[3], rx: 12, fill: 'rgba(31,111,214,.06)', stroke: '#1f6fd6', 'stroke-dasharray': '6 5', 'stroke-width': 2 }), grp.firstChild);
        }
        grp.addEventListener('pointerdown', e => partDown(e, p));
        gP.appendChild(grp);
        Object.keys(termsOf(p)).forEach(t => {
          const q = tpos(p.id + '.' + t), d = { d: q.d }, key = p.id + '.' + t, pend = S.pending === key;
          const plus = t === '+', minus = t === '-', col = plus ? '#d64545' : (minus ? '#26303c' : '#8a96a6');
          const tg = h('g', { transform: `translate(${q.x} ${q.y})`, style: 'cursor:crosshair' },
            h('circle', { r: 12, fill: col, stroke: pend ? '#1f6fd6' : '#fff', 'stroke-width': pend ? 4 : 2.5, class: pend ? 'fl-pend' : '' }),
            h('circle', { r: 4.5, fill: '#e9edf3' }),
            h('circle', { r: 32, fill: 'transparent' }));
          if (plus || minus) tg.appendChild(T(plus ? '+' : '−', d.d[0] * 22 + (d.d[0] === 0 ? (plus ? -14 : 14) : 0), d.d[1] * 20 + (d.d[1] === 0 ? -16 : (d.d[1] > 0 ? 8 : -2)), 18, plus ? '#d64545' : '#26303c', 'middle', 700));
          tg.addEventListener('pointerdown', e => termDown(e, key));
          gT.appendChild(tg);
        });
      });
      S.wires.forEach(w => {
        const a = tpos(w.a), b = tpos(w.b); if (!a || !b) return;
        const d = wirePath(a, b), sel = S.sel && S.sel.k === 'wire' && S.sel.id === w.id;
        if (sel) gW.appendChild(h('path', { d, fill: 'none', stroke: '#1f6fd6', 'stroke-width': 11, 'stroke-opacity': .35, 'stroke-linecap': 'round' }));
        gW.appendChild(h('path', { d, fill: 'none', stroke: WCOL[w.c] || '#444', 'stroke-width': 5, 'stroke-linecap': 'round' }));
        const hit = h('path', { d, fill: 'none', stroke: 'transparent', 'stroke-width': 20, style: 'cursor:pointer' });
        hit.addEventListener('pointerdown', e => { e.stopPropagation(); S.sel = { k: 'wire', id: w.id }; S.pending = null; schedule(); });
        gW.appendChild(hit);
      });
      svg.appendChild(gW); svg.appendChild(gP); svg.appendChild(gT); svg.appendChild(gX);
      svg._gX = gX;
      if (!S.parts.length) svg.appendChild(T('왼쪽 부품 상자에서 부품을 끌어다 놓아 실험을 꾸며 보세요', BW / 2, BH / 2, 24, '#9aa8b8', 'middle', 700));
      renderPanels();
    }
    const schedule = () => { if (!rafPending) { rafPending = true; requestAnimationFrame(render); } };

    /* ---------- 계산·패널 ---------- */
    function update() {
      S.beLeft = 3; solveNow();
      msgs = diagnose(S.parts, R);
      if (S.parts.length && !msgs.length && !hasDyn()) {
        const bat = S.parts.filter(p => p.type === 'bat'), sw = S.parts.filter(p => p.type === 'sw');
        if (bat.length && S.wires.length && sw.some(s => !s.closed) && bat.every(b => Math.abs(R.res[b.id].I) < 1e-4)) msgs.push(['info', '스위치가 열려 있어서 전류가 흐르지 않아요. 레버를 눌러 닫아 보세요.']);
        else if (bat.length && S.wires.length >= 2 && bat.every(b => Math.abs(R.res[b.id].I) < 1e-4)) msgs.push(['info', '전류가 흐르지 않아요. 전지에서 나간 도선이 다시 전지로 돌아오는 닫힌 회로인지 확인하세요.']);
        if (!bat.length) msgs.push(['info', '건전지를 가져다 놓으면 회로에 전류가 흘러요.']);
      }
      save(); schedule(); drawChart();
    }
    function renderPanels() {
      const mt = $('fl-meters'), ms = S.parts.filter(p => isA(p) || isV(p));
      mt.innerHTML = ms.length ? '<tr><th>계기</th><th>범위</th><th>눈금/값</th></tr>' + ms.map(p => {
        const r = R && R.res[p.id], an = isAnalog(p), A = isA(p);
        let val = an ? (S.theory && r ? (A ? (rd(r) * 1000).toFixed(2) + ' mA' : rd(r).toFixed(3) + ' V') : '눈금을 읽으세요') : (r ? (Math.abs(rd(r)) > 1.1 * rangeOf(p) ? 'OL' : fmtDigital(p, rd(r))) : '-');
        return `<tr><td>${p.name}<br><small>${an ? '아날로그' : '디지털'}·${p.mode === 'AC' ? 'AC' : 'DC'}</small></td><td>${(A ? AR : VR)[p.range]}</td><td>${val}</td></tr>`;
      }).join('') : '<tr><td>전류계·전압계를 놓으면 여기에 표시돼요</td></tr>';
      const mb = $('fl-msgs'); mb.innerHTML = msgs.map(m => `<div class="fl-msg ${m[0]}">${m[1]}</div>`).join('');
      renderRec();
      updatePop(); $('fl-sim').hidden = !hasDyn(); $('fl-run').textContent = S.run ? '⏸ 멈춤' : '▶ 계속'; $('fl-t').textContent = fmtT(S.t);
      if ($('fl-speed').value !== String(S.speed)) $('fl-speed').value = String(S.speed);
      if ($('fl-win').value !== String(S.win)) $('fl-win').value = String(S.win);
      $('fl-schem').textContent = S.schem ? '🔧 보드로 돌아가기' : '🔌 회로도 보기'; $('fl-rot').disabled = S.schem;
      $('fl-hide').checked = S.hideVal; $('fl-theory').checked = S.theory;
    }
    const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

    /* ---------- 상호작용 ---------- */
    function moved(e0, e) { return Math.hypot(e.clientX - e0.clientX, e.clientY - e0.clientY); }
    function nearestTerm(pt, excl) {
      let best = null, bd = 36;
      S.parts.forEach(p => Object.keys(termsOf(p)).forEach(t => { const k = p.id + '.' + t; if (k === excl) return; const q = tpos(k), d = Math.hypot(q.x - pt.x, q.y - pt.y); if (d < bd) { bd = d; best = k; } }));
      return best;
    }
    function track(onMove, onUp) {
      const mv = e => onMove(e), up = e => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up); onUp(e); };
      document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
    }
    function partDown(e, p) {
      if (e.button !== undefined && e.button !== 0) return;
      const act = e.target.closest && e.target.closest('[data-act]');
      e.preventDefault(); e.stopPropagation();
      S.sel = { k: 'part', id: p.id }; S.pending = null;
      const e0 = e, pt0 = toBoard(e), ox = pt0.x - p.x, oy = pt0.y - p.y; let dragged = false;
      track(ev => {
        if (!dragged && moved(e0, ev) < 6) return; dragged = true;
        const pt = toBoard(ev); p.x = Math.max(60, Math.min(BW - 60, snap(pt.x - ox))); p.y = Math.max(60, Math.min(BH - 60, snap(pt.y - oy)));
        const tr = $('fl-trash'), rr = $('fl-board').getBoundingClientRect(); tr.classList.toggle('hot', ev.clientX < rr.left || ev.clientX > rr.right || ev.clientY < rr.top - 30 || ev.clientY > rr.bottom + 30);
        schedule();
      }, ev => {
        $('fl-trash').classList.remove('hot');
        if (dragged) { const rr = $('fl-board').getBoundingClientRect(); if (ev.clientX < rr.left || ev.clientX > rr.right || ev.clientY < rr.top - 30 || ev.clientY > rr.bottom + 30) { removePart(p.id); return; } save(); schedule(); return; }
        if (act) {
          const a = act.getAttribute('data-act');
          if (a === 'sw') p.closed = !p.closed; else if (a === 'sw2') p.pos = p.pos === 2 ? 1 : 2; else if (a === 'mode') p.mode = p.mode === 'AC' ? 'DC' : 'AC';
          else if (a === 'range') p.range = (p.range + 1) % (isA(p) ? 3 : 2);
          else if (a === 'cell') p.cells = Math.max(1, Math.min(6, p.cells + (+act.getAttribute('data-d'))));
          update();
        } else schedule();
      });
    }
    function termDown(e, key) {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const e0 = e, a = tpos(key); let isDrag = false;
      track(ev => {
        if (!isDrag && moved(e0, ev) < 8) return; isDrag = true;
        const pt = toBoard(ev), near = nearestTerm(pt, key), tgt = near ? tpos(near) : null;
        const g = svg._gX; while (g.firstChild) g.removeChild(g.firstChild);
        g.appendChild(h('path', { d: wirePath(a, { x: tgt ? tgt.x : pt.x, y: tgt ? tgt.y : pt.y, d: tgt ? tgt.d : [0, 0] }), fill: 'none', stroke: '#1f6fd6', 'stroke-width': 4, 'stroke-dasharray': '2 9', 'stroke-linecap': 'round' }));
        if (tgt) g.appendChild(h('circle', { cx: tgt.x, cy: tgt.y, r: 20, fill: 'none', stroke: '#1e8f4e', 'stroke-width': 3 }));
      }, ev => {
        const g = svg._gX; if (g) while (g.firstChild) g.removeChild(g.firstChild);
        if (isDrag) { const near = nearestTerm(toBoard(ev), key); S.pending = null; if (near) addWire(key, near); else schedule(); return; }
        if (S.pending && S.pending !== key) { const from = S.pending; S.pending = null; addWire(from, key); }
        else S.pending = (S.pending === key) ? null : key;
        schedule();
      });
    }
    svg.addEventListener('pointerdown', e => { if (e.target === svg || e.target.tagName === 'rect') { S.sel = null; S.pending = null; schedule(); } });

    /* 부품 상자: 끌어 놓기 또는 눌러서 추가 */
    function itemIcon(type, nom) {
      const s = h('svg', { width: 46, height: 30, viewBox: '-24 -15 48 30' });
      if (type === 'res') { const b = bandColors(nom); s.appendChild(h('line', { x1: -22, y1: 0, x2: 22, y2: 0, stroke: '#9aa5b3', 'stroke-width': 3 })); s.appendChild(h('rect', { x: -15, y: -8, width: 30, height: 16, rx: 6, fill: '#ecd5a6', stroke: '#a58650' })); [[-9, b[0]], [-3, b[1]], [3, b[2]], [10, '#d4a82a']].forEach(([x, c]) => s.appendChild(h('rect', { x, y: -8, width: 3.5, height: 16, fill: c }))); }
      else if (type === 'acv') { s.appendChild(h('rect', { x: -20, y: -12, width: 40, height: 24, rx: 4, fill: '#3b3358' })); s.appendChild(h('circle', { r: 9, fill: '#fff' })); s.appendChild(h('path', { d: 'M-6 0 q3 -8 6 0 t6 0', fill: 'none', stroke: '#3b3358', 'stroke-width': 1.6 })); }
      else if (type === 'bulb') { s.appendChild(h('line', { x1: -22, y1: 0, x2: 22, y2: 0, stroke: '#9aa5b3', 'stroke-width': 3 })); s.appendChild(h('circle', { r: 10, fill: '#fff6c8', stroke: '#6b7a8c', 'stroke-width': 1.8 })); s.appendChild(h('path', { d: 'M-5 4 L-3 -3 L0 4 L3 -3 L5 4', fill: 'none', stroke: '#ff8a00', 'stroke-width': 1.4 })); }
      else if (type === 'pot') { s.appendChild(h('rect', { x: -18, y: -6, width: 36, height: 12, rx: 3, fill: '#2f7d5b' })); s.appendChild(h('line', { x1: 2, y1: -14, x2: 2, y2: -3, stroke: '#3a4658', 'stroke-width': 2.5 })); }
      else if (type === 'diode' || type === 'led') { s.appendChild(h('line', { x1: -22, y1: 0, x2: 22, y2: 0, stroke: '#9aa5b3', 'stroke-width': 3 })); s.appendChild(h('rect', { x: -14, y: -8, width: 28, height: 16, rx: type === 'led' ? 8 : 2, fill: type === 'led' ? '#ffd2cf' : '#2b2b2b', stroke: '#6b7a8c' })); s.appendChild(h('polygon', { points: '-6,-6 -6,6 5,0', fill: '#444' })); s.appendChild(h('line', { x1: 6, y1: -7, x2: 6, y2: 7, stroke: '#222', 'stroke-width': 2 })); }
      else if (type === 'sw2') { s.appendChild(h('rect', { x: -20, y: 6, width: 40, height: 5, fill: '#4a5666' })); s.appendChild(h('line', { x1: -16, y1: 2, x2: 14, y2: -10, stroke: '#1e8f4e', 'stroke-width': 3, 'stroke-linecap': 'round' })); s.appendChild(h('circle', { cx: 16, cy: -10, r: 2.5, fill: '#888' })); s.appendChild(h('circle', { cx: 16, cy: 6, r: 2.5, fill: '#888' })); }
      else if (type === 'cap') { s.appendChild(h('line', { x1: -22, y1: 0, x2: 22, y2: 0, stroke: '#9aa5b3', 'stroke-width': 3 })); s.appendChild(h('rect', { x: -14, y: -11, width: 28, height: 22, rx: 5, fill: '#2f62b5', stroke: '#1d3f7a', 'stroke-width': 1.5 })); s.appendChild(h('rect', { x: -8, y: -5, width: 16, height: 10, fill: '#ffd166' })); }
      else if (type === 'coil') { s.appendChild(h('line', { x1: -22, y1: 0, x2: 22, y2: 0, stroke: '#9aa5b3', 'stroke-width': 3 })); let d = 'M-16 0'; for (let i = 0; i < 4; i++) d += ' a4 10 0 0 1 8 0'; s.appendChild(h('path', { d, fill: 'none', stroke: '#b8651b', 'stroke-width': 4, 'stroke-linecap': 'round' })); }
      else if (type === 'bat') { s.appendChild(h('rect', { x: -20, y: -11, width: 40, height: 22, rx: 4, fill: '#2d3b52' })); s.appendChild(h('rect', { x: -15, y: -6, width: 6, height: 10, fill: '#ffd166' })); s.appendChild(h('rect', { x: -5, y: -6, width: 6, height: 10, fill: '#ffd166' })); s.appendChild(h('rect', { x: 5, y: -6, width: 6, height: 10, fill: '#ffd166' })); }
      else if (type === 'sw') { s.appendChild(h('rect', { x: -20, y: 4, width: 40, height: 6, fill: '#4a5666' })); s.appendChild(h('line', { x1: -16, y1: 3, x2: 14, y2: -9, stroke: '#c0861a', 'stroke-width': 3, 'stroke-linecap': 'round' })); }
      else { const A = type.startsWith('amm'), c = A ? '#1b8fb8' : '#7a4fd1'; s.appendChild(h('rect', { x: -15, y: -13, width: 30, height: 26, rx: 4, fill: type.endsWith('A') ? '#f8f7f1' : '#b9d1a0', stroke: c, 'stroke-width': 2 })); s.appendChild(T(A ? 'A' : 'V', 0, 5, 14, c, 'middle', 700)); }
      return s;
    }
    const fmtF = v => v + ' Hz';
    const ITEMS = ['전원', ['bat', '건전지'], ['acv', '교류전원'], '스위치', ['sw', '스위치 (단투)'], ['sw2', '스위치 (쌍투)'],
      '값을 고른 뒤 놓기 (놓은 뒤에도 바꿀 수 있어요)', ['res', '저항'], ['pot', '가변저항'], ['bulb', '전구'], ['cap', '축전기'], ['coil', '코일'], ['diode', '다이오드'], ['led', 'LED'],
      '계기', ['ammA', '전류계 (아날로그)'], ['ammD', '전류계 (디지털)'], ['vmA', '전압계 (아날로그)'], ['vmD', '전압계 (디지털)']];
    const OPTS = { res: [E_NOMINAL, fmtOhm, 100], pot: [POT_R, fmtOhm, 470], bulb: [[0, 1, 2], i => BULBS[i].n, 0], cap: [CAP_UF, fmtC, 100], coil: [COIL_MH, fmtL, 100], led: [[0, 1, 2, 3], i => LEDS[i].n, 0], acv: [FREQS, fmtF, 50] };
    const itemsBox = $('fl-items');
    const fillOpts = (sel, list, fmt, cur) => { const L = list.indexOf(cur) < 0 && cur ? list.concat([cur]).sort((a, b) => a - b) : list; sel.innerHTML = L.map(n => `<option value="${n}"${n === cur ? ' selected' : ''}>${fmt(n)}</option>`).join(''); };
    ITEMS.forEach(it => {
      if (typeof it === 'string') { itemsBox.appendChild(Object.assign(document.createElement('div'), { className: 'fl-sep', textContent: it })); return; }
      const [type, label] = it;
      const d = document.createElement('div'); d.className = 'fl-item'; d.setAttribute('role', 'button'); d.title = label;
      let icon = itemIcon(type, 100), sel = null; const op = OPTS[type];
      d.appendChild(icon); d.appendChild(Object.assign(document.createElement('span'), { textContent: label }));
      if (op) {
        sel = document.createElement('select'); sel.title = '값 고르기'; fillOpts(sel, op[0], op[1], op[2]); d.appendChild(sel);
        sel.addEventListener('change', () => { if (type === 'res') { const n = itemIcon('res', +sel.value); d.replaceChild(n, icon); icon = n; } });
      }
      d.addEventListener('pointerdown', e => {
        if (e.target.tagName === 'SELECT') return;
        if (e.button !== undefined && e.button !== 0) return; e.preventDefault(); const e0 = e, val = sel ? +sel.value : null; let dragged = false;
        const ghost = d.cloneNode(true); ghost.style.cssText = 'position:fixed;pointer-events:none;opacity:.85;z-index:9999;background:#fff;box-shadow:0 4px 14px rgba(0,0,0,.25);width:150px'; document.body.appendChild(ghost);
        const place = ev => { ghost.style.left = (ev.clientX - 75) + 'px'; ghost.style.top = (ev.clientY - 16) + 'px'; };
        place(e);
        track(ev => { if (moved(e0, ev) > 6) dragged = true; place(ev); }, ev => {
          ghost.remove(); const rr = $('fl-board').getBoundingClientRect();
          if (dragged) { if (ev.clientX >= rr.left && ev.clientX <= rr.right && ev.clientY >= rr.top && ev.clientY <= rr.bottom) { const pt = toBoard(ev); addPart(type, { nom: val, val }, pt.x, pt.y); } }
          else addPart(type, { nom: val, val });
        });
      });
      itemsBox.appendChild(d);
    });

    /* 놓은 부품의 값 바꾸기: 부품 옆에 뜨는 작은 편집 창 */
    const pop = document.createElement('div'); pop.className = 'fl-pop'; pop.hidden = true;
    $('fl-board').appendChild(pop);
    const nF = (key, unit, min, max, list, fmt) => ({ key, unit, min, max, list, fmt });
    const repl = (p, what) => ({ btn: '🔧 새 ' + what + '로 교체', show: !!p.blown, fn: () => { p.blown = false; } });
    const POPD = {
      res: () => [nF('nom', 'Ω', 1, 1e6, E_NOMINAL, fmtOhm)], cap: () => [nF('c', 'µF', 1, 100000, CAP_UF, fmtC)], coil: () => [nF('l', 'mH', 1, 5000, COIL_MH, fmtL)],
      pot: () => [nF('nom', 'Ω', 10, 1e5, POT_R, fmtOhm), { key: 'pos', range: true, label: '손잡이' }],
      acv: () => [nF('amp', 'V(최대)', 0.5, 12, [3, 6, 9, 12], v => v + ' V'), nF('f', 'Hz', 1, 2000, FREQS, fmtF)],
      bulb: p => [{ key: 'bt', choice: [0, 1, 2], fmt: i => BULBS[i].n }, repl(p, '전구')], led: p => [{ key: 'col', choice: [0, 1, 2, 3], fmt: i => LEDS[i].n }, repl(p, 'LED')], diode: p => [repl(p, '다이오드')]
    };
    function buildPop(p, fs) {
      pop.innerHTML = ''; const t = document.createElement('b'); t.textContent = p.name; pop.appendChild(t);
      fs.forEach(f => {
        if (f.btn) { if (!f.show) return; const b = document.createElement('button'); b.textContent = f.btn; b.addEventListener('click', () => { f.fn(); update(); }); pop.appendChild(b); return; }
        if (f.range) {
          const lb = document.createElement('span'); lb.textContent = f.label; const r = document.createElement('input'); r.type = 'range'; r.min = 0; r.max = 1; r.step = 0.01; r.className = 'fl-rng'; r.value = p[f.key];
          const pc = document.createElement('span'); pc.className = 'fl-pc'; pc.textContent = Math.round(p[f.key] * 100) + '%';
          r.addEventListener('input', () => { p[f.key] = +r.value; pc.textContent = Math.round(p[f.key] * 100) + '%'; update(); }); pop.append(lb, r, pc); return;
        }
        if (f.choice) { const se = document.createElement('select'); se.innerHTML = f.choice.map(c => `<option value="${c}"${c === p[f.key] ? ' selected' : ''}>${f.fmt(c)}</option>`).join(''); se.addEventListener('change', () => { p[f.key] = +se.value; update(); }); pop.appendChild(se); return; }
        const se = document.createElement('select'), inp = document.createElement('input'), u = document.createElement('span'); fillOpts(se, f.list, f.fmt, p[f.key]);
        inp.type = 'number'; inp.step = 'any'; inp.min = 0; inp.value = p[f.key]; u.textContent = f.unit;
        const ap = v => { if (!isFinite(v) || v <= 0) return; p[f.key] = Math.max(f.min, Math.min(f.max, v)); update(); };
        se.addEventListener('change', () => ap(+se.value)); inp.addEventListener('change', () => ap(+inp.value)); pop.append(se, inp, u);
      });
    }
    pop.addEventListener('pointerdown', e => e.stopPropagation());
    function updatePop() {
      const p = S.sel && S.sel.k === 'part' && partById(S.sel.id), mk = p && POPD[p.type], fs = mk && mk(p);
      if (!fs || S.schem) { pop.hidden = true; pop._sig = ''; return; }
      const sig = p.id + '|' + JSON.stringify(fs.filter(f => !f.range && !f.btn).map(f => p[f.key])) + '|' + !!p.blown; pop.hidden = false;
      if (pop._sig !== sig) { pop._sig = sig; buildPop(p, fs); }
      else { const r = pop.querySelector('.fl-rng'); if (r && document.activeElement !== r) r.value = p.pos; }
      const sc = svg.clientWidth / BW, vert = (p.rot || 0) % 180 !== 0, bb = BB[p.type];
      pop.style.left = (p.x * sc) + 'px'; pop.style.top = ((p.y + (vert ? bb[2] / 2 : bb[1] + bb[3]) + 8) * sc) + 'px';
    }

    /* 시간에 따른 변화(축전기·코일·교류) */
    const fmtT = t => t < 1 ? (t * 1000).toFixed(t < 0.01 ? 1 : 0) + ' ms' : t.toFixed(2) + ' s';
    let frameN = 0;
    function checkBlow() { let ch = false; S.parts.forEach(p => { const r = R && R.res[p.id]; if (r && r.blow && !p.blown) { p.blown = true; ch = true; } }); return ch; }
    function setDisp() {
      const ac = S.parts.some(p => p.type === 'acv');
      S.parts.forEach(p => { if (!(isA(p) || isV(p))) return; const r = R.res[p.id], a = S.macc[p.id]; if (r) r.disp = ac && a ? (p.mode === 'AC' ? Math.sqrt(Math.max(0, a.q)) : a.m) : r.reading; });
      if (ac) S.parts.forEach(p => { const a = p.type === 'res' && S.macc['P' + p.id]; if (a) R.res[p.id].P = a.m; });
    }
    function solveNow() {
      for (let k = 0; k < 2; k++) { R = hasDyn() ? analyze(S.parts, S.wires, S.dyn, 1e-6, false, S.t) : analyze(S.parts, S.wires, S.dyn, 0, false, S.t); if (!checkBlow()) break; }
      setDisp();
    }
    function resetSim() { S.dyn = {}; S.macc = {}; S.t = 0; S.hist = []; S.beLeft = 3; solveNow(); record(); drawChart(); }
    function record() {
      const m = {}; S.parts.forEach(p => { const r = R && R.res[p.id]; if (isA(p) || isV(p)) m[p.id] = r ? r.reading : 0; else if (p.type === 'acv') m[p.id] = r ? r.Vt : 0; });
      S.hist.push({ t: S.t, m }); if (S.hist.length > 40000) S.hist.splice(0, 8000);
    }
    function simStep(wall) {
      const acs = S.parts.filter(p => p.type === 'acv'); let dtmax = 2e-4;
      if (acs.length) dtmax = Math.min(dtmax, 1 / (Math.max(...acs.map(p => p.f)) * 100));
      let adv = wall * S.speed; if (adv <= 0) return;
      let n = Math.ceil(adv / dtmax); if (n > 150) { n = 150; if (acs.length) adv = n * dtmax; }
      const dt = adv / n, tauM = Math.max(0.05, 5 / (acs.length ? Math.min(...acs.map(p => p.f)) : 1e9)), al = 1 - Math.exp(-dt / tauM), meters = S.parts.filter(p => isA(p) || isV(p));
      for (let i = 0; i < n; i++) {
        S.t += dt; const m = (S.beLeft > 0 || !acs.length) ? 'be' : 'tr'; if (S.beLeft > 0) S.beLeft--;
        R = analyze(S.parts, S.wires, S.dyn, dt, true, S.t, { m });
        S.parts.forEach(p => { if (p.type === 'res') { const r = R.res[p.id], a = S.macc['P' + p.id] || (S.macc['P' + p.id] = { m: r.P }); a.m += al * (r.P - a.m); } });
        meters.forEach(p => { const x = R.res[p.id].reading, a = S.macc[p.id] || (S.macc[p.id] = { m: x, q: x * x }); a.m += al * (x - a.m); a.q += al * (x * x - a.q); });
        checkBlow(); record();
      }
      setDisp(); msgs = diagnose(S.parts, R); schedule(); if (frameN++ % 3 === 0) drawChart();
    }
    function drawChart() {
      const box = $('fl-chart'), src = S.parts.filter(p => p.type === 'acv'), vs = S.parts.filter(isV), as = S.parts.filter(isA);
      if (!hasDyn() || !(src.length + vs.length + as.length) || S.hist.length < 2) { box.innerHTML = ''; return; }
      const tEnd = Math.max(S.t, 1e-3), span = S.win > 0 ? S.win : tEnd, t0 = S.win > 0 ? Math.max(0, tEnd - S.win) : 0;
      let lo = 0, hi = S.hist.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (S.hist[mid].t < t0) lo = mid + 1; else hi = mid; }
      const seg = S.hist.slice(lo); if (seg.length < 2) { box.innerHTML = ''; return; }
      const stp = Math.max(1, Math.floor(seg.length / 1200)), pts = seg.filter((_, i) => i % stp === 0);
      const groups = [[src.concat(vs), 1, 'V'], [as, 1000, 'mA']].filter(g => g[0].length);
      const W = 900, H = 160, pl = 58, pr = 12, pt = 12, pb = 26, COL = ['#7a4fd1', '#1b8fb8', '#d64545', '#1e8f4e', '#e08a00'];
      let out = '';
      groups.forEach(([list, sc, unit]) => {
        let ylo = 0, yhi = 0; pts.forEach(sm => list.forEach(p => { const v = (sm.m[p.id] || 0) * sc; ylo = Math.min(ylo, v); yhi = Math.max(yhi, v); }));
        if (yhi - ylo < 1e-9) yhi = ylo + 1; const pad = (yhi - ylo) * 0.1; yhi += pad; if (ylo < 0) ylo -= pad;
        const X = t => pl + (W - pl - pr) * (t - t0) / span, Y = v => pt + (H - pt - pb) * (1 - (v - ylo) / (yhi - ylo));
        let g = `<rect width="${W}" height="${H}" fill="#fff"/>`;
        for (let k = 0; k <= 4; k++) { const tt = t0 + span * k / 4; g += `<line x1="${X(tt)}" x2="${X(tt)}" y1="${pt}" y2="${H - pb}" stroke="#eef2f7"/><text x="${X(tt)}" y="${H - 8}" font-size="12" text-anchor="${k === 0 ? 'start' : k === 4 ? 'end' : 'middle'}" fill="#5b6877">${fmtT(tt)}</text>`; }
        [ylo, (ylo + yhi) / 2, yhi].forEach(v => { g += `<line x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}" stroke="#e1e7ef"/><text x="${pl - 6}" y="${Y(v) + 4}" font-size="12" text-anchor="end" fill="#5b6877">${v.toFixed(Math.abs(yhi) < 10 ? 2 : 0)}</text>`; });
        g += `<line x1="${pl}" x2="${pl}" y1="${pt}" y2="${H - pb}" stroke="#8a96a6"/><line x1="${pl}" x2="${W - pr}" y1="${Y(0)}" y2="${Y(0)}" stroke="#8a96a6"/><text x="12" y="${pt + 10}" font-size="12" fill="#5b6877">${unit}</text>`;
        let k = 0; list.forEach(p => { const isSrc = p.type === 'acv', c = isSrc ? '#444' : COL[k++ % COL.length]; g += `<polyline fill="none" stroke="${c}" stroke-width="${isSrc ? 1.8 : 2.4}"${isSrc ? ' stroke-dasharray="6 4"' : ''} points="${pts.map(sm => X(sm.t).toFixed(1) + ',' + Y((sm.m[p.id] || 0) * sc).toFixed(1)).join(' ')}"/>`; });
        let lx = pl + 10;
        let kk = 0; list.forEach(p => { const isSrc = p.type === 'acv', c = isSrc ? '#444' : COL[kk++ % COL.length]; g += `<text x="${lx}" y="${pt + 12}" font-size="13" font-weight="700" fill="${c}">${isSrc ? '┅' : '━'} ${p.name}</text>`; lx += 20 + p.name.length * 12; });
        out += `<svg viewBox="0 0 ${W} ${H}" class="fl-ch">${g}</svg>`;
      });
      box.innerHTML = out;
    }
    $('fl-run').addEventListener('click', () => { S.run = !S.run; schedule(); });
    $('fl-reset').addEventListener('click', () => { resetSim(); update(); });
    $('fl-speed').addEventListener('change', e => { S.speed = +e.target.value; });
    $('fl-win').addEventListener('change', e => { S.win = +e.target.value; drawChart(); });

    /* 막대 단추와 기록 */
    function delSel() { if (!S.sel) return; if (S.sel.k === 'part') removePart(S.sel.id); else { S.wires = S.wires.filter(w => w.id !== S.sel.id); S.sel = null; update(); } }
    $('fl-del').addEventListener('click', delSel);
    function rotSel() { const p = S.sel && S.sel.k === 'part' && partById(S.sel.id); if (!p || S.schem) return; p.rot = ((p.rot || 0) + 90) % 360; update(); }
    $('fl-rot').addEventListener('click', rotSel);
    $('fl-schem').addEventListener('click', () => { S.schem = !S.schem; S.pending = null; schedule(); });
    $('fl-clear').addEventListener('click', () => { if (!S.parts.length || confirm('보드의 부품과 도선을 모두 지울까요?')) { S.parts = []; S.wires = []; S.sel = null; S.pending = null; S.cnt = { R: 0, A: 0, V: 0, B: 0 }; needles = {}; S.dyn = {}; S.t = 0; S.hist = []; update(); } });
    $('fl-hide').addEventListener('change', e => { S.hideVal = e.target.checked; save(); schedule(); });
    $('fl-theory').addEventListener('change', e => { S.theory = e.target.checked; schedule(); });
    /* 측정 기록표: 읽은 값, (교사용) 이론값과 오차 */
    function parseVal(row) {
      const m = String(row.val || '').replace(',', '.').match(/(-?\d*\.?\d+)\s*(mA|A|mV|V)?/i); if (!m) return null;
      const u = (m[2] || row.du || row.u || '').toLowerCase(); return +m[1] * (u === 'ma' || u === 'mv' ? 1e-3 : 1);
    }
    const thTxt = r => r.th == null ? '-' : (r.u === 'A' ? (r.th * 1000).toFixed(2) + ' mA' : r.th.toFixed(3) + ' V');
    function errTxt(r) { const m = parseVal(r); if (r.th == null || m == null || Math.abs(r.th) < 1e-9) return '-'; return (Math.abs(Math.abs(m) - Math.abs(r.th)) / Math.abs(r.th) * 100).toFixed(1) + ' %'; }
    function renderRec() {
      const rt = $('fl-rec'), sig = S.rows.length + '|' + S.theory; if (rt._sig === sig) return; rt._sig = sig;
      rt.innerHTML = '<tr><th>#</th><th>무엇을 쟀나요?</th><th>읽은 값</th>' + (S.theory ? '<th>이론값</th><th>오차</th>' : '') + '</tr>' +
        (S.rows.length ? S.rows.map((r, i) => `<tr><td>${i + 1}</td><td><input type="text" data-r="${i}" data-f="label" value="${esc(r.label)}" placeholder="예: R₁ 양단"></td><td><input type="text" data-r="${i}" data-f="val" value="${esc(r.val)}" placeholder="예: 2.0 V, 0.06 A"></td>${S.theory ? `<td>${thTxt(r)}</td><td class="errc">${errTxt(r)}</td>` : ''}</tr>`).join('') : '<tr><td colspan="5">아직 기록이 없어요</td></tr>');
      rt.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => {
        const r = S.rows[+inp.dataset.r]; r[inp.dataset.f] = inp.value; save();
        const e = inp.closest('tr').querySelector('.errc'); if (e) e.textContent = errTxt(r);
      }));
    }
    $('fl-addrow').addEventListener('click', () => {
      const ms = S.parts.filter(p => isA(p) || isV(p)), th = hasDyn() ? null : analyze(S.parts, S.wires, S.dyn, 0, false, S.t, { ideal: true });
      if (!ms.length) S.rows.push({ label: '', val: '', th: null, u: '' });
      else ms.forEach(p => {
        const r = R && R.res[p.id], A = isA(p);
        S.rows.push({ label: p.name + (A ? ' 전류' : ' 전압'), val: (!isAnalog(p) && r) ? fmtDigital(p, rd(r)) : '', th: th ? Math.abs(th.res[p.id].reading) : null, u: A ? 'A' : 'V', du: A ? (rangeOf(p) < 1 ? 'mA' : 'A') : 'V' });
      });
      $('fl-rec')._sig = ''; save(); schedule();
    });
    $('fl-clrrows').addEventListener('click', () => { S.rows = []; $('fl-rec')._sig = ''; save(); schedule(); });
    const flash = (b, t0, t1) => { b.textContent = t1; setTimeout(() => { b.textContent = t0; }, 1400); };
    const shareURL = () => location.href.split('#')[0] + '#free=' + encCircuit();
    $('fl-copy').addEventListener('click', () => {
      const t = '[회로] ' + shareURL() + '\n#\t무엇을 쟀나요\t읽은 값' + (S.theory ? '\t이론값\t오차' : '') + '\n' + S.rows.map((r, i) => (i + 1) + '\t' + r.label + '\t' + r.val + (S.theory ? '\t' + thTxt(r) + '\t' + errTxt(r) : '')).join('\n');
      if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => flash($('fl-copy'), '📋 보고서 복사', '복사됨 ✓'), () => { });
    });
    $('fl-link').addEventListener('click', () => { if (navigator.clipboard) navigator.clipboard.writeText(shareURL()).then(() => flash($('fl-link'), '🔗 회로 링크 복사', '복사됨 ✓'), () => { }); });
    $('fl-load').addEventListener('click', () => {
      const t = prompt('복사해 둔 회로 링크(또는 코드)를 붙여넣으세요'); if (!t) return;
      const m = t.match(/free=([A-Za-z0-9_-]+)/), code = m ? m[1] : t.trim();
      try { loadCircuit(decCircuit(code)); } catch (e) { alert('회로를 읽지 못했어요. 링크가 잘렸는지 확인하세요.'); }
    });
    /* 회로 저장·공유: 부품과 도선을 압축해 링크 뒤(#free=…)에 담는다 */
    const encCircuit = () => btoa(unescape(encodeURIComponent(JSON.stringify({ v: 1, p: S.parts, w: S.wires })))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const decCircuit = c => JSON.parse(decodeURIComponent(escape(atob(c.replace(/-/g, '+').replace(/_/g, '/')))));
    const CNTKEY = { res: 'R', cap: 'C', coil: 'L', bat: 'B', acv: 'N', bulb: 'G', pot: 'P', diode: 'D', led: 'E', ammA: 'A', ammD: 'A', vmA: 'V', vmD: 'V' };
    function loadCircuit(o) {
      if (!o || !Array.isArray(o.p) || !Array.isArray(o.w)) throw new Error('bad');
      const ok = p => p && typeof p.id === 'string' && /^p\d+$/.test(p.id) && (TERMS[p.type] || p.type.startsWith('amm') || p.type.startsWith('vm')) && isFinite(p.x) && isFinite(p.y);
      S.parts = o.p.filter(ok); const keys = new Set(); S.parts.forEach(p => termsOf(p) && Object.keys(termsOf(p)).forEach(t => keys.add(p.id + '.' + t)));
      S.wires = o.w.filter(w => w && keys.has(w.a) && keys.has(w.b)).map((w, i) => ({ id: w.id || 'w' + i, a: w.a, b: w.b, c: WCOL[w.c] ? w.c : 'blue' }));
      S.nid = 1 + Math.max(0, ...S.parts.map(p => +p.id.slice(1)), ...S.wires.map(w => +String(w.id).slice(1) || 0)); S.cnt = { R: 0, A: 0, V: 0, B: 0 };
      S.parts.forEach(p => { const k = CNTKEY[p.type], m = /(\d+)$/.exec(p.name || ''); if (k && m) S.cnt[k] = Math.max(S.cnt[k] || 0, +m[1]); });
      S.sel = null; S.pending = null; needles = {}; S.run = true; resetSim(); update();
    }
    document.addEventListener('keydown', e => { if (host.hidden) return; const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return; if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); delSel(); } else if (e.key === 'r' || e.key === 'R') rotSel(); });

    /* 예시 회로: [키, 종류, x, y, 속성], 도선은 ['키.단자', '키.단자'] */
    const EX = {
      series: { parts: [['b', 'bat', 130, 380], ['s', 'sw', 340, 110, { closed: true }], ['r1', 'res', 560, 110, { nom: 100, tol: 0.02 }], ['r2', 'res', 450, 240, { nom: 200, tol: -0.03 }], ['a', 'ammD', 760, 330, { range: 1 }], ['v', 'vmA', 430, 420, { range: 1 }]],
        wires: [['b.+', 's.a'], ['s.b', 'r1.a'], ['r1.b', 'r2.a'], ['r2.b', 'a.+'], ['a.-', 'b.-'], ['v.+', 'r2.a'], ['v.-', 'r2.b']] },
      parallel: { parts: [['b', 'bat', 130, 380, { cells: 3 }], ['s', 'sw', 340, 110, { closed: true }], ['r1', 'res', 560, 110, { nom: 100, tol: 0.02 }], ['r2', 'res', 560, 250, { nom: 200, tol: -0.03 }], ['a', 'ammD', 760, 330, { range: 1 }], ['v', 'vmA', 330, 420, { range: 1 }]],
        wires: [['b.+', 's.a'], ['s.b', 'a.+'], ['a.-', 'r1.a'], ['a.-', 'r2.a'], ['r1.b', 'b.-'], ['r2.b', 'b.-'], ['v.+', 'r1.a'], ['v.-', 'r1.b']] },
      pot: { parts: [['b', 'bat', 130, 380], ['s', 'sw', 340, 110, { closed: true }], ['p', 'pot', 560, 230, { nom: 1000, pos: 0.3 }], ['v', 'vmD', 780, 380, { range: 1 }]],
        wires: [['b.+', 's.a'], ['s.b', 'p.a'], ['p.b', 'b.-'], ['p.w', 'v.+'], ['v.-', 'b.-']] },
      'bulbs-series': { parts: [['b', 'bat', 130, 380, { cells: 2 }], ['s', 'sw', 340, 110, { closed: true }], ['x1', 'bulb', 580, 110], ['x2', 'bulb', 580, 270]],
        wires: [['b.+', 's.a'], ['s.b', 'x1.a'], ['x1.b', 'x2.a'], ['x2.b', 'b.-']] },
      'bulbs-parallel': { parts: [['b', 'bat', 130, 380, { cells: 2 }], ['s', 'sw', 340, 110, { closed: true }], ['x1', 'bulb', 580, 170], ['x2', 'bulb', 580, 330]],
        wires: [['b.+', 's.a'], ['s.b', 'x1.a'], ['s.b', 'x2.a'], ['x1.b', 'b.-'], ['x2.b', 'b.-']] },
      led: { parts: [['b', 'bat', 130, 380], ['s', 'sw', 340, 110, { closed: true }], ['r', 'res', 560, 110, { nom: 200, tol: 0.02 }], ['d', 'led', 760, 240, { col: 0 }], ['a', 'ammD', 600, 380, { range: 0 }]],
        wires: [['b.+', 's.a'], ['s.b', 'r.a'], ['r.b', 'd.a'], ['d.k', 'a.+'], ['a.-', 'b.-']] },
      twoway: { parts: [['b', 'bat', 130, 380, { cells: 2 }], ['s1', 'sw2', 330, 150], ['s2', 'sw2', 640, 150, { rot: 180 }], ['x', 'bulb', 780, 330]],
        wires: [['b.+', 's1.c'], ['s1.t1', 's2.t1'], ['s1.t2', 's2.t2'], ['s2.c', 'x.b'], ['x.a', 'b.-']] },
      rc: { speed: 1, parts: [['b', 'bat', 130, 380], ['s', 'sw', 340, 110], ['r1', 'res', 560, 110, { nom: 100, tol: 0.02 }], ['a', 'ammD', 760, 330, { range: 1 }], ['c', 'cap', 560, 260, { c: 1000 }], ['v', 'vmD', 330, 420, { range: 1 }]],
        wires: [['b.+', 's.a'], ['s.b', 'r1.a'], ['r1.b', 'a.+'], ['a.-', 'c.a'], ['c.b', 'b.-'], ['v.+', 'c.a'], ['v.-', 'c.b']] },
      rl: { speed: 0.1, parts: [['b', 'bat', 130, 380], ['s', 'sw', 340, 110], ['r1', 'res', 560, 110, { nom: 100, tol: 0.02 }], ['a', 'ammD', 760, 330, { range: 1 }], ['c', 'coil', 560, 260, { l: 1000 }], ['v', 'vmD', 330, 420, { range: 1 }]],
        wires: [['b.+', 's.a'], ['s.b', 'r1.a'], ['r1.b', 'a.+'], ['a.-', 'c.a'], ['c.b', 'b.-'], ['v.+', 'c.a'], ['v.-', 'c.b']] },
      'ac-rc': { speed: 0.1, win: 0.06, parts: [['s', 'acv', 130, 380, { amp: 6, f: 50 }], ['r', 'res', 450, 110, { nom: 100, tol: 0.02 }], ['c', 'cap', 700, 250, { c: 100 }], ['v1', 'vmD', 380, 420, { range: 1, mode: 'AC' }], ['v2', 'vmD', 640, 420, { range: 1, mode: 'AC' }]],
        wires: [['s.+', 'r.a'], ['r.b', 'c.a'], ['c.b', 's.-'], ['v1.+', 'r.a'], ['v1.-', 'r.b'], ['v2.+', 'c.a'], ['v2.-', 'c.b']] },
      'ac-rlc': { speed: 0.1, win: 0.06, parts: [['s', 'acv', 130, 380, { amp: 3, f: 50 }], ['r', 'res', 330, 110, { nom: 10, tol: 0 }], ['l', 'coil', 530, 110, { l: 100 }], ['a', 'ammD', 780, 250, { range: 1, mode: 'AC' }], ['c', 'cap', 600, 330, { c: 100 }]],
        wires: [['s.+', 'r.a'], ['r.b', 'l.a'], ['l.b', 'a.+'], ['a.-', 'c.a'], ['c.b', 's.-']] },
      rectifier: { speed: 0.1, win: 0.06, parts: [['s', 'acv', 130, 380, { amp: 6, f: 50 }], ['d', 'diode', 400, 110], ['r', 'res', 640, 250, { nom: 100, tol: 0.02 }], ['v', 'vmD', 420, 420, { range: 1, mode: 'DC' }]],
        wires: [['s.+', 'd.a'], ['d.k', 'r.a'], ['r.b', 's.-'], ['v.+', 'r.a'], ['v.-', 'r.b']] }
    };
    const EXORDER = ['series', 'parallel', 'rc', 'rl'];
    function loadExample(key) {
      const E = EX[key]; if (!E) return;
      S.parts = []; S.wires = []; S.cnt = { R: 0, A: 0, V: 0, B: 0 }; S.nid = 1; needles = {}; S.sel = null; S.pending = null; const ids = {};
      E.parts.forEach(([k, type, x, y, props]) => { const p = addPart(type, {}, x, y); Object.assign(p, props || {}); ids[k] = p.id; });
      E.wires.forEach(([a, b]) => { const [ka, ta] = a.split('.'), [kb, tb] = b.split('.'), A = ids[ka] + '.' + ta, B = ids[kb] + '.' + tb; S.wires.push({ id: 'w' + (S.nid++), a: A, b: B, c: wireColor(A, B) }); });
      S.speed = E.speed || 1; S.win = E.win || 0; S.run = true; S.sel = null; resetSim(); update();
    }
    const example = k => loadExample(typeof k === 'number' ? EXORDER[k - 1] : k);
    $('fl-exsel').addEventListener('change', e => { if (e.target.value) { loadExample(e.target.value); e.target.value = ''; } });

    /* 바늘 애니메이션 */
    let last = performance.now();
    (function loop(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!host.hidden && S.run && hasDyn()) simStep(dt);
      if (!host.hidden) for (const id in needles) {
        const n = needles[id]; if (!n || !n.el || !n.el.isConnected) continue;
        const k = Math.min(1, dt * 9); n.ang += (n.target - n.ang) * k;
        n.el.setAttribute('transform', `rotate(${n.ang} 0 ${n.cy})`);
      }
      requestAnimationFrame(loop);
    })(last);

    /* ---------- 탭 연결 ---------- */
    let active = false;
    function mark() { tabs.querySelectorAll('button').forEach(b => b.classList.toggle('active', active ? b.dataset.fl === '1' : (b.classList.contains('active') && b.dataset.fl !== '1'))); }
    function ensureBtn() {
      if (!tabs.querySelector('[data-fl]')) { const b = document.createElement('button'); b.dataset.fl = '1'; b.textContent = '🔧 ⑦ 자유 조립 실험'; tabs.appendChild(b); tabs.hidden = false; }
      if (active) mark();
    }
    function open() { active = true; layout.hidden = true; host.hidden = false; mark(); update(); }
    function close() { if (!active) return; active = false; layout.hidden = false; host.hidden = true; }
    tabs.addEventListener('click', e => { const b = e.target.closest && e.target.closest('button'); if (!b) return; if (b.dataset.fl) open(); else close(); }, true);
    new MutationObserver(ensureBtn).observe(tabs, { childList: true });
    host.hidden = true; ensureBtn();
    load(); if (S.parts.length) { S.parts.forEach(p => { if (p.range === undefined && (isA(p) || isV(p))) p.range = 0; }); }
    root.FreeLab = { open, close, example, loadExample, loadCircuit, encCircuit, state: S, analyze: () => analyze(S.parts, S.wires) };
    { const hm = location.hash.match(/free=([A-Za-z0-9_-]+)/); if (hm) { try { loadCircuit(decCircuit(hm[1])); } catch (e) { } } }
    if (/[?&]free\b|#free\b/.test(location.search + location.hash)) open();
  }
})(typeof window !== 'undefined' ? window : globalThis);
