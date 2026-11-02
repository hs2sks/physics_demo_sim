// 캐번디시 비틀림 저울 가상 실험실: 단계 진행·조작·기록·뉴턴과 캐번디시의 안내
import * as P from './physics.js';

const $ = id => document.getElementById(id);
const S = window.SCENE;
const f1 = x => x.toFixed(1), f2 = x => x.toFixed(2), f0 = x => x.toFixed(0);
const sci = (x, d = 2) => { const e = Math.floor(Math.log10(Math.abs(x))), m = x / 10 ** e; return `${m.toFixed(d)}×10<sup>${e}</sup>`; };
const G11 = G => (G / 1e-11).toFixed(2);

let s = P.createState();
let playing = true, speed = 60, clock = 0;
let hist = [];                  // 기록지 {c: 시계(s), x: mm}
let turns = [], marks = [];     // 틀을 옮긴 뒤의 극점들 / 기록지에 찍을 극점
let savedAt = 0, prevOm = 0, lastSample = -1e9;
let rows = [];                  // 평형 위치 기록 {pos, x, c}
let oscRows = [], osc = null;   // 비틀림 진동 시험
let step = 0, maxStep = 0, newestRow = -1, firstMove = true;
let errPairs = 2, errRes = {}, errPick = 'ideal';

/* ---------- 대화(뉴턴 N, 캐번디시 C) ---------- */
const NAMES = { n:'아이작 뉴턴', c:'헨리 캐번디시' };
function say(turnsList) {
  const box = $('talk'); box.innerHTML = '';
  for (const [who, html] of turnsList) {
    const d = document.createElement('div'); d.className = 'turn ' + who;
    d.innerHTML = `<div class="face ${who}" role="img" aria-label="${NAMES[who]} 초상"></div><div class="bub"><span class="who">${NAMES[who]}</span>${html}</div>`;
    box.appendChild(d);
  }
  box.scrollTop = 0;
}
let toastTimer = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.style.display = 'block'; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.style.display = 'none', 2800); }

/* ---------- 3D 이름표 ---------- */
const tagDefs = { head:'비틀림 머리(도선 윗끝)', wire:'구리 도선(은도금)', arm:'나무 막대 팔(길이 약 1.8 m)', small:'작은 납공 0.73 kg', big:'큰 납공 158 kg', scale:'눈금과 버니어', tele:'망원경(방 밖)' };
const tagEls = {};
for (const n of S.anchorNames) { const d = document.createElement('div'); d.className = 'tag'; d.textContent = tagDefs[n]; $('tags').appendChild(d); tagEls[n] = d; }
let tagsOn = [];
function updateTags() {
  for (const n in tagEls) {
    const el = tagEls[n];
    if (!tagsOn.includes(n)) { el.style.display = 'none'; continue; }
    const p = S.project(n); el.style.display = p.ok ? 'block' : 'none'; el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
  }
}

/* ---------- 시간 진행: 극점 찾기, 기록지 표본 ---------- */
function advance(sec) {
  let rem = sec;
  while (rem > 1e-9) {
    const c = Math.min(2, rem); P.step(s, c); rem -= c; clock += c;
    if ((prevOm > 0 && s.om <= 0) || (prevOm < 0 && s.om >= 0)) {
      if (!P.moving(s) && s.pos !== 'none') { const x = P.readMM(s); turns.push({ c:clock, x }); marks.push({ c:clock, x }); if (marks.length > 60) marks.shift(); }
    }
    prevOm = s.om; trackOscillation();
    if (clock - lastSample >= 5) { lastSample = clock; hist.push({ c:clock, x:P.mm(s.th) }); if (hist.length > 700) hist.shift(); }
  }
}
function moveTo(where) {
  P.moveBeam(s, where); turns = []; savedAt = 0; osc = null; paintStatus();
}
const eqEst = () => turns.length >= 3 ? P.eqFromTurns(...turns.slice(-3).map(t => t.x)) : null;
function fastForward() {
  if (P.moving(s) === false && s.pos === 'none') { toast('먼저 큰 공을 위치 A나 B로 옮기세요.'); return; }
  let guard = 0; while ((P.moving(s) || turns.length < 3) && guard++ < 3000) advance(1);
  paintStatus(); drawAll();
}
function record() {
  if (s.pos === 'none') { toast('큰 공이 치워져 있습니다. 위치 A나 B로 옮기세요.'); return false; }
  if (P.moving(s)) { toast('큰 공을 옮기는 중입니다.'); return false; }
  if (turns.length < 3) { toast(`극점이 ${turns.length}개뿐입니다. 3개가 모일 때까지 기다리거나 "빨리 감기"를 누르세요.`); return false; }
  if (turns.length <= savedAt) { toast('새 극점이 나올 때까지 기다린 뒤 다시 기록하세요.'); return false; }
  rows.push({ pos:s.pos, x:eqEst(), c:clock }); newestRow = rows.length - 1; savedAt = turns.length; refreshData(); saveNote();
  return true;
}
function saveNote() { /* 이 브라우저 안에서만 쓰는 값: 외부로 보내지 않음 */ }

