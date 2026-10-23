// engine.js — 에너지 도시 건설: 지도·데이터·설치 규칙·마을 평가 (DOM·Three 없음, 노드에서 시험 가능)
// 자료 출처: KENTECH 2022학년도 선행학습 영향평가 보고서의 창의성 면접 문항(지도·데이터·카드)을 옮겨 적음.
// 마을 반응·점수 계산식은 문항에 없는 이 게임의 가정이다(아래 TR·EC 표).

export const N = 10;
export const ROW = 'ABCDEFGHIJ';
export const name = (r, c) => ROW[r] + (c + 1);
export const inb = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
export const parse = s => [ROW.indexOf(s[0]), parseInt(s.slice(1), 10) - 1];

// ── 지도 ─────────────────────────────────────────────
const LAND = ['..........', '.###..###.', '.###..###.', '.###..###.', '.###......',
              '.########.', '.########.', '.########.', '.########.', '..........'];
export const isLand = (r, c) => LAND[r][c] === '#';

const FEAT_LIST = {
  mountain: 'C3 D3 E2 E3 H3 H4 H5 H6', lake: 'G6 G7', oil: 'A10 B4 F5', culture: 'C9',
  birds: 'I2 I3 I4 I5 I6', deer: 'F7 G8', whale: 'A3 C6 J3 J4 J6',
  fish: 'A8 A9 B10 C10 C1 D1 E1', farm: 'B8 C2 F3 F4 G3',
};
export const FEAT = {};
for (const [f, list] of Object.entries(FEAT_LIST)) for (const n of list.split(' ')) FEAT[n] = f;
export const featAt = (r, c) => FEAT[name(r, c)] || null;
const FISH_E = new Set(['A8', 'A9', 'B10', 'C10']); // 배멧 앞바다
const FISH_W = new Set(['C1', 'D1', 'E1']);          // 참살이 앞바다

// ── 데이터 카드 ──────────────────────────────────────
export const SUN = [5, 5, 10, 10, 10, 15, 15, 15, 20, 20]; // 행(A~J)별 일사량
export const SPEED = [
  [20, 20, 20, 20, 20, 20, 20, 20, 20, 20],
  [20, 10, 10, 10, 20, 20, 10, 10, 10, 20],
  [20, 10, 15, 10, 15, 15, 10, 5, 10, 20],
  [20, 10, 15, 10, 15, 15, 10, 10, 10, 20],
  [20, 15, 15, 10, 15, 15, 15, 15, 20, 20],
  [20, 10, 5, 10, 10, 10, 10, 10, 10, 20],
  [20, 10, 5, 5, 5, 5, 5, 5, 10, 20],
  [20, 10, 15, 15, 15, 15, 5, 5, 10, 20],
  [20, 10, 10, 10, 10, 10, 10, 10, 10, 20],
  [20, 20, 20, 20, 20, 20, 20, 20, 20, 20],
];
// 풍향: v=남(↓) s=남서(↙) w=서(←)  (행+1 / 행+1,열−1 / 열−1)
const WD = [
  'v s s s v v s s s s'.split(' '), 'v s s s v v s s s s'.split(' '),
  'v s v s v v s s s s'.split(' '), 'v s v s v v s s s s'.split(' '),
  'v s w s v v s s s s'.split(' '), 'v s s s s s s s s s'.split(' '),
  'v s w w w w s s s s'.split(' '), 'v s w w w w s s s s'.split(' '),
  'v s s s s s s s s s'.split(' '), 'v w w w w w w w w w'.split(' '),
];
export const WIND_VEC = { v: [1, 0], s: [1, -1], w: [0, -1] };
export const windVec = (r, c) => WIND_VEC[WD[r][c]];
export const windCode = (r, c) => WD[r][c];
// 해류(바다 칸만). E10은 위·아래로 갈라진다.
const CUR = {};
const setc = (r, c, d) => { CUR[name(r, c)] = d; };
['E', 'E', 'E', 'E', 'S', 'S', 'W', 'W', 'W', 'W'].forEach((d, c) => setc(0, c, d));
for (let r = 1; r <= 8; r++) setc(r, 0, 'N');
for (let r = 1; r <= 3; r++) { setc(r, 4, 'S'); setc(r, 5, 'S'); setc(r, 9, 'N'); }
['E', 'E', 'E', 'E', 'E'].forEach((d, i) => setc(4, 4 + i, d));
setc(4, 9, 'NS');
for (let r = 5; r <= 8; r++) setc(r, 9, 'S');
setc(9, 0, 'N');
for (let c = 1; c <= 9; c++) setc(9, c, 'W');
const CV = { N: [-1, 0], S: [1, 0], E: [0, 1], W: [0, -1] };
export const curDirs = (r, c) => (CUR[name(r, c)] || '').split('').filter(Boolean);

