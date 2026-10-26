/* 자유 조립 실험실 (저항의 직렬·병렬) — 건전지·스위치·저항·전류계·전압계를 끌어다 놓고 도선으로 직접 연결한다.
 * 1) 엔진(FreeLabEngine): 도선으로 묶인 단자 → 마디, 마디 전압법으로 회로 전체를 한 번에 푼다. DOM 없음(node로 시험 가능).
 * 2) 화면: SVG 보드, 부품 끌기, 단자→단자 도선(끌기 또는 두 번 탭), 아날로그·디지털 계기, 기록표.
 * index.html의 #freeLab 컨테이너와 #tabs 탭 줄에 붙는다. 다른 탭의 코드는 건드리지 않는다. */
(function (root) {
  'use strict';

  /* ================= 부품 정의 ================= */
  const TERMS = {
    res: { a: { x: -70, y: 0, d: [-1, 0] }, b: { x: 70, y: 0, d: [1, 0] } },
    sw: { a: { x: -60, y: 0, d: [-1, 0] }, b: { x: 60, y: 0, d: [1, 0] } },
    bat: { '+': { x: -40, y: -58, d: [0, -1] }, '-': { x: 40, y: -58, d: [0, -1] } },
    mtr: { '+': { x: -35, y: 100, d: [0, 1] }, '-': { x: 35, y: 100, d: [0, 1] } }
  };
  const termsOf = p => TERMS[p.type.startsWith('amm') || p.type.startsWith('vm') ? 'mtr' : p.type];
  const isA = p => p.type === 'ammA' || p.type === 'ammD';
  const isV = p => p.type === 'vmA' || p.type === 'vmD';
  const isAnalog = p => p.type === 'ammA' || p.type === 'vmA';
  const RANGES = { A: [0.03, 0.3, 3], V: [3, 15] };
  const CELL_E = 1.5, CELL_R = 0.3, R_SW = 0.005, R_RATED_W = 0.25;
  const E_NOMINAL = [10, 20, 30, 47, 100, 200, 470, 1000];

  function rangeOf(p) { return (isA(p) ? RANGES.A : RANGES.V)[p.range || 0]; }
  function meterR(p) {            // 전류계: 풀스케일에서 0.1 V 강하, 전압계: 아날로그 1 kΩ/V, 디지털 1 MΩ
    const r = rangeOf(p);
    if (isA(p)) return 0.1 / r;
    return isAnalog(p) ? 1000 * r : 1e6;
  }
  function resActual(p) { return p.nom * (1 + (p.tol || 0)); }

  /* ================= 엔진 ================= */
  function analyze(parts, wires) {
    const idx = new Map(), names = [];
    parts.forEach(p => Object.keys(termsOf(p)).forEach(t => { idx.set(p.id + '.' + t, names.length); names.push(p.id + '.' + t); }));
    const uf = names.map((_, i) => i);
    const find = i => { while (uf[i] !== i) { uf[i] = uf[uf[i]]; i = uf[i]; } return i; };
    wires.forEach(w => { const a = idx.get(w.a), b = idx.get(w.b); if (a !== undefined && b !== undefined) uf[find(a)] = find(b); });
    const nodeId = new Map(); let n = 0;
    const node = key => { const r = find(idx.get(key)); if (!nodeId.has(r)) nodeId.set(r, n++); return nodeId.get(r); };
    names.forEach(k => node(k));

    const els = [], src = new Array(n).fill(0);
    parts.forEach(p => {
      const t = Object.keys(termsOf(p)), a = node(p.id + '.' + t[0]), b = node(p.id + '.' + t[1]);
      if (p.type === 'res') els.push({ p, a, b, g: 1 / resActual(p) });
      else if (p.type === 'sw') { if (p.closed) els.push({ p, a, b, g: 1 / R_SW }); else els.push({ p, a, b, g: 0 }); }
      else if (p.type === 'bat') {
        const e = CELL_E * p.cells, r = CELL_R * p.cells;
        els.push({ p, a, b, g: 1 / r, e, r }); src[a] += e / r; src[b] -= e / r;
      } else els.push({ p, a, b, g: 1 / meterR(p) });
    });

    // 연결된 덩어리마다 기준 마디(0 V) 하나를 정해 나머지를 푼다
    const adj = Array.from({ length: n }, () => []);
    els.forEach(e => { if (e.g > 0 && e.a !== e.b) { adj[e.a].push(e.b); adj[e.b].push(e.a); } });
    const comp = new Array(n).fill(-1), refs = [];
    for (let s = 0; s < n; s++) {
      if (comp[s] >= 0) continue;
      const c = refs.length; refs.push(s); comp[s] = c; const st = [s];
      while (st.length) { const u = st.pop(); adj[u].forEach(v => { if (comp[v] < 0) { comp[v] = c; st.push(v); } }); }
    }
    // 건전지(-) 마디를 기준으로 삼으면 전위가 읽기 쉽다(덩어리마다 한 번)
    const fixed = new Set();
    parts.filter(p => p.type === 'bat').forEach(p => { const nb = node(p.id + '.-'), c = comp[nb]; if (!fixed.has(c)) { refs[c] = nb; fixed.add(c); } });
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
      for (let r = i + 1; r < m; r++) { const f = A[r][i] / d; if (f) for (let c = i; c <= m; c++) A[r][c] -= f * A[i][c]; }
    }
    const x = new Array(m).fill(0);
    for (let i = m - 1; i >= 0; i--) { let s = A[i][m]; for (let c = i + 1; c < m; c++) s -= A[i][c] * x[c]; x[i] = s / (A[i][i] || 1e-30); }
    const v = new Array(n).fill(0); for (let i = 0; i < n; i++) if (pos[i] >= 0) v[i] = x[pos[i]];

    const res = {}, issues = [];
    els.forEach(e => {
      const p = e.p, dv = v[e.a] - v[e.b];
      if (p.type === 'res') { const I = dv * e.g; res[p.id] = { V: dv, I, P: dv * I }; }
      else if (p.type === 'sw') res[p.id] = { V: dv, I: dv * e.g };
      else if (p.type === 'bat') { const I = (e.e - dv) / e.r; res[p.id] = { I, Vt: dv, e: e.e }; }
      else if (isA(p)) res[p.id] = { reading: dv * e.g, V: dv };
      else res[p.id] = { reading: dv, V: dv };
    });
    return { res, node: key => v[node(key)], issues };
  }

  /* 경고 문장 만들기 */
  function diagnose(parts, R) {
    const out = [];
    const nm = p => p.name;
    parts.forEach(p => {
      const r = R.res[p.id]; if (!r) return;
      if (p.type === 'bat' && (r.I > 1.5 || (r.e - r.Vt) > 0.4 * r.e)) out.push(['bad', `⚠ 합선에 가까워요! ${nm(p)}에서 ${r.I.toFixed(1)} A가 흘러요. 스위치를 열고 도선·전류계 연결을 확인하세요. (전류계는 재려는 곳과 직렬)`]);
      if (p.type === 'res' && r.P > R_RATED_W) out.push(['warn', `🔥 ${nm(p)}(${p.nom} Ω)이 뜨거워요: ${r.P.toFixed(2)} W (정격 ${R_RATED_W} W). 큰 저항으로 바꾸거나 전압을 낮추세요.`]);
      if (isA(p) && Math.abs(r.reading) > 1.15 * rangeOf(p)) out.push(['warn', `${nm(p)} 범위 초과: 더 큰 범위로 바꾸세요.`]);
      if (isV(p) && Math.abs(r.reading) > 1.15 * rangeOf(p)) out.push(['warn', `${nm(p)} 범위 초과: 더 큰 범위로 바꾸세요.`]);
      if ((isA(p) || isV(p)) && r.reading < -1e-6 * rangeOf(p) * 10 && Math.abs(r.reading) > 0.02 * rangeOf(p)) out.push(['warn', `${nm(p)}: 바늘이 거꾸로 가요. (+)(−) 단자 연결이 반대예요.`]);
    });
    return out;
  }

  const engine = { analyze, diagnose, rangeOf, meterR, resActual, TERMS, termsOf, isA, isV, isAnalog, RANGES, CELL_E, CELL_R, E_NOMINAL };
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
    const S = { parts: [], wires: [], nid: 1, sel: null, pending: null, theory: false, hideVal: false, rows: [], cnt: { R: 0, A: 0, V: 0, B: 0 } };
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
    .fl-wrap{display:grid;grid-template-columns:168px minmax(0,1fr) 300px;gap:12px;align-items:start}
    .fl-tray,.fl-side>*{background:#fff;border:1px solid var(--border);border-radius:var(--radius);padding:10px}
    .fl-tray b{display:block;margin-bottom:4px}.fl-tray .fl-hint{font-size:.78em;color:var(--sub);margin-bottom:8px;line-height:1.4}
    .fl-items{display:flex;flex-direction:column;gap:6px}
    .fl-item{display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--border);border-radius:8px;background:#fafcff;cursor:grab;touch-action:none;user-select:none;font-size:.9em}
    .fl-item:hover{border-color:var(--accent);background:#eef5ff}.fl-item svg{flex:0 0 auto}
    .fl-sep{font-size:.75em;color:var(--sub);margin:6px 0 0}
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
          <button id="fl-del">선택 삭제</button><button id="fl-clear">모두 지우기</button>
          <label><input type="checkbox" id="fl-hide"> 저항 값 가리기(색띠로 읽기)</label>
          <label><input type="checkbox" id="fl-theory"> 이론값 보기(교사용)</label></div>
        <div class="fl-board" id="fl-board"></div><div class="fl-msgs" id="fl-msgs" aria-live="polite"></div></div>
      <div class="fl-side">
        <div><b>📟 계기</b><table id="fl-meters"></table></div>
        <div><b>📝 측정 기록</b><table id="fl-rec"></table><div class="fl-btns"><button id="fl-addrow" class="primary">지금 값 기록</button><button id="fl-copy">표 복사</button><button id="fl-clrrows">표 지우기</button></div></div>
        <details open><summary>❓ 사용법</summary><ol>
          <li>부품 상자에서 <b>건전지·스위치·저항·계기</b>를 보드로 끌어다 놓습니다.</li>
          <li>부품 끝의 <b>동그란 단자</b>를 끌어 다른 단자에 놓으면 도선이 이어집니다. (또는 두 단자를 차례로 탭)</li>
          <li><b>전류계</b>는 재려는 곳과 <b>직렬</b>, <b>전압계</b>는 재려는 곳과 <b>병렬</b>. 계기의 <b>(+)는 전지 (+)쪽</b>에 이어요.</li>
          <li><b>스위치를 닫고</b>(레버 클릭) 값을 읽습니다. 계기 아래 <b>범위</b> 단추로 눈금을 바꿔요.</li>
          <li>도선은 클릭해서 <b>선택 삭제</b>. 부품을 눌러 끌면 옮겨요. 값은 위 표에 기록하세요.</li></ol></details>
        <details><summary>🧑‍🏫 교사용 도구</summary><div class="fl-btns"><button id="fl-ex1">직렬 예시 불러오기</button><button id="fl-ex2">병렬 예시 불러오기</button></div></details>
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
    function tpos(key) { const [id, t] = key.split('.'); const p = partById(id); if (!p) return null; const d = tdef(p, t); return { x: p.x + d.x, y: p.y + d.y, d: d.d, p, t }; }

    /* ---------- 부품 만들기 ---------- */
    function bandColors(nom) {
      let e = 0, v = nom; while (v >= 100) { v /= 10; e++; }
      const d1 = Math.floor(v / 10), d2 = Math.round(v % 10);
      return [BANDS[d1], BANDS[d2], BANDS[e]];
    }
    function fmtOhm(v) { return v >= 1000 ? (v / 1000) + ' kΩ' : v + ' Ω'; }
    function freeSpot(type) {
      const big = type !== 'res' && type !== 'sw';
      for (let k = 0; k < 40; k++) {
        const x = 170 + (k % 5) * 165 + (big ? 0 : 0), y = (big ? 170 : 130) + Math.floor(k / 5) * 170;
        if (y > BH - 90) break;
        if (!S.parts.some(q => Math.abs(q.x - x) < 120 && Math.abs(q.y - y) < 110)) return { x, y };
      }
      return { x: 120 + Math.random() * 600, y: 120 + Math.random() * 300 };
    }
    function addPart(type, opt, x, y) {
      const p = { id: 'p' + (S.nid++), type, x: 0, y: 0 };
      if (type === 'res') { p.nom = opt.nom || 100; p.tol = (Math.random() * 2 - 1) * 0.05; p.name = 'R' + (++S.cnt.R); }
      else if (type === 'sw') { p.closed = false; p.name = '스위치'; }
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
      const pa = tpos(a), pb = tpos(b); const sym = [pa, pb].map(q => q && (q.p.type === 'bat' || q.p.type === 'mtr' || isA(q.p) || isV(q.p)) ? q.t : null);
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
    function dialGeom(frac) { const a = (-50 + 100 * frac) * Math.PI / 180; return { x: 56 * Math.sin(a), y: 30 - 56 * Math.cos(a) }; }
    function drawMeter(p, r) {
      const g = h('g'), A = isA(p), col = A ? '#1b8fb8' : '#7a4fd1', range = rangeOf(p), analog = isAnalog(p);
      g.appendChild(h('rect', { x: -85, y: -78, width: 170, height: 176, rx: 12, fill: analog ? '#f8f7f1' : '#dfe4ea', stroke: '#222c38', 'stroke-width': 2.5 }));
      g.appendChild(h('rect', { x: -85, y: -78, width: 170, height: 24, rx: 12, fill: col }));
      g.appendChild(h('rect', { x: -85, y: -66, width: 170, height: 12, fill: col }));
      g.appendChild(T(p.name + (A ? ' 전류계' : ' 전압계') + (analog ? '' : ' (디지털)'), 0, -60, 14, '#fff', 'middle', 700));
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
        const target = r ? Math.max(-6, Math.min(106, 100 * r.reading / range)) - 50 : -50;
        needles[p.id].target = target;
        if (needles[p.id].ang === undefined) needles[p.id].ang = -50;
        ng.setAttribute('transform', `rotate(${needles[p.id].ang} ${cx} ${cy})`);
      } else {
        g.appendChild(h('rect', { x: -70, y: -42, width: 140, height: 62, rx: 6, fill: '#b9d1a0', stroke: '#6d7f5a', 'stroke-width': 2 }));
        let txt = '0.00'; if (r) { const v = r.reading; txt = Math.abs(v) > 1.1 * range ? 'OL' : fmtDigital(p, v); }
        g.appendChild(h('text', { x: 62, y: 8, 'text-anchor': 'end', 'font-size': 30, 'font-family': 'Consolas,"Courier New",monospace', 'font-weight': 700, fill: '#1f2a14', 'pointer-events': 'none' }, txt));
      }
      const rg = h('g', { 'data-act': 'range', style: 'cursor:pointer', transform: 'translate(0 70)' },
        h('rect', { x: -52, y: -13, width: 104, height: 26, rx: 13, fill: '#fff', stroke: col, 'stroke-width': 2 }),
        T('범위 ' + (A ? AR : VR)[p.range] + ' ▸', 0, 5, 13, col, 'middle', 700));
      g.appendChild(rg);
      if (S.theory && r) g.appendChild(T(`이론값 ${A ? (r.reading * 1000).toFixed(2) + ' mA' : r.reading.toFixed(3) + ' V'}`, 0, 118, 13, '#1d4a85', 'middle', 700));
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
    function render() {
      rafPending = false; needles = Object.assign({}, needles);
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      svg.appendChild(h('defs', null, h('pattern', { id: 'flgrid', width: 20, height: 20, patternUnits: 'userSpaceOnUse' }, h('circle', { cx: 1, cy: 1, r: 1, fill: '#d2dae6' }))));
      svg.appendChild(h('rect', { x: 0, y: 0, width: BW, height: BH, fill: '#f7f9fc' }));
      svg.appendChild(h('rect', { x: 0, y: 0, width: BW, height: BH, fill: 'url(#flgrid)' }));
      const gP = h('g'), gW = h('g'), gT = h('g'), gX = h('g');
      S.parts.forEach(p => {
        const r = R && R.res[p.id];
        const body = p.type === 'res' ? drawResistor(p, r) : p.type === 'sw' ? drawSwitch(p, r) : p.type === 'bat' ? drawBattery(p, r) : drawMeter(p, r);
        const grp = h('g', { transform: `translate(${p.x} ${p.y})`, 'data-id': p.id, style: 'cursor:move' }, body);
        if (S.sel && S.sel.k === 'part' && S.sel.id === p.id) {
          const bb = { res: [-78, -34, 156, 68], sw: [-84, -30, 168, 70], bat: [-90, -72, 180, 150], mtr: [-92, -86, 184, 214] }[p.type.startsWith('amm') || p.type.startsWith('vm') ? 'mtr' : p.type];
          grp.insertBefore(h('rect', { x: bb[0], y: bb[1], width: bb[2], height: bb[3], rx: 12, fill: 'rgba(31,111,214,.06)', stroke: '#1f6fd6', 'stroke-dasharray': '6 5', 'stroke-width': 2 }), grp.firstChild);
        }
        grp.addEventListener('pointerdown', e => partDown(e, p));
        gP.appendChild(grp);
        Object.keys(termsOf(p)).forEach(t => {
          const d = termsOf(p)[t], key = p.id + '.' + t, pend = S.pending === key;
          const plus = t === '+', minus = t === '-', col = plus ? '#d64545' : (minus ? '#26303c' : '#8a96a6');
          const tg = h('g', { transform: `translate(${p.x + d.x} ${p.y + d.y})`, style: 'cursor:crosshair' },
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
      svg.appendChild(gP); svg.appendChild(gW); svg.appendChild(gT); svg.appendChild(gX);
      svg._gX = gX;
      if (!S.parts.length) svg.appendChild(T('왼쪽 부품 상자에서 부품을 끌어다 놓아 실험을 꾸며 보세요', BW / 2, BH / 2, 24, '#9aa8b8', 'middle', 700));
      renderPanels();
    }
    const schedule = () => { if (!rafPending) { rafPending = true; requestAnimationFrame(render); } };

    /* ---------- 계산·패널 ---------- */
    function update() {
      R = analyze(S.parts, S.wires);
      msgs = diagnose(S.parts, R);
      if (S.parts.length && !msgs.length) {
        const bat = S.parts.filter(p => p.type === 'bat'), sw = S.parts.filter(p => p.type === 'sw');
        if (bat.length && S.wires.length && sw.some(s => !s.closed) && bat.every(b => Math.abs(R.res[b.id].I) < 1e-4)) msgs.push(['info', '스위치가 열려 있어서 전류가 흐르지 않아요. 레버를 눌러 닫아 보세요.']);
        else if (bat.length && S.wires.length >= 2 && bat.every(b => Math.abs(R.res[b.id].I) < 1e-4)) msgs.push(['info', '전류가 흐르지 않아요. 전지에서 나간 도선이 다시 전지로 돌아오는 닫힌 회로인지 확인하세요.']);
        if (!bat.length) msgs.push(['info', '건전지를 가져다 놓으면 회로에 전류가 흘러요.']);
      }
      save(); schedule();
    }
    function renderPanels() {
      const mt = $('fl-meters'), ms = S.parts.filter(p => isA(p) || isV(p));
      mt.innerHTML = ms.length ? '<tr><th>계기</th><th>범위</th><th>눈금/값</th></tr>' + ms.map(p => {
        const r = R && R.res[p.id], an = isAnalog(p), A = isA(p);
        let val = an ? (S.theory && r ? (A ? (r.reading * 1000).toFixed(2) + ' mA' : r.reading.toFixed(3) + ' V') : '눈금을 읽으세요') : (r ? (Math.abs(r.reading) > 1.1 * rangeOf(p) ? 'OL' : fmtDigital(p, r.reading)) : '-');
        return `<tr><td>${p.name}<br><small>${an ? '아날로그' : '디지털'}</small></td><td>${(A ? AR : VR)[p.range]}</td><td>${val}</td></tr>`;
      }).join('') : '<tr><td>전류계·전압계를 놓으면 여기에 표시돼요</td></tr>';
      const mb = $('fl-msgs'); mb.innerHTML = msgs.map(m => `<div class="fl-msg ${m[0]}">${m[1]}</div>`).join('');
      const rt = $('fl-rec');
      rt.innerHTML = '<tr><th>#</th><th>무엇을 쟀나요?</th><th>읽은 값</th></tr>' + (S.rows.length ? S.rows.map((r, i) => `<tr><td>${i + 1}</td><td><input type="text" data-r="${i}" data-f="label" value="${esc(r.label)}" placeholder="예: R₁ 양단"></td><td><input type="text" data-r="${i}" data-f="val" value="${esc(r.val)}" placeholder="예: 2.0 V, 0.06 A"></td></tr>`).join('') : '<tr><td colspan="3">아직 기록이 없어요</td></tr>');
      rt.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => { S.rows[+inp.dataset.r][inp.dataset.f] = inp.value; save(); }));
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
          if (a === 'sw') p.closed = !p.closed;
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
      else if (type === 'bat') { s.appendChild(h('rect', { x: -20, y: -11, width: 40, height: 22, rx: 4, fill: '#2d3b52' })); s.appendChild(h('rect', { x: -15, y: -6, width: 6, height: 10, fill: '#ffd166' })); s.appendChild(h('rect', { x: -5, y: -6, width: 6, height: 10, fill: '#ffd166' })); s.appendChild(h('rect', { x: 5, y: -6, width: 6, height: 10, fill: '#ffd166' })); }
      else if (type === 'sw') { s.appendChild(h('rect', { x: -20, y: 4, width: 40, height: 6, fill: '#4a5666' })); s.appendChild(h('line', { x1: -16, y1: 3, x2: 14, y2: -9, stroke: '#c0861a', 'stroke-width': 3, 'stroke-linecap': 'round' })); }
      else { const A = type.startsWith('amm'), c = A ? '#1b8fb8' : '#7a4fd1'; s.appendChild(h('rect', { x: -15, y: -13, width: 30, height: 26, rx: 4, fill: type.endsWith('A') ? '#f8f7f1' : '#b9d1a0', stroke: c, 'stroke-width': 2 })); s.appendChild(T(A ? 'A' : 'V', 0, 5, 14, c, 'middle', 700)); }
      return s;
    }
    const ITEMS = [['bat', '건전지', null], ['sw', '스위치', null]].concat(E_NOMINAL.map(n => ['res', '저항 ' + fmtOhm(n), n])).concat([['ammA', '전류계 (아날로그)'], ['ammD', '전류계 (디지털)'], ['vmA', '전압계 (아날로그)'], ['vmD', '전압계 (디지털)']]);
    const itemsBox = $('fl-items');
    ITEMS.forEach(([type, label, nom], i) => {
      if (i === 2) itemsBox.appendChild(Object.assign(document.createElement('div'), { className: 'fl-sep', textContent: '저항 (정격 ¼ W, 오차 ±5 %)' }));
      if (i === 2 + E_NOMINAL.length) itemsBox.appendChild(Object.assign(document.createElement('div'), { className: 'fl-sep', textContent: '계기' }));
      const d = document.createElement('div'); d.className = 'fl-item'; d.setAttribute('role', 'button'); d.title = label;
      d.appendChild(itemIcon(type, nom)); d.appendChild(Object.assign(document.createElement('span'), { textContent: label }));
      d.addEventListener('pointerdown', e => {
        if (e.button !== undefined && e.button !== 0) return; e.preventDefault(); const e0 = e; let dragged = false;
        const ghost = d.cloneNode(true); ghost.style.cssText = 'position:fixed;pointer-events:none;opacity:.85;z-index:9999;background:#fff;box-shadow:0 4px 14px rgba(0,0,0,.25);width:150px'; document.body.appendChild(ghost);
        const place = ev => { ghost.style.left = (ev.clientX - 75) + 'px'; ghost.style.top = (ev.clientY - 16) + 'px'; };
        place(e);
        track(ev => { if (moved(e0, ev) > 6) dragged = true; place(ev); }, ev => {
          ghost.remove(); const rr = $('fl-board').getBoundingClientRect();
          if (dragged) { if (ev.clientX >= rr.left && ev.clientX <= rr.right && ev.clientY >= rr.top && ev.clientY <= rr.bottom) { const pt = toBoard(ev); addPart(type, { nom }, pt.x, pt.y); } }
          else addPart(type, { nom });
        });
      });
      itemsBox.appendChild(d);
    });

    /* 막대 단추와 기록 */
    function delSel() { if (!S.sel) return; if (S.sel.k === 'part') removePart(S.sel.id); else { S.wires = S.wires.filter(w => w.id !== S.sel.id); S.sel = null; update(); } }
    $('fl-del').addEventListener('click', delSel);
    $('fl-clear').addEventListener('click', () => { if (!S.parts.length || confirm('보드의 부품과 도선을 모두 지울까요?')) { S.parts = []; S.wires = []; S.sel = null; S.pending = null; S.cnt = { R: 0, A: 0, V: 0, B: 0 }; needles = {}; update(); } });
    $('fl-hide').addEventListener('change', e => { S.hideVal = e.target.checked; save(); schedule(); });
    $('fl-theory').addEventListener('change', e => { S.theory = e.target.checked; schedule(); });
    $('fl-addrow').addEventListener('click', () => {
      const ds = S.parts.filter(p => (isA(p) || isV(p)) && !isAnalog(p) && R && R.res[p.id]).map(p => p.name + '=' + fmtDigital(p, R.res[p.id].reading));
      S.rows.push({ label: '', val: ds.join(', ') }); save(); schedule();
    });
    $('fl-clrrows').addEventListener('click', () => { S.rows = []; save(); schedule(); });
    $('fl-copy').addEventListener('click', () => {
      const t = '#\t무엇을 쟀나요\t읽은 값\n' + S.rows.map((r, i) => (i + 1) + '\t' + r.label + '\t' + r.val).join('\n');
      if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => { $('fl-copy').textContent = '복사됨 ✓'; setTimeout(() => { $('fl-copy').textContent = '표 복사'; }, 1400); }, () => { });
    });
    document.addEventListener('keydown', e => { if (host.hidden) return; const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return; if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); delSel(); } });

    /* 교사용 예시 */
    function example(kind) {
      S.parts = []; S.wires = []; S.cnt = { R: 0, A: 0, V: 0, B: 0 }; S.nid = 1; needles = {};
      const add = (t, o, x, y) => { const p = addPart(t, o || {}, x, y); return p; };
      const b = add('bat', {}, 130, 380), sw = add('sw', {}, 340, 110);
      const r1 = add('res', { nom: 100 }, 560, 110), a = add('ammD', {}, 700, 330);
      r1.tol = 0.02;
      if (kind === 1) {
        const r2 = add('res', { nom: 200 }, 450, 220), v = add('vmA', {}, 430, 400); r2.tol = -0.03; a.range = 1; v.range = 1;
        [[b.id + '.+', sw.id + '.a'], [sw.id + '.b', r1.id + '.a'], [r1.id + '.b', r2.id + '.a'], [r2.id + '.b', a.id + '.+'], [a.id + '.-', b.id + '.-'], [v.id + '.+', r2.id + '.a'], [v.id + '.-', r2.id + '.b']].forEach(w => S.wires.push({ id: 'w' + (S.nid++), a: w[0], b: w[1], c: wireColor(w[0], w[1]) }));
      } else {
        const r2 = add('res', { nom: 200 }, 560, 250), v = add('vmA', {}, 330, 400); r2.tol = -0.03; a.range = 1; v.range = 0;
        [[b.id + '.+', sw.id + '.a'], [sw.id + '.b', a.id + '.+'], [a.id + '.-', r1.id + '.a'], [a.id + '.-', r2.id + '.a'], [r1.id + '.b', b.id + '.-'], [r2.id + '.b', b.id + '.-'], [v.id + '.+', r1.id + '.a'], [v.id + '.-', r1.id + '.b']].forEach(w => S.wires.push({ id: 'w' + (S.nid++), a: w[0], b: w[1], c: wireColor(w[0], w[1]) }));
      }
      sw.closed = true; S.sel = null; update();
    }
    $('fl-ex1').addEventListener('click', () => example(1)); $('fl-ex2').addEventListener('click', () => example(2));

    /* 바늘 애니메이션 */
    let last = performance.now();
    (function loop(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
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
    root.FreeLab = { open, close, example, state: S, analyze: () => analyze(S.parts, S.wires) };
    if (/[?&]free\b|#free\b/.test(location.search + location.hash)) open();
  }
})(typeof window !== 'undefined' ? window : globalThis);