/* ---------- 단계 정의 ---------- */
const STEPS = [
  { name:'장치 살펴보기', view:'all', tags:['head', 'wire', 'arm', 'small', 'big', 'scale', 'tele'], enter: enterIntro, render: renderIntro },
  { name:'뉴턴의 중력 법칙', view:'balls', tags:['small', 'big'], enter: enterLaw, render: renderLaw },
  { name:'도선의 뻣뻣함 κ', view:'plan', tags:['arm', 'wire'], enter: enterKappa, render: renderKappa },
  { name:'큰 공 옮기며 측정', view:'plan', tags:['big', 'small', 'scale'], enter: enterMeasure, render: renderMeasure },
  { name:'G 계산하기', view:'all', tags:[], enter: enterAnalysis, render: renderAnalysis },
  { name:'지구의 무게와 밀도', view:'all', tags:[], enter: enterEarth, render: renderEarth },
  { name:'오차 토론', view:'end', tags:['tele', 'scale'], enter: enterErr, render: renderErr },
];
const stepsEl = $('steps'), bodyEl = $('stepBody');
STEPS.forEach((st, i) => { const b = document.createElement('button'); b.dataset.i = i; b.innerHTML = `${i + 1}. ${st.name}`; b.onclick = () => goStep(i); stepsEl.appendChild(b); });
function paintSteps() { [...stepsEl.children].forEach((b, i) => { b.className = (i === step ? 'on ' : '') + (i < maxStep ? 'done' : ''); }); }
function goStep(i) {
  step = i; maxStep = Math.max(maxStep, i); paintSteps(); osc = null;
  tagsOn = STEPS[i].tags; S.goView(STEPS[i].view);
  bodyEl.innerHTML = ''; STEPS[i].enter(); STEPS[i].render(); refreshData();
}
const nextBtn = (label, to) => `<button class="btn primary" data-go="${to}">${label} ▶</button>`;
bodyEl.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) goStep(+g.dataset.go); });

const kappaUsed = () => {
  if (!oscRows.length) return { k:P.KAPPA, measured:false };
  const Tm = oscRows.reduce((a, r) => a + r.T, 0) / oscRows.length; return { k:4 * Math.PI ** 2 * P.I_ARM / Tm ** 2, measured:true, T:Tm };
};

/* ---------- 0. 장치 살펴보기 ---------- */
function enterIntro() {
  s = P.createState(); osc = null; turns = [];
  say([
    ['n', `나는 <b>아이작 뉴턴</b>이오. <b>질량이 있는 모든 물체는 서로 끌어당긴다</b>는 만유인력 법칙을 《프린키피아》(1687)에 썼지요. 그런데 힘이 질량의 곱에 비례하고 거리 제곱에 반비례한다고 썼을 뿐, 비례상수 <b>G</b>의 값은 끝내 말하지 못했소. 지상의 물체끼리 끌어당기는 힘은 도저히 잴 수 없을 만큼 작았으니까.`],
    ['c', `저는 <b>헨리 캐번디시</b>입니다. 그 힘을 1797~98년에 재는 데 성공했지요. 원래 존 미첼이 설계한 장치인데 그가 1793년에 세상을 떠 제가 이어받아 고쳤습니다. 가벼운 <b>팔</b>의 양 끝에 작은 납공을 달아 가는 도선에 매달고, <b>큰 납공</b>을 가까이 가져가 팔이 돌아가는 각을 재는 저울입니다.`],
  ]);
}
function renderIntro() {
  bodyEl.innerHTML = `<h2>실험 장치 둘러보기</h2>
    <p>화면을 드래그해 돌려 보고, 이름표가 가리키는 부품을 확인하세요.</p>
    <p><b>팔</b>: 나무 막대(약 1.8 m). 양 끝에 <b>작은 납공(0.73 kg)</b>.<br><b>큰 납공(158 kg)</b>: 틀에 매달려 있고, 틀을 돌려 작은 공의 이쪽·저쪽으로 옮깁니다.<br><b>망원경</b>: 방 밖에서 팔 끝의 눈금을 읽습니다(방 안 공기의 흔들림을 피하려고).</p>
    <div class="row"><button class="btn" data-view="all">전체</button><button class="btn" data-view="plan">위에서</button><button class="btn" data-view="head">도선·머리</button><button class="btn" data-view="end">눈금·망원경</button><button class="btn" data-view="balls">큰 공</button></div>
    ${nextBtn('1단계: 뉴턴의 법칙과 G', 1)}`;
  bodyEl.querySelectorAll('[data-view]').forEach(b => b.onclick = () => S.goView(b.dataset.view));
}