// ── 마을 ────────────────────────────────────────────
export const VILLAGES = [
  { id: 'bemet', name: '배멧', cell: 'B9', demand: 60, turnout: 40, color: '#8e44ad',
    desc: '해안가 어촌, 어업·농업. 출산율은 높지만 젊은 층이 떠난다. 건강에 관심이 많다.' },
  { id: 'chamsal', name: '참살이', cell: 'D2', demand: 80, turnout: 60, color: '#e67e22',
    desc: '광물 산업·어업 중심. 어획량이 줄어 새 산업이 필요하다. 산에서 야생동물 사냥을 즐긴다.' },
  { id: 'bitgaram', name: '빛가람', cell: 'G4', demand: 100, turnout: 80, color: '#2c4a8a',
    desc: '내륙, 관광업·농업. 보전파와 개발파가 맞선다. 지난 시의원 선거 투표율이 가장 높다.' },
];
VILLAGES.forEach(v => { [v.r, v.c] = parse(v.cell); });
export const villageAt = (r, c) => VILLAGES.findIndex(v => v.r === r && v.c === c);

// 마을별 민감도(문항 카드 내용을 읽고 정한 가정). w=분류별 가중
const TR = {
  chamsal: { health: 1.0, fear: 1.0, jobs: 1.2, scenery: .3, clean: 1.0, w: { fishW: 1.2, fishE: .15, wild: .8, culture: .5, farm: 0, terrain: .6 }, own: 'fishW' },
  bemet: { health: 1.4, fear: 1.2, jobs: 1.1, scenery: .3, clean: 1.0, w: { fishW: .15, fishE: 1.2, wild: .4, culture: 1.1, farm: 1.0, terrain: .1 }, own: 'fishE' },
  bitgaram: { health: 1.0, fear: 1.0, jobs: .5, scenery: 1.3, clean: 1.3, w: { fishW: 0, fishE: 0, wild: .9, culture: 1.0, farm: 1.0, terrain: .8 }, own: null },
};
const K = { fishW: 1.1, fishE: 1.1, wild: 1.1, culture: 1.8, farm: 1.2, terrain: 1.0 };

// ── 발전 설비 ───────────────────────────────────────
export const PLANT = {
  fossil: { label: '화석 연료 발전소', icon: '🏭', cost: 15, jobs: 2, vis: 4 },
  nuclear: { label: '원자력 발전소', icon: '☢️', cost: 15, jobs: 2.5, vis: 4 },
  solar: { label: '태양광 발전소', icon: '☀️', cost: 2, jobs: 1, vis: 1.5 },
  wind: { label: '풍력 발전소', icon: '🌬️', cost: 2, jobs: 1.2, vis: 2 },
};
export const TYPES = ['fossil', 'nuclear', 'wind', 'solar'];
export const outputAt = (type, r, c) =>
  type === 'fossil' ? 60 : type === 'nuclear' ? 90 : type === 'solar' ? SUN[r] : SPEED[r][c];
export const WIRE_UNIT = 0.5; // 전선 1칸당 비용(바다 칸은 2칸으로 계산)