/* ---------- 1. 뉴턴의 중력 법칙 ---------- */
const lawState = { M:158, m:0.73, r:22.5 };
function enterLaw() {
  s = P.createState(); osc = null; turns = [];
  say([
    ['n', `두 물체 사이의 힘은 이렇게 쓸 수 있소.<span class="eq">F = G · M m / r²</span>사과를 떨어뜨리는 힘도, 달을 붙드는 힘도 같은 법칙이오. 아래에서 질량과 거리를 바꿔 보시오. <b>G를 모르면 F의 절대적인 크기를 알 수 없어</b> 지금은 F/G만 보입니다.`],
    ['c', `저는 지구가 얼마나 무거운지 알고 싶었습니다. 사과와 지구 사이의 힘은 알 수 있어도 <b>G</b>를 모르면 지구의 질량을 계산할 수 없지요. 그래서 실험실 안의 두 납공 사이의 힘을 직접 재려는 것입니다.`],
  ]);
}
function renderLaw() {
  bodyEl.innerHTML = `<h2>F/G = M·m / r² 계산기</h2>
    <label class="sl">큰 공 질량 M <b id="vM"></b></label><input id="sM" type="range" min="1" max="200" step="1" value="${lawState.M}">
    <label class="sl">작은 공 질량 m <b id="vm"></b></label><input id="sm" type="range" min="0.1" max="5" step="0.01" value="${lawState.m}">
    <label class="sl">중심 사이 거리 r <b id="vr"></b></label><input id="sr" type="range" min="5" max="100" step="0.5" value="${lawState.r}">
    <div class="result" id="lawOut"></div>
    <p>같은 질량이라도 거리가 2배가 되면 F/G는 <b>1/4</b>이 됩니다. 캐번디시의 장치(158 kg, 0.73 kg, 22.5 cm)에서 M·m/r²을 구해 보면 약 2.3×10³ kg/m²이고, 여기에 G(약 10⁻¹⁰ 수준)를 곱한 힘은 눈에 보이지 않을 만큼 작습니다. 그 작은 힘을 어떻게 읽을까요?</p>
    ${nextBtn('2단계: 도선은 얼마나 뻣뻣한가', 2)}`;
  const upd = () => {
    lawState.M = +$('sM').value; lawState.m = +$('sm').value; lawState.r = +$('sr').value;
    $('vM').textContent = lawState.M + ' kg'; $('vm').textContent = lawState.m.toFixed(2) + ' kg'; $('vr').textContent = lawState.r.toFixed(1) + ' cm';
    const v = lawState.M * lawState.m / (lawState.r / 100) ** 2;
    $('lawOut').innerHTML = `F / G = M·m / r² = <b>${sci(v)}</b> kg²/m²`;
  };
  ['sM', 'sm', 'sr'].forEach(id => $(id).oninput = upd); upd();
}