// 생태 영향(설비 종류 × 자연 요소). 같은 칸 100%, 이웃 8칸 40%
const EC = {
  birds: { solar: 6, wind: 8, nuclear: 5, fossil: 5 }, deer: { solar: 6, wind: 4, nuclear: 6, fossil: 5 },
  whale: { solar: 5, wind: 7, nuclear: 6, fossil: 6 }, fish: { solar: 5, wind: 6, nuclear: 7, fossil: 7 },
  culture: { solar: 10, wind: 10, nuclear: 14, fossil: 14 }, mountain: { solar: 4, wind: 2, nuclear: 6, fossil: 6 },
  farm: { solar: 5, wind: 3, nuclear: 5, fossil: 5 }, lake: { solar: 3, wind: 3, nuclear: 6, fossil: 6 },
};
const catOf = (f, nm) => f === 'fish' ? (FISH_E.has(nm) ? 'fishE' : 'fishW')
  : (f === 'birds' || f === 'deer' || f === 'whale') ? 'wild'
  : f === 'culture' ? 'culture' : f === 'farm' ? 'farm' : (f === 'mountain' || f === 'lake') ? 'terrain' : null;
const zeroCats = () => ({ fishW: 0, fishE: 0, wild: 0, culture: 0, farm: 0, terrain: 0 });
const WIRE_ECO = { culture: 6, birds: 1.5, deer: 1.5, whale: 1, fish: 1, mountain: 1, farm: .8 };

export function ecoOfPlant(p) {
  const cats = zeroCats();
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const r = p.r + dr, c = p.c + dc; if (!inb(r, c)) continue;
    const f = featAt(r, c); if (!f || !EC[f]) continue;
    const k = (dr || dc) ? .4 : 1, cat = catOf(f, name(r, c));
    if (cat) cats[cat] += EC[f][p.type] * k;
  }
  return cats;
}

// ── 설치 규칙 ───────────────────────────────────────
const isWater = (r, c) => !isLand(r, c) || featAt(r, c) === 'lake';
export function canPlace(plants, type, r, c) {
  if (!inb(r, c)) return { ok: false, why: '지도 밖입니다' };
  if (villageAt(r, c) >= 0) return { ok: false, why: '마을 위에는 지을 수 없어요' };
  if (plants.some(p => p.r === r && p.c === c)) return { ok: false, why: '1개의 좌표에는 1개의 발전소만 설치할 수 있어요' };
  if (type === 'fossil' && featAt(r, c) !== 'oil') return { ok: false, why: '화석 연료 발전소는 유전 좌표에만 설치할 수 있어요' };
  if (type === 'nuclear') {
    if (!isLand(r, c) || featAt(r, c) === 'lake') return { ok: false, why: '원자력 발전소는 육지에만 설치할 수 있어요' };
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => inb(r + a, c + b) && isWater(r + a, c + b));
    if (!nb) return { ok: false, why: '냉각을 위해 바다·호수 바로 옆 육지여야 해요' };
  }
  return { ok: true, why: '' };
}

// ── 확산 모의 ───────────────────────────────────────
const zeros = () => Array.from({ length: N }, () => new Array(N).fill(0));
const addAt = (m, r, c, v) => { if (inb(r, c)) m[r][c] += v; };

export function windPlume(r0, c0, steps = 7, decay = .78, lat = .3) {
  const m = zeros(); let r = r0, c = c0, k = 1;
  for (let i = 0; i <= steps; i++) {
    addAt(m, r, c, k);
    const d = windVec(r, c);
    for (const p of [[-d[1], d[0]], [d[1], -d[0]]]) addAt(m, r + p[0], c + p[1], k * lat);
    r += d[0]; c += d[1]; if (!inb(r, c)) break; k *= decay;
  }
  return m;
}

// 원전 사고 가정: 바람(공기) + 해류(바다) + 호수. 0~1
export function accident(p) {
  const m = zeros();
  const air = windPlume(p.r, p.c, 6, .7, .3);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) m[r][c] = Math.max(m[r][c], Math.min(1, air[r][c]) * .8);
  const q = [];
  for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const r = p.r + a, c = p.c + b; if (!inb(r, c)) continue;
    if (!isLand(r, c)) q.push([r, c, 1, 0]);
    else if (featAt(r, c) === 'lake') {
      for (let rr = 0; rr < N; rr++) for (let cc = 0; cc < N; cc++) {
        const d = Math.max(Math.abs(rr - r), Math.abs(cc - c));
        if (d <= 3) m[rr][cc] = Math.max(m[rr][cc], Math.pow(.55, d));
      }
    }
  }
  while (q.length) {
    const [r, c, k, s] = q.shift();
    if (k <= m[r][c] && s > 0) continue;
    m[r][c] = Math.max(m[r][c], k);
    if (s > 40) continue;
    for (const ch of curDirs(r, c)) {
      const nr = r + CV[ch][0], nc = c + CV[ch][1], nk = k * .93;
      if (inb(nr, nc) && nk > .08 && nk > m[nr][nc] + 1e-9) q.push([nr, nc, nk, s + 1]);
    }
  }
  return m;
}
export const airGrid = plants => {
  const m = zeros();
  for (const p of plants) if (p.type === 'fossil') {
    const g = windPlume(p.r, p.c);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) m[r][c] += g[r][c];
  }
  return m;
};
export const radGrid = plants => {
  const m = zeros();
  for (const p of plants) if (p.type === 'nuclear') {
    const g = accident(p);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) m[r][c] = Math.max(m[r][c], g[r][c]);
  }
  return m;
};

// ── 전선 경로(가로·세로만, 길이에 따라 비용) ────────────
export function route(plants, p, vi) {
  const v = VILLAGES[vi], blocked = (r, c) => {
    if (r === v.r && c === v.c) return false;
    return villageAt(r, c) >= 0 || plants.some(q => q.r === r && q.c === c && q !== p);
  };
  const dist = zeros().map(a => a.map(() => Infinity)), prev = {};
  const pq = [[0, p.r, p.c]]; dist[p.r][p.c] = 0;
  while (pq.length) {
    pq.sort((a, b) => a[0] - b[0]);
    const [d, r, c] = pq.shift();
    if (d > dist[r][c]) continue;
    if (r === v.r && c === v.c) break;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + a, nc = c + b; if (!inb(nr, nc) || blocked(nr, nc)) continue;
      const f = featAt(nr, nc);
      const nd = d + (isLand(nr, nc) ? 1 : 2) + (WIRE_ECO[f] || 0) * .5;
      if (nd < dist[nr][nc]) { dist[nr][nc] = nd; prev[nr * N + nc] = r * N + c; pq.push([nd, nr, nc]); }
    }
  }
  if (!isFinite(dist[v.r][v.c])) return [];
  const path = []; let k = v.r * N + v.c;
  while (k !== p.r * N + p.c) { path.push([Math.floor(k / N), k % N]); k = prev[k]; }
  return path.reverse();
}

export function wires(plants, linksOn = true) {
  const list = [];
  if (!linksOn) return { list, units: 0, cells: 0, eco: zeroCats() };
  const seen = new Set(); let units = 0; const eco = zeroCats();
  for (const p of plants) {
    if (p.link == null) continue;
    const cells = route(plants, p, p.link);
    list.push({ plant: p.id, village: p.link, cells });
    for (const [r, c] of cells) {
      const key = r * N + c; if (seen.has(key)) continue; seen.add(key);
      if (!(r === VILLAGES[p.link].r && c === VILLAGES[p.link].c)) units += isLand(r, c) ? 1 : 2;
      else units += 0;
      const f = featAt(r, c), cat = f && catOf(f, name(r, c));
      if (cat && WIRE_ECO[f]) eco[cat] += WIRE_ECO[f];
    }
  }
  return { list, units, cells: seen.size, eco };
}