/* ---------- 2. 도선의 뻣뻣함 κ ---------- */
function enterKappa() {
  s = P.createState(); P.startOscillation(s, 0); osc = null; turns = []; hist = []; marks = [];
  say([
    ['c', `힘을 각도로 읽으려면 먼저 <b>도선이 얼마나 뻣뻣한지</b>(비틀림 상수 κ)를 알아야 합니다. 큰 공은 멀리 치워 둔 상태에서 팔을 살짝 밀었다 놓으면 <b>비틀림 진동</b>을 합니다. 팔의 관성모멘트 I를 알면 주기 T로 κ를 구할 수 있지요.
      <span class="eq">T = 2π√(I/κ) &nbsp;→&nbsp; κ = 4π²I / T²</span>`],
    ['n', `주기는 진폭에 거의 무관해야 하오. 복원 토크가 비틀린 각에 비례하는 선형 법칙이라는 뜻이니까. 한 번이 아니라 <b>진폭을 바꿔 두 번</b> 재어 확인하시오. 한 주기가 <b>약 7분</b>이나 되니 시간 배속을 이용하시오.`],
  ]);
}
function renderKappa() {
  bodyEl.innerHTML = `<h2>비틀림 진동 시험 <small style="color:var(--sub)">(큰 공은 치워 둔 상태)</small></h2>
    <p>팔 끝을 밀어 놓았다 놓고, 영점을 지나는 시각으로 주기 T를 잽니다(진동 7번 영점 통과). 오른쪽 기록지에서 감쇠 진동을 볼 수 있습니다.</p>
    <div class="row">${[1, 2].map(a => `<button class="btn" data-amp="${a}">${a} mm 밀어 놓기</button>`).join('')}<button class="btn" id="ffOsc">⏩ 측정 끝까지</button></div>
    <div id="oscOut"></div>
    <p class="note">팔의 관성모멘트 I = 2·m·ℓ² + (막대) = <b>${f2(P.I_ARM)} kg·m²</b> (ℓ = 0.914 m, 작은 공 0.73 kg 둘, 막대 0.2 kg 가정)</p>
    ${nextBtn('3단계: 큰 공을 옮기며 측정', 3)}`;
  bodyEl.querySelectorAll('[data-amp]').forEach(b => b.onclick = () => {
    P.startOscillation(s, +b.dataset.amp); prevOm = 0; hist = []; marks = [];
    osc = { amp:+b.dataset.amp, cross:[], prev:P.mm(s.th), prevT:clock }; renderOsc();
  });
  $('ffOsc').onclick = () => { if (!osc) { toast('먼저 진폭 버튼을 눌러 팔을 밀어 놓으세요.'); return; } let g = 0; while (osc && g++ < 5000) advance(2); drawAll(); };
  renderOsc();
}
function renderOsc() {
  const el = $('oscOut'); if (!el) return;
  let html = '';
  if (osc) html += `<div class="note">${osc.amp} mm 진동 측정 중… 영점 통과 ${osc.cross.length}회</div>`;
  if (oscRows.length) {
    html += `<table><tr><th>진폭</th><th>주기 T</th></tr>${oscRows.map(r => `<tr><td>${r.amp} mm</td><td>${r.T.toFixed(0)} s (${(r.T / 60).toFixed(2)} 분)</td></tr>`).join('')}</table>`;
    const k = kappaUsed();
    html += `<div class="result">평균 T = <b>${f0(k.T)} s</b><br>κ = 4π²I/T² = <b>${sci(k.k)}</b> N·m/rad</div>`;
  }
  el.innerHTML = html;
}
function trackOscillation() {
  if (!osc) return;
  const x = P.mm(s.th) - P.mm(P.zeroShift(s));
  if ((osc.prev > 0 && x <= 0) || (osc.prev < 0 && x >= 0)) {
    const w = Math.abs(osc.prev) / (Math.abs(osc.prev) + Math.abs(x));
    osc.cross.push(osc.prevT + w * (clock - osc.prevT));
    if (osc.cross.length >= 7) {
      const n = osc.cross.length, T = 2 * (osc.cross[n - 1] - osc.cross[0]) / (n - 1);
      oscRows = oscRows.filter(r => r.amp !== osc.amp); oscRows.push({ amp:osc.amp, T }); oscRows.sort((a, b) => a.amp - b.amp);
      osc = null; renderOsc();
      if (oscRows.length === 1) say([['c', `주기 약 <b>${f0(T)}초</b>(${(T / 60).toFixed(1)}분)를 얻었습니다. 이제 <b>다른 진폭</b>으로도 해 보세요.`]]);
      else say([['n', `진폭이 달라도 주기가 <b>거의 같구려</b>. 복원 토크가 각에 비례한다는 뜻이오.`], ['c', `덕분에 도선의 뻣뻣함 κ를 얻었습니다. 이제 큰 공을 가져다 놓고 팔이 얼마나 돌아가는지 볼 차례입니다.`]]);
    }
  }
  if (osc) { osc.prev = x; osc.prevT = clock; renderOscLight(); }
}
function renderOscLight() { const el = bodyEl.querySelector('#oscOut .note'); if (el && osc) el.textContent = `${osc.amp} mm 진동 측정 중… 영점 통과 ${osc.cross.length}회`; }

/* ---------- 3. 큰 공 옮기며 측정 ---------- */
function enterMeasure() {
  if (step === 3 && s.pos === 'none') { s = P.createState(); turns = []; hist = []; marks = []; }
  say([
    ['c', `이제 본 실험입니다. 큰 납공을 작은 공의 <b>한쪽(위치 A)</b>에 가져다 놓으면 두 공이 끌어당겨 팔이 돌아갑니다. <b>반대쪽(위치 B)</b>으로 옮기면 반대로 돌아가지요. 두 평형 위치의 <b>차이</b>가 곧 팔이 돌아간 각의 두 배입니다.`],
    ['n', `하지만 팔은 평형에 닿아도 멈추지 않고 <b>오래 흔들릴 것</b>이오(주기 7분!). 그래서 흔들림의 끝(극점) 세 개를 읽어 중심을 추정하시오. <span class="eq">평형 = ((x₁ + x₃)/2 + x₂) / 2</span>`],
  ]);
}
function renderMeasure() {
  bodyEl.innerHTML = `<h2>위치 A ↔ B 옮기며 평형 읽기</h2>
    <div class="row"><button class="btn" id="mA">큰 공 → 위치 A</button><button class="btn" id="mB">큰 공 → 위치 B</button></div>
    <div class="row"><button class="btn" id="ff">⏩ 극점 3개까지 빨리 감기</button><button class="btn primary" id="rec">💾 평형 위치 기록</button></div>
    <div class="note" id="mStat"></div>
    <p>순서를 <b>A → B → A → B</b>로 번갈아 하면 시간에 따라 천천히 변하는 영점 표류(온도 변화 등)의 영향이 줄어듭니다. 최소 4번(A,B,A,B) 기록하세요. 기록은 오른쪽 표에 쌓입니다.</p>
    ${nextBtn('4단계: G 계산하기', 4)}`;
  $('mA').onclick = () => { moveTo('A'); firstMove && say([['c', `큰 공을 <b>위치 A</b>로 옮깁니다. 틀을 돌려 큰 공이 작은 공 한쪽 옆에 오도록 하지요(약 40초). 팔이 천천히 돌아가기 시작합니다.`]]); firstMove = false; };
  $('mB').onclick = () => { moveTo('B'); say([['c', `이번에는 <b>위치 B</b>입니다. 틀이 한 바퀴 반대쪽으로 돌아 큰 공이 작은 공의 <b>반대 옆</b>으로 갑니다. 팔은 이번에 반대 방향으로 돌아가야 합니다.`]]); };
  $('ff').onclick = fastForward;
  $('rec').onclick = () => {
    if (record()) {
      const r = rows[rows.length - 1], n = rows.length;
      if (n === 1) say([['c', `위치 ${r.pos}의 평형 위치를 <b>${f2(r.x)} mm</b>로 기록했습니다. 이제 반대쪽(${r.pos === 'A' ? 'B' : 'A'})으로 옮겨 같은 방법으로 재 봅시다.`]]);
      else if (n >= 4) say([['n', `자료가 충분히 쌓였구려. 이제 <b>4단계</b>로 가서 이 두 평형 위치의 차에서 G를 구해 보시오.`]]);
      else say([['c', `기록했습니다(${r.pos}: ${f2(r.x)} mm). 번갈아 가며 더 모읍시다.`]]);
    }
  };
  paintStatus();
}
function paintStatus() {
  const el = $('mStat'); if (!el) return;
  const pos = s.pos === 'none' ? '치워 둠' : '위치 ' + s.pos, e = eqEst();
  el.innerHTML = `큰 공: <b>${pos}</b>${P.moving(s) ? ' (이동 중…)' : ''} · 극점 ${turns.length}개${e !== null ? ` · 추정 평형 <b>${f2(e)} mm</b>` : ''} · 기록 ${rows.length}개`;
}