// 아직 연결 안 된 설비를 부족한 마을(없으면 가장 가까운 마을)에 이어 준다
export function autoLink(plants) {
  const sup = [0, 0, 0];
  plants.forEach(p => { if (p.link != null) sup[p.link] += outputAt(p.type, p.r, p.c); });
  const todo = plants.filter(p => p.link == null).sort((a, b) => outputAt(b.type, b.r, b.c) - outputAt(a.type, a.r, a.c));
  for (const p of todo) {
    const dist = VILLAGES.map(v => Math.abs(v.r - p.r) + Math.abs(v.c - p.c));
    let best = -1;
    for (let i = 0; i < 3; i++) if (sup[i] < VILLAGES[i].demand && (best < 0 || dist[i] < dist[best])) best = i;
    if (best < 0) best = dist.indexOf(Math.min(...dist));
    p.link = best; sup[best] += outputAt(p.type, p.r, p.c);
  }
}

// ── 평가 ────────────────────────────────────────────
export const FACTOR = {
  supply: '전력 공급', air: '미세먼지·공해', radiation: '방사능 불안', fish: '어장·바다', wild: '야생동물 서식지',
  culture: '문화재·역사', farm: '농경지', terrain: '산·호수 경관', scenery: '마을에서 보이는 시설',
  jobs: '일자리', clean: '친환경 자부심', carbon: '탄소 배출', cost: '전기요금·비용 부담',
};
export const TIERS = [
  [55, '🎉', '대환영 — 마을 축제', 'cheer'], [25, '👏', '환영', 'cheer'], [5, '🙂', '대체로 만족', 'ok'],
  [-15, '😐', '지켜보는 중(무관심)', 'idle'], [-35, '😟', '불안 — 주민 청원', 'worry'],
  [-60, '📢', '항의 집회', 'anger'], [-1e9, '🔥', '대규모 시위(데모)', 'riot'],
];
export const tierOf = m => TIERS.find(t => m >= t[0]);

const Q = {
  supply: { neg: { _: '전기가 모자라요! 우리 마을에도 제대로 전기를 공급해 주세요.', chamsal: '광산 기계가 멈췄어요. 전기를 더 보내 주세요!', bemet: '냉동 창고가 꺼져 생선이 상해요. 전기가 필요해요!', bitgaram: '관광객이 정전에 놀라 돌아갔어요. 100은 있어야 해요!' },
    pos: { _: '전기가 안정적으로 들어와요. 고맙습니다!' } },
  air: { neg: { _: '미세먼지가 마을로 넘어와요!', bemet: '아이들 기침이 심해요. 건강한 마을이 목표인데 이럴 수는 없어요!', chamsal: '광부들 기침이 심해졌습니다. 공장 매연이 우리 쪽으로 불어와요.', bitgaram: '공기가 뿌옇다고 관광객이 줄고 있어요!' } },
  radiation: { neg: { _: '방사능이 퍼지면 어떡합니까? 불안해서 잠이 안 와요.', chamsal: '바다로 방사능이 흘러오면 어업은 끝입니다.', bemet: '젊은 부부들이 아이 키우기 겁난다며 떠나요.', bitgaram: '바람이나 호수로 방사능이 퍼질까 무섭습니다.' } },
  fish: { neg: { _: '어장이 망가지고 있어요.', chamsal: '어획량이 이미 줄었는데 더 줄면 마을은 어떻게 삽니까?', bemet: '우리 바다에 시설이라니, 어업은 누가 보상해 줍니까?' } },
  wild: { neg: { _: '야생동물이 떠나고 있어요.', chamsal: '사냥터와 산짐승 서식지가 사라지고 있습니다.', bitgaram: '새와 사슴을 보러 오던 관광객이 없어졌어요.' } },
  culture: { neg: { _: '문화재 주변에 발전 시설이라니, 말도 안 됩니다!', bemet: '우리 마을의 자랑 문화재가 훼손되고 있어요!', bitgaram: '문화재가 훼손되면 관광 브랜드가 무너집니다.' } },
  farm: { neg: { _: '농경지를 밀어 시설을 짓다니요.' } },
  terrain: { neg: { _: '산과 호수의 경치가 망가졌어요.', chamsal: '산을 깎다니 사냥도 등산도 못하게 됐습니다.', bitgaram: '자연경관이 우리 마을의 가장 큰 재산인데…' } },
  scenery: { neg: { _: '마을 창밖으로 발전 시설이 보여요.', bitgaram: '아름다운 경치 한가운데 발전 시설이 서 있어요. 관광은 어쩝니까?' } },
  jobs: { pos: { _: '일자리가 생겼어요!', chamsal: '발전소 덕에 어업 말고도 먹고살 길이 열렸어요!', bemet: '이제 젊은이들이 마을을 떠나지 않아도 되겠어요!', bitgaram: '일자리가 늘어 마을이 활기차요.' } },
  clean: { pos: { _: '친환경 전기라 마음이 놓여요.', bitgaram: '깨끗한 에너지로 자연을 지키며 개발하는 방식이 좋습니다.' } },
  carbon: { neg: { _: '기후위기를 키우는 화석 연료는 반대입니다.' } },
  cost: { neg: { _: '전기요금과 세금이 너무 올라요. 너무 비싼 계획 아닌가요?' } },
};
const quote = (f, sign, vid) => { const t = Q[f] && Q[f][sign]; return t ? (t[vid] || t._) : ''; };

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sat = L => 30 * (1 - Math.exp(-L / 30)); // 손실이 쌓일수록 불만이 포화
const cheb = (a, b) => Math.max(Math.abs(a.r - b.r), Math.abs(a.c - b.c));