/* ---------- 4. G 계산하기 ---------- */
function pairsOf(rs) {
  const out = [];
  for (let i = 0; i + 1 < rs.length; i++) if (rs[i].pos !== rs[i + 1].pos) { const d = Math.abs(rs[i].x - rs[i + 1].x); out.push({ i, a:rs[i], b:rs[i + 1], d, ...P.gFromDelta(d, kappaUsed().k) }); }
  return out;
}
function enterAnalysis() {
  osc = null; const ps = pairsOf(rows);
  if (!ps.length) say([['c', `아직 A와 B를 모두 재지 못했습니다. 3단계로 돌아가 두 위치에서 평형 위치를 기록해 오세요.`]]);
  else {
    const g = P.meanSE(ps.map(p => p.G));
    say([['c', `평형 위치의 차 Δx에서 팔이 돌아간 각을 구하고, 도선이 버티는 토크, 공 하나가 받는 힘, 그리고 G를 차례로 구합니다.
      <span class="eq">θ = Δx / (2ℓ) → τ = κθ → F = τ/(2ℓ) → G = F r² / (M m)</span>`],
      ['n', `내 법칙에서 G만 남기고 정리한 것이구려. 결과는 <b>${G11(g.m)}×10⁻¹¹</b> N·m²/kg² 근처로 나왔소. 이 숫자가 몇 번 읽어도 비슷하게 나오는지 보시오.`]]);
  }
}
function renderAnalysis() {
  const ps = pairsOf(rows), k = kappaUsed();
  let html = `<h2>평형 위치의 차에서 G 구하기</h2>`;
  if (!ps.length) html += `<div class="result bad">A와 B에서 각각 기록이 있어야 합니다(3단계).</div>`;
  else {
    const g = P.meanSE(ps.map(p => p.G)), p0 = ps[0];
    html += `<table><tr><th>#</th><th>쌍</th><th>Δx(mm)</th><th>G (10⁻¹¹)</th></tr>${ps.map((p, i) => `<tr><td>${i + 1}</td><td>${p.a.pos}→${p.b.pos}</td><td>${f2(p.d)}</td><td>${G11(p.G)}</td></tr>`).join('')}</table>
      <div class="result">평균 G = <b>${G11(g.m)}×10⁻¹¹</b> N·m²/kg²${ps.length > 1 ? ` (표준오차 ±${G11(g.se)})` : ''}</div>
      <p class="note">첫 쌍으로 따라가 봅니다. 사용한 κ = ${sci(k.k)} N·m/rad ${k.measured ? '(2단계 측정)' : '(2단계 미측정 — 주기 7분으로 계산한 값)'}<br>
      θ = Δx / (2ℓ) = ${f2(p0.d)} mm ÷ (2×914 mm) = ${sci(p0.theta)} rad<br>
      τ = κθ = ${sci(p0.tau)} N·m → 공 하나가 받는 힘 F = ${sci(p0.F)} N</p>`;
    if (!k.measured) html += `<div class="note">2단계에서 주기를 직접 재 보면 κ를 실험값으로 쓸 수 있습니다.</div>`;
  }
  html += nextBtn('5단계: 지구의 무게와 밀도', 5);
  bodyEl.innerHTML = html;
}

/* ---------- 5. 지구의 무게와 밀도 ---------- */
function myG() { const ps = pairsOf(rows); return ps.length ? P.meanSE(ps.map(p => p.G)).m : null; }
function enterEarth() {
  const G = myG(); osc = null;
  if (!G) { say([['c', `G가 아직 없습니다. 4단계에서 G를 먼저 구해 오세요.`]]); return; }
  say([
    ['n', `<b>지구 표면의 물체</b>가 받는 힘이 곧 무게이니, <span class="eq">m g = G M<sub>지구</sub> m / R²</span>에서 지구의 질량은 <b>M = gR²/G</b>가 되오. G를 알았으니 지구의 질량과 평균 밀도를 구할 수 있겠구려!`],
    ['c', `제가 1798년에 발표한 제목은 《지구의 밀도를 구하는 실험》이었습니다. 저는 G라는 기호를 쓰지 않고 지구의 밀도를 물의 몇 배인지로 말했지요. 뉴턴 선생은 지구의 밀도가 물의 5~6배쯤일 것이라고 짐작하셨는데, 제 결과가 그 짐작과 얼마나 가까운지 보십시오.`],
  ]);
}
function renderEarth() {
  const G = myG();
  if (!G) { bodyEl.innerHTML = `<h2>지구의 무게와 밀도</h2><div class="result bad">먼저 4단계에서 G를 구하세요.</div><button class="btn" data-go="3">◀ 3단계로(측정)</button>`; return; }
  const M = P.earthMass(G), rho = P.earthDensity(G) / 1000, Fkg = null;
  const bar = (label, a, b, color) => `<div style="margin:6px 0"><div style="display:flex;justify-content:space-between;font-size:.8em"><span>${label}</span><b>${a === b ? a.toFixed(2) : a + '~' + b}</b></div><div style="background:#1b2027;border-radius:5px;height:10px;position:relative"><span style="position:absolute;left:${a / 8 * 100}%;width:${Math.max(1.2, (b - a) / 8 * 100)}%;top:0;bottom:0;background:${color};border-radius:5px"></span></div></div>`;
  bodyEl.innerHTML = `<h2>G → 지구의 질량·밀도</h2>
    <div class="result">내 G = <b>${G11(G)}×10⁻¹¹</b><br>지구 질량 M = gR²/G = <b>${sci(M)}</b> kg<br>평균 밀도 ρ = 3g / (4πGR) = <b>${rho.toFixed(2)}</b> g/cm³ (물의 ${rho.toFixed(2)}배)</div>
    ${bar('뉴턴의 짐작(5~6배)', 5, 6, '#d9a441')}${bar('캐번디시 1798(약 5.4~5.5배)', 5.4, 5.5, '#6fa8dc')}${bar('내 측정', +rho.toFixed(2), +rho.toFixed(2), '#7fc98a')}${bar('현재 알려진 값(5.51배)', 5.51, 5.51, '#c8c8c8')}
    <p class="note">참고: 지표의 흔한 암석은 물의 약 2.7배입니다. 지구 평균이 5.5배라는 것은 <b>속이 훨씬 무겁다</b>(철·니켈 핵)는 뜻입니다. 캐번디시 논문의 평균값은 자료마다 5.45~5.48로 조금씩 다르게 적혀 있어, 위 값은 근삿값으로 표시했습니다.</p>
    ${nextBtn('6단계: 오차 토론', 6)}`;
}