export function evaluate(state) {
  const mission = state.mission, plants = state.plants.map(p => ({ ...p, out: outputAt(p.type, p.r, p.c) }));
  const wr = wires(plants, mission === 2);
  const air = airGrid(plants), nucs = plants.filter(p => p.type === 'nuclear'), nucGrids = nucs.map(accident);
  const rad = radGrid(plants);
  const supply = [0, 0, 0];
  if (mission === 2) plants.forEach(p => { if (p.link != null) supply[p.link] += p.out; });
  const delivered = mission === 2 ? plants.filter(p => p.link != null) : plants;
  const T = delivered.reduce((s, p) => s + p.out, 0);
  const share = t => T ? delivered.filter(p => p.type === t).reduce((s, p) => s + p.out, 0) / T : 0;
  const rho = share('solar') + share('wind'), phi = share('fossil');

  // 비용
  const plantCost = plants.reduce((s, p) => s + PLANT[p.type].cost, 0);
  const cost = { plants: plantCost, wires: wr.units * WIRE_UNIT, total: plantCost + wr.units * WIRE_UNIT };

  // 생태 영향 합(분류별)
  const eco = zeroCats();
  for (const p of plants) { const e = ecoOfPlant(p); for (const k in eco) eco[k] += e[k]; }
  for (const k in eco) eco[k] += wr.eco[k];
  const ecoTotal = Object.values(eco).reduce((a, b) => a + b, 0);

  const vs = VILLAGES.map((v, i) => {
    const tr = TR[v.id], pts = [], add = (id, val) => { if (Math.abs(val) >= .4) pts.push({ id, pts: val }); };
    if (mission === 2) {
      const ratio = Math.min(1, supply[i] / v.demand);
      add('supply', ratio >= .999 ? 20 : -70 * (1 - ratio));
    } else add('supply', 20); // 미션 1: 전기를 얻게 된다는 기대
    const ae = Math.min(1.2, air[v.r][v.c]);
    add('air', -34 * ae * tr.health);
    let exp = 0, prox = 0;
    nucGrids.forEach((g, k) => {
      let mx = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (inb(v.r + dr, v.c + dc)) mx = Math.max(mx, g[v.r + dr][v.c + dc]);
      exp += mx;
      prox += Math.max(0, 1 - cheb(nucs[k], v) / 4);
    });
    const fear = Math.min(1.3, exp + .6 * prox);
    add('radiation', -32 * fear * tr.fear);
    // 분류별 생태 손실
    const loss = { ...eco };
    if (tr.own && nucs.length) {
      const set = tr.own === 'fishE' ? FISH_E : FISH_W; let s = 0, n = 0;
      set.forEach(nm => { const [r, c] = parse(nm); s += rad[r][c]; n++; });
      loss[tr.own] += 6 * (s / n);
    }
    const bycat = {};
    for (const k in K) bycat[k] = -K[k] * tr.w[k] * sat(loss[k]);
    add('fish', bycat.fishW + bycat.fishE); add('wild', bycat.wild); add('culture', bycat.culture);
    add('farm', bycat.farm); add('terrain', bycat.terrain);
    let vis = 0, jobs = 0;
    for (const p of plants) {
      const d = cheb(p, v), md = Math.abs(p.r - v.r) + Math.abs(p.c - v.c);
      vis += PLANT[p.type].vis * Math.max(0, 1 - (d - 1) / 3);
      jobs += PLANT[p.type].jobs * Math.max(0, 1 - md / 6);
    }
    add('scenery', -2.2 * vis * tr.scenery);
    add('jobs', Math.min(24, 7 * jobs) * tr.jobs);
    if (T) { add('clean', 14 * rho * tr.clean); add('carbon', -16 * phi); }
    if (mission === 2) add('cost', cost.total <= 50 ? 6 : 6 - 24 * clamp((cost.total - 50) / 60, 0, 1));
    pts.sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts));
    const mood = clamp(pts.reduce((s, x) => s + x.pts, 0), -100, 100), tier = tierOf(mood);
    // 말풍선은 가장 큰 요인에서 고르되, 공급 말고도 큰 칭찬거리가 있으면 그쪽을 먼저 쓴다
    const want = mood >= 5 ? 1 : mood <= -5 ? -1 : 0; // 무관심 구간은 가장 큰 요인(공급 제외)을 말한다
    let cand = pts.filter(x => (!want || Math.sign(x.pts) === want) && quote(x.id, x.pts > 0 ? 'pos' : 'neg', v.id));
    if (mission === 1 || !want) { const o = cand.filter(x => x.id !== 'supply'); if (o.length) cand = o; }
    const alt = want > 0 && cand.find(x => x.id !== 'supply' && x.pts > 10);
    const top = alt || cand[0];
    return {
      id: v.id, name: v.name, mood, tier: { emoji: tier[1], label: tier[2], cls: tier[3] }, points: pts,
      supply: supply[i], demand: v.demand, turnout: v.turnout,
      quote: top ? (mission === 1 && top.id === 'supply' ? '새 발전소가 생겨서 전기 걱정이 줄 것 같아요.' : quote(top.id, top.pts > 0 ? 'pos' : 'neg', v.id) || '') : '',
      topFactor: top ? top.id : null, exposure: { air: ae, rad: exp },
    };
  });

  // 점수(100점)
  const wsum = VILLAGES.reduce((s, v) => s + v.turnout, 0);
  const span = mission === 2 ? [40, 80] : [30, 55]; // 미션 1은 긍정 요인이 적어 구간을 좁게
  const resid01 = vs.reduce((s, x, i) => s + (VILLAGES[i].turnout / wsum) * clamp((x.mood + span[0]) / span[1], 0, 1), 0);
  let supply01 = 1, econ01, env01;
  if (mission === 2) {
    supply01 = VILLAGES.reduce((s, v, i) => s + Math.min(v.demand, supply[i]), 0) / VILLAGES.reduce((s, v) => s + v.demand, 0);
    const prod = plants.reduce((s, p) => s + p.out, 0), used = VILLAGES.reduce((s, v, i) => s + Math.min(v.demand, supply[i]), 0);
    const waste = prod ? 1 - used / prod : 0;
    econ01 = clamp((110 - cost.total) / 80, 0, 1) * (1 - .5 * waste) * supply01;
    env01 = clamp(1 - (ecoTotal / 90 + .6 * phi + .15 * nucs.length), 0, 1) * Math.sqrt(supply01);
  } else {
    const o = t => { const p = plants.find(q => q.type === t); return p ? p.out : 0; };
    econ01 = (o('solar') / 20 + o('wind') / 20 + 1 + 1) / 4;
    const airSum = vs.reduce((s, x) => s + x.exposure.air, 0), radSum = vs.reduce((s, x) => s + x.exposure.rad, 0);
    env01 = clamp(1 - (ecoTotal / 30 + .1 * (airSum + radSum)), 0, 1);
  }
  const W = mission === 2 ? { resid: 50, supply: 20, econ: 15, env: 15 } : { resid: 35, supply: 0, econ: 30, env: 35 };
  const sc = { resid: resid01 * W.resid, supply: supply01 * W.supply, econ: econ01 * W.econ, env: env01 * W.env };
  const total = sc.resid + sc.supply + sc.econ + sc.env;
  const cut = mission === 2 ? [85, 72, 58, 42] : [80, 68, 55, 40]; // 미션 1은 얻을 수 있는 최고점이 낮아 기준을 낮춤
  const grade = total >= cut[0] ? 'S' : total >= cut[1] ? 'A' : total >= cut[2] ? 'B' : total >= cut[3] ? 'C' : 'D';
  const approval = vs.reduce((s, x, i) => s + (VILLAGES[i].turnout / wsum) * clamp((x.mood + 100) / 2, 0, 100), 0);
  return { mission, plants, cost, wires: wr, supply, vs, W, sc, total, grade, approval, share: { rho, phi }, eco, ecoTotal, resid01, supply01, econ01, env01 };
}