/* ---------- 6. 오차 토론 ---------- */
const SCEN = [
  { id:'actual', label:'표류 있음 + 눈금 0.05 mm 단위로 읽음', opt:{} },
  { id:'nodrift', label:'영점 표류가 없다면', opt:{ drift:false } },
  { id:'fine', label:'눈금을 정밀하게 읽었다면', opt:{ read:false } },
  { id:'ideal', label:'둘 다 이상적', opt:{ drift:false, read:false } },
];
function runScenarios() { errRes = {}; for (const sc of SCEN) errRes[sc.id] = P.replay(errPairs, { ...sc.opt, driftRate:0.25 }); }
function enterErr() {
  osc = null; runScenarios();
  say([
    ['c', `제 결과도 완벽하지 않았습니다. 가장 두려운 것은 <b>공기의 흐름과 온도 차</b>였지요. 방 안의 따뜻한 공기가 움직이면 큰 공과 상자 사이에서 대류가 생겨 팔이 밀립니다. 그래서 저는 장치를 <b>닫힌 방에 두고 밖에서 망원경으로</b> 읽었습니다.`],
    ['n', `같은 실험을 조건을 바꿔 다시 돌려 보시오. 모델이 보는 <b>진짜 G는 6.674×10⁻¹¹</b>이니 무엇이 얼마나 어긋나게 하는지 알 수 있소. A–B를 <b>여러 번 반복해 평균</b>하면 어떻게 되는지도 보시오.`],
  ]);
}
function renderErr() {
  const T = P.G_TRUE, mine = myG();
  const body = SCEN.map(sc => { const r = errRes[sc.id], d = (r.G / T - 1) * 100; return `<tr><td>${sc.label}</td><td>${G11(r.G)}</td><td>${d >= 0 ? '+' : ''}${d.toFixed(2)}%</td></tr>`; }).join('');
  bodyEl.innerHTML = `<h2>왜 진짜 값과 조금 다를까?</h2>
    <p>같은 순서(A→B→A→B…)로 실험을 처음부터 다시 돌립니다. 영점이 시간당 약 0.25 mm 흘러가는 경우를 넣었습니다.</p>
    <table style="font-size:.8em"><tr><th style="text-align:left">조건</th><th>G(10⁻¹¹)</th><th>진짜 값과 차</th></tr>${body}</table>
    ${mine ? `<div class="note">내가 측정한 G: <b>${G11(mine)}×10⁻¹¹</b> (진짜 값과 ${((mine / T - 1) * 100).toFixed(2)}% 차이)</div>` : ''}
    <label class="sl">A–B 반복 횟수(쌍) <b id="vPairs">${errPairs}</b></label>
    <input id="errPairs" type="range" min="1" max="6" step="1" value="${errPairs}">
    <p>반복이 많을수록 평균이 안정되지만 시간이 길어져 표류가 더 쌓입니다. 번갈아 재는 이유를 생각해 보세요.</p>
    <details><summary style="cursor:pointer;color:var(--accent);font-size:.88em">모델에 없는 것 · 토론 질문</summary>
      <p><b>모델에 없는 것</b><br>• 공기 대류·온도 차(실제로는 가장 큰 방해물)<br>• 도선의 느린 늘어짐(탄성 후효과)과 자기력<br>• 큰 공 틀과 상자의 중력, 주변 물체의 영향</p>
      <p><b>생각해 볼 질문</b><br>1. 캐번디시가 방 밖에서 망원경으로 읽은 이유는?<br>2. 두 평형 위치의 <b>차</b>를 쓰면 어떤 오차가 사라지나?<br>3. 팔을 더 길게, 도선을 더 가늘게 하면 감도는 어떻게 되고 대신 무엇이 어려워지나?<br>4. 이 방법으로 G를 지금도 정밀하게 재기 어려운 이유는? (G는 기본상수 중 가장 불확실하다)</p>
    </details>
    <div class="row"><button class="btn" data-go="4">◀ 4단계로(G 계산)</button></div>`;
  $('errPairs').oninput = e => { errPairs = +e.target.value; runScenarios(); renderErr(); };
}

/* ---------- 데이터(오른쪽 패널의 표) ---------- */
function refreshData() {
  const body = rows.map((r, i) => `<tr class="${i === newestRow ? 'new' : ''}"><td>${i + 1}</td><td>${r.pos}</td><td>${f2(r.x)}</td><td>${f0(r.c / 60)}분</td></tr>`).join('');
  $('dataBody').innerHTML = rows.length ? `<table><tr><th>#</th><th>큰 공</th><th>평형 위치 x(mm)</th><th>시각</th></tr>${body}</table>
    <div class="note">x는 팔 끝(중심에서 91.4 cm)의 눈금 읽기. 극점 3개로 추정한 평형 위치.</div>` : '<p class="note">아직 기록이 없습니다.</p>';
}

/* ---------- 망원경 시야와 기록지 ---------- */
function drawScope() {
  const cv = $('scope'); if (!cv) return; const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#2a2418'); gr.addColorStop(1, '#14110b'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.fillStyle = '#e8dcbc'; g.fillRect(0, H * 0.22, W, H * 0.4);              // 상아 눈금판
  const HALF = 2.5, X = v => W / 2 + v / HALF * (W / 2 - 24);
  g.strokeStyle = '#2a1a0a'; g.fillStyle = '#2a1a0a'; g.textAlign = 'center'; g.font = '20px sans-serif';
  for (let v = -HALF; v <= HALF + 1e-9; v += 0.5) {
    const whole = Math.abs(v - Math.round(v)) < 1e-9; g.lineWidth = whole ? 3 : 1.6;
    g.beginPath(); g.moveTo(X(v), H * 0.62); g.lineTo(X(v), H * (whole ? 0.32 : 0.42)); g.stroke();
    if (whole) g.fillText((v > 0 ? '+' : '') + v.toFixed(0), X(v), H * 0.3);
  }
  const x = P.mm(s.th), xr = Math.max(-HALF, Math.min(HALF, x));
  g.fillStyle = '#c0392b'; g.beginPath(); g.moveTo(X(xr), H * 0.64); g.lineTo(X(xr) - 11, H * 0.86); g.lineTo(X(xr) + 11, H * 0.86); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(192,57,43,.8)'; g.lineWidth = 2; g.beginPath(); g.moveTo(X(xr), H * 0.14); g.lineTo(X(xr), H * 0.66); g.stroke();
  g.fillStyle = '#efe6cf'; g.textAlign = 'left'; g.font = '22px sans-serif';
  g.fillText('읽은 값 ' + (P.readMM(s) >= 0 ? '+' : '') + P.readMM(s).toFixed(2) + ' mm', 14, H - 12);
  g.textAlign = 'right'; g.fillStyle = '#a7acb4'; g.fillText('0 = 큰 공을 치웠을 때 위치', W - 12, H - 12);
}
function drawChart() {
  const cv = $('chart'); if (!cv) return; const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H); g.fillStyle = '#12100c'; g.fillRect(0, 0, W, H);
  const SPAN = 2600, t1 = clock, t0 = t1 - SPAN, m = { l:70, r:14, t:14, b:42 };
  const vis = hist.filter(h => h.c >= t0);
  let ym = 1.4; for (const h of vis) ym = Math.max(ym, Math.abs(h.x) * 1.15); ym = Math.ceil(ym * 2) / 2;
  const X = c => m.l + (c - t0) / SPAN * (W - m.l - m.r), Y = v => m.t + (ym - v) / (2 * ym) * (H - m.t - m.b);
  g.font = '20px sans-serif'; g.textAlign = 'right'; g.strokeStyle = '#2b2a24'; g.fillStyle = '#a7acb4'; g.lineWidth = 1;
  for (let v = -ym; v <= ym + 1e-9; v += 0.5) { g.beginPath(); g.moveTo(m.l, Y(v)); g.lineTo(W - m.r, Y(v)); g.stroke(); if (Math.abs(v % 1) < 1e-9) g.fillText(v.toFixed(0), m.l - 8, Y(v) + 6); }
  g.strokeStyle = '#4a4a40'; g.beginPath(); g.moveTo(m.l, Y(0)); g.lineTo(W - m.r, Y(0)); g.stroke();
  g.textAlign = 'center'; for (let c = Math.ceil(t0 / 600) * 600; c <= t1; c += 600) { g.beginPath(); g.moveTo(X(c), m.t); g.lineTo(X(c), H - m.b); g.stroke(); g.fillText(f0(c / 60) + '분', X(c), H - m.b + 24); }
  g.save(); g.translate(20, (H - m.b) / 2); g.rotate(-Math.PI / 2); g.fillText('팔 끝 위치 (mm)', 0, 0); g.restore();
  g.strokeStyle = '#d9a441'; g.lineWidth = 2.5; g.beginPath();
  vis.forEach((h, i) => { i ? g.lineTo(X(h.c), Y(h.x)) : g.moveTo(X(h.c), Y(h.x)); }); g.lineTo(X(clock), Y(P.mm(s.th))); g.stroke();
  g.strokeStyle = '#7fc98a'; g.lineWidth = 2;
  for (const k of marks) if (k.c >= t0) { g.beginPath(); g.arc(X(k.c), Y(k.x), 8, 0, 7); g.stroke(); }
  const e = eqEst();
  if (e !== null && !P.moving(s)) { g.setLineDash([10, 7]); g.strokeStyle = '#7fc98a'; g.beginPath(); g.moveTo(m.l, Y(e)); g.lineTo(W - m.r, Y(e)); g.stroke(); g.setLineDash([]); g.textAlign = 'right'; g.fillStyle = '#7fc98a'; g.fillText('추정 평형 ' + f2(e) + ' mm', W - m.r - 6, Y(e) - 8); }
}
const drawAll = () => { drawScope(); drawChart(); };

/* ---------- 실시간 읽기 값 ---------- */
function paintLive() {
  const stat = Math.abs(s.om) < 1e-6 && !P.moving(s) ? '<span class="st-ok">정지</span>' : P.moving(s) ? '<span class="st-move">큰 공 이동 중</span>' : '<span class="st-move">흔들리는 중</span>';
  const pos = s.pos === 'none' ? '치워 둠' : '위치 ' + s.pos;
  const mins = Math.floor(clock / 60), sec = Math.floor(clock % 60);
  $('live').innerHTML = `<span>큰 공</span><span>${pos}</span><span>팔 끝 위치</span><span>${P.readMM(s) >= 0 ? '+' : ''}${P.readMM(s).toFixed(2)} mm</span><span>상태</span><span>${stat}</span><span>경과 시간</span><span>${mins}분 ${String(sec).padStart(2, '0')}초</span>`;
}

/* ---------- 메인 루프 ---------- */
let statT = 0;
S.onFrame(dt => {
  if (playing) advance(dt * speed);
  S.setPose(s.th, s.beam); updateTags(); paintLive(); drawAll();
  statT += dt; if (statT > 0.3) { statT = 0; paintStatus(); }
});
$('lite').checked = S.lite; $('lite').onchange = e => { S.setLite(e.target.checked); toast(e.target.checked ? '저사양 모드: 그림자·유리 효과를 껐습니다.' : '고화질 모드로 바꿨습니다.'); };
$('speed').onchange = e => speed = +e.target.value;
$('reset').onclick = () => { rows = []; oscRows = []; hist = []; marks = []; turns = []; newestRow = -1; clock = 0; lastSample = -1e9; firstMove = true; maxStep = 0; s = P.createState(); goStep(0); };

/* ---------- 시험용 훅 ---------- */
window.__lab = { get s() { return s; }, P, goStep, advance, fastForward, moveTo, record, rows: () => rows, turns: () => turns, myG, pairsOf, get step() { return step; } };

goStep(0);