export const GRADES = {
  S: '시민이 만든 에너지 도시 — 올해의 시장', A: '대부분의 주민이 지지하는 훌륭한 계획', B: '쓸 만하지만 불만이 남은 계획',
  C: '곳곳에서 반발이 나오는 계획', D: '시청 앞이 시위대로 가득 찼어요',
};

// 면접식 꼬리 질문(계획의 약한 곳에서 뽑는다)
export function followUps(ev) {
  const q = [];
  const worst = ev.vs.slice().sort((a, b) => a.mood - b.mood)[0];
  if (worst && worst.mood < 10) q.push(`${worst.name} 주민의 만족이 가장 낮아요(${FACTOR[worst.topFactor] || '여러 요인'}). 이 마을 사람의 입장에서 계획을 다시 설명해 보세요.`);
  if (ev.plants.some(p => p.type === 'nuclear')) q.push('원자력 발전소는 한 번에 많은 전기를 만들지만 사고가 나면 바람과 해류를 따라 퍼져요. 이 위험을 어떻게 줄이거나 보상하겠어요?');
  if (ev.plants.some(p => p.type === 'fossil')) q.push('화석 연료 발전소의 미세먼지는 바람 방향으로 흘러가요. 영향을 받는 마을을 어떻게 설득하겠어요?');
  if (ev.mission === 2 && ev.supply01 < 1) q.push('아직 전기가 모자란 마을이 있어요. 발전 설비를 더 늘릴지, 다른 방법으로 해결할지 말해 보세요.');
  if (ev.mission === 2 && ev.share.rho > .6) q.push('태양광·풍력은 날씨에 따라 발전량이 달라져요. 바람이 약한 날 전기를 어떻게 공급하겠어요?');
  q.push('시민 모두가 만족하는 계획은 어려워요. 어느 마을·어떤 가치를 우선했고 그 이유는 무엇인가요?');
  q.push('조건이 바뀌어 전기 수요가 2배가 된다면 계획을 어떻게 바꾸겠어요?');
  return q.slice(0, 3);
}
