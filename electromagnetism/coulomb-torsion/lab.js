// 쿨롱 비틀림 저울 가상 실험실: 단계 진행·조작·데이터·쿨롱 안내
import * as P from './physics.js';

const $ = id => document.getElementById(id);
const S = window.SCENE;
const f1 = x => x.toFixed(1), f0 = x => x.toFixed(0);
const sci = x => { const e = Math.floor(Math.log10(Math.abs(x))), m = x / 10 ** e; return `${m.toFixed(1)}×10<sup>${e}</sup>`; };

let s = P.createState();
let playing = true, speed = 3;
let rows = [];                 // 측정 기록
let oscRows = [];              // 비틀림 진동 시험 기록 {amp, T}
let osc = null;                // 진행 중인 주기 측정
let qTag = 'q';                // 탐침구 전하 상태 표시
let step = 0, maxStep = 0, newestRow = -1;
let showRef = true;

/* ---------- 쿨롱의 말 ---------- */
const bubble = $('bubble');
const say = html => { bubble.innerHTML = html; bubble.scrollTop = 0; };
let toastTimer = 0;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.style.display = 'block';
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.style.display = 'none', 2600);
}

/* ---------- 3D 이름표 ---------- */
const tagDefs = { mic:'마이크로미터', wire:'은 도선', glass:'유리 원통', ring:'눈금 띠(0~360°)', needle:'바늘 쪽 구', probe:'고정된 탐침구' };
const tagEls = {};
for (const n of S.anchorNames) {
  const d = document.createElement('div'); d.className = 'tag'; d.textContent = tagDefs[n]; $('tags').appendChild(d); tagEls[n] = d;
}
let tagsOn = [];
function updateTags() {
  for (const n in tagEls) {
    const el = tagEls[n];
    if (!tagsOn.includes(n)) { el.style.display = 'none'; continue; }
    const p = S.project(n);
    el.style.display = p.ok ? 'block' : 'none'; el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
  }
}

/* ---------- 단계 정의 ---------- */
const STEPS = [
  { name:'장치 살펴보기', view:'all', tags:['mic', 'wire', 'glass', 'ring', 'needle', 'probe'], enter: enterIntro, render: renderIntro },
  { name:'비틀림 법칙', view:'needle', tags:['wire', 'needle'], enter: enterLaw, render: renderLaw },
  { name:'대전과 첫 측정', view:'needle', tags:['needle', 'probe'], enter: enterCharge, render: renderCharge },
  { name:'거리 줄이기', view:'all', tags:['mic', 'ring'], enter: enterDistance, render: renderDistance },
  { name:'결과 분석', view:'all', tags:[], enter: enterAnalysis, render: renderAnalysis },
  { name:'전하량의 영향', view:'needle', tags:['probe', 'needle'], enter: enterQ, render: renderQ },
  { name:'오차 토론', view:'all', tags:[], enter: enterErr, render: renderErr },
];

const stepsEl = $('steps'), bodyEl = $('stepBody');
STEPS.forEach((st, i) => {
  const b = document.createElement('button'); b.dataset.i = i;
  b.innerHTML = `${i + 1}. ${st.name}`; b.onclick = () => goStep(i); stepsEl.appendChild(b);
});
function paintSteps() {
  [...stepsEl.children].forEach((b, i) => { b.className = (i === step ? 'on ' : '') + (i < maxStep ? 'done' : ''); });
}
function goStep(i) {
  step = i; maxStep = Math.max(maxStep, i); paintSteps();
  osc = null;
  tagsOn = STEPS[i].tags; S.goView(STEPS[i].view);
  bodyEl.innerHTML = '';
  STEPS[i].enter(); STEPS[i].render(); refreshData();
}
const nextBtn = (label, to) => `<button class="btn primary" data-go="${to}">${label} ▶</button>`;
bodyEl.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) goStep(+g.dataset.go); });

/* ---------- 공통 조작 ---------- */
function ensureCharged(silent) {
  if (s.qn > 0.2e-9 && s.qp > 0.2e-9 && s.probeIn) return;
  s = P.createState(); P.chargeProbe(s, 1.0e-9); P.shareCharge(s); P.settle(s, 8); qTag = 'q';
  if (!silent) toast('전하가 거의 새어 나가서 탐침구를 다시 대전시켰습니다.');
}
function steady() { return P.isSteady(s); }
function recordRow() {
  if (!steady()) { toast('바늘이 아직 흔들리고 있습니다. 멈출 때까지 기다리거나 "바로 안정"을 누르세요.'); return false; }
  if (!s.probeIn || s.qn < 0.05e-9) { toast('전하가 없어 기록할 수 없습니다. 먼저 대전시키세요.'); return false; }
  if (P.deg(s.theta - P.THETA0) < 0.3) { toast('두 구가 닿아 있습니다. 전하를 나눈 뒤 측정하세요.'); return false; }
  rows.push(P.makeRow(s, qTag)); newestRow = rows.length - 1; refreshData();
  if (innerWidth > 900) openData(true); else toast('기록했습니다. 아래쪽 📊 데이터 버튼에서 표를 볼 수 있습니다.');
  return true;
}
function settleNow() { P.settle(s, 10); }

/* ---------- 0. 장치 살펴보기 ---------- */
function enterIntro() {
  s = P.createState(); osc = null; qTag = 'q';
  say(`안녕하시오. 나는 <b>샤를 오귀스탱 드 쿨롱</b>입니다. 지금 보이는 것은 내가 전기의 힘을 재려고 만든 <b>비틀림 저울</b>이지요.<br><br>
    가는 은 도선에 가벼운 바늘이 매달려 있고, 바늘 끝의 작은 구에 전기의 힘이 작용하면 도선이 <b>비틀리면서</b> 바늘이 돌아갑니다. 눈에 보이지 않을 만큼 작은 힘도 <b>각도</b>로 읽을 수 있다는 점이 핵심입니다.`);
}
function renderIntro() {
  bodyEl.innerHTML = `<h2>실험 장치 둘러보기</h2>
    <p>화면을 드래그해 돌려 보고, 이름표가 가리키는 부품을 확인하세요.</p>
    <p><b>마이크로미터</b>: 도선의 윗끝을 돌려 비틀림을 더합니다.<br><b>바늘</b>: 한쪽 끝은 작은 구, 반대쪽은 종이 원판(무게 균형).<br><b>눈금 띠</b>: 두 구 사이 각 θ를 읽습니다.</p>
    <div class="row"><button class="btn" data-view="all">전체</button><button class="btn" data-view="top">위쪽</button><button class="btn" data-view="needle">바늘</button><button class="btn" data-view="ring">눈금</button><button class="btn" data-view="plan">위에서</button></div>
    ${nextBtn('1단계: 도선은 얼마나 뻣뻣한가', 1)}`;
  bodyEl.querySelectorAll('[data-view]').forEach(b => b.onclick = () => S.goView(b.dataset.view));
}

/* ---------- 1. 비틀림 법칙 ---------- */
function enterLaw() {
  s = P.createState(); P.startOscillation(s, 0); osc = null;
  say(`전기의 힘을 재려면 먼저 <b>도선의 뻣뻣함</b>을 알아야 합니다. 도선을 각 φ만큼 비틀면 되돌리려는 힘의 모멘트가 생기는데, 나는 이것이 <b>비틀린 각에 비례</b>한다고 보았습니다.
    <span class="eq">토크 = κ · φ</span>
    이를 확인하려면 바늘을 살짝 돌려 놓았다가 놓아 보세요. 비례한다면 <b>진폭이 달라도 흔들리는 주기가 같아야</b> 합니다.`);
}
function renderLaw() {
  bodyEl.innerHTML = `<h2>비틀림 진동 시험 <small style="color:var(--sub)">(탐침은 빼 둔 상태)</small></h2>
    <p>바늘을 돌려 놓았다 놓고, 주기 T를 재 봅니다.</p>
    <div class="row">${[10, 30, 60].map(a => `<button class="btn" data-amp="${a}">${a}° 돌려 놓기</button>`).join('')}</div>
    <div id="oscOut"></div>
    ${nextBtn('2단계: 전하를 주고 첫 측정', 2)}`;
  bodyEl.querySelectorAll('[data-amp]').forEach(b => b.onclick = () => {
    P.startOscillation(s, +b.dataset.amp); osc = { amp:+b.dataset.amp, cross:[], prev:s.theta - P.THETA0, prevT:s.t };
    renderOsc();
  });
  renderOsc();
}
function renderOsc() {
  const el = $('oscOut'); if (!el) return;
  let html = '';
  if (osc) html += `<div class="note">${osc.amp}° 진동 측정 중… 영점 통과 ${osc.cross.length}회</div>`;
  if (oscRows.length) {
    html += `<table><tr><th>진폭</th><th>주기 T</th></tr>${oscRows.map(r => `<tr><td>${r.amp}°</td><td>${r.T.toFixed(2)} s</td></tr>`).join('')}</table>`;
    const Tm = oscRows.reduce((a, r) => a + r.T, 0) / oscRows.length;
    const kappa = 4 * Math.PI ** 2 * P.I_NEEDLE / Tm ** 2;
    html += `<div class="result">평균 T = <b>${Tm.toFixed(2)} s</b><br>바늘의 관성모멘트 I = ${sci(P.I_NEEDLE)} kg·m²<br>κ = 4π²I/T² = <b>${sci(kappa)} N·m/rad</b></div>`;
  }
  el.innerHTML = html;
}
function trackOscillation() {
  if (!osc) return;
  const x = s.theta - P.THETA0;
  if ((osc.prev > 0 && x <= 0) || (osc.prev < 0 && x >= 0)) {
    const w = Math.abs(osc.prev) / (Math.abs(osc.prev) + Math.abs(x));       // 보간으로 통과 시각
    osc.cross.push(osc.prevT + w * (s.t - osc.prevT)); renderOscLight();
    if (osc.cross.length >= 7) {
      const n = osc.cross.length, T = 2 * (osc.cross[n - 1] - osc.cross[0]) / (n - 1);
      oscRows = oscRows.filter(r => r.amp !== osc.amp); oscRows.push({ amp:osc.amp, T }); oscRows.sort((a, b) => a.amp - b.amp);
      const done = oscRows.length;
      osc = null; renderOsc(); saveForReport();
      if (done === 1) say(`주기를 얻었습니다. 이제 <b>다른 진폭</b>으로도 해 보세요.`);
      else if (done >= 2) say(`진폭이 달라도 주기는 <b>거의 같습니다</b>. 비틀림의 토크가 각에 비례한다는 뜻이지요. 주기 T와 바늘의 관성 I로 도선의 뻣뻣함을 구할 수 있습니다.
        <span class="eq">T = 2π√(I/κ) &nbsp;→&nbsp; κ = 4π²I / T²</span>
        이제 전기의 힘을 토크로 바꿔 읽을 준비가 됐습니다. 도선이 비틀린 각 Θ가 곧 <b>힘의 크기</b>를 나타냅니다.`);
    }
  }
  if (osc) { osc.prev = x; osc.prevT = s.t; }
}
function renderOscLight() { const el = bodyEl.querySelector('#oscOut .note'); if (el && osc) el.textContent = `${osc.amp}° 진동 측정 중… 영점 통과 ${osc.cross.length}회`; }

/* ---------- 2. 대전과 첫 측정 ---------- */
function enterCharge() {
  s = P.createState(); osc = null; qTag = 'q'; chargeStage = 0;
  say(`이제 전기를 띠게 해 봅시다. 탐침 끝의 구에 대전체를 대면 전하가 옮겨 갑니다. 이 구를 <b>바늘 끝의 구에 닿게</b> 하면 같은 크기의 전하를 똑같이 나눠 갖습니다.<br><br>같은 부호로 대전된 두 구는 서로 밀어내지요. 그 밀어내는 힘을 도선의 비틀림으로 재는 것입니다.`);
}
let chargeStage = 0;
function renderCharge() {
  bodyEl.innerHTML = `<h2>전하를 주고 평형각 읽기</h2>
    <button class="btn" id="b1">① 탐침구에 대전체를 대어 전하 주기</button>
    <button class="btn" id="b2">② 탐침구를 바늘의 구에 닿게 해 전하 나누기</button>
    <button class="btn" id="b3">③ 바로 안정 (평형까지 기다림)</button>
    <button class="btn primary" id="b4">④ 지금 θ 기록하기</button>
    <p>바늘이 멈추면 눈금 띠에서 θ를 읽습니다. 처음 두 구가 닿았을 때의 각 θ₀ = ${f1(P.deg(P.THETA0))}°(구의 크기 때문)를 기준으로 비틀림각을 계산합니다.</p>
    ${nextBtn('3단계: 마이크로미터로 거리 줄이기', 3)}`;
  $('b1').onclick = async () => {
    if (!s.probeIn || S.busy) return;
    say(`덮개의 출입구로 <b>전기를 띤 봉랍 막대</b>를 넣어 탐침구에 가만히 대 봅니다.`);
    await S.playWand('rod', () => { P.chargeProbe(s, 1.0e-9); return 0; });
    chargeStage = Math.max(chargeStage, 1);
    say(`탐침구가 전기를 띠었습니다. 하지만 바늘 쪽 구는 아직 전기가 없어 <b>밀어낼 상대가 없습니다</b>. 다음으로 이 구를 바늘 쪽 구에 대어 전하를 나눠 주세요.`);
  };
  $('b2').onclick = () => {
    if (S.busy) return;
    if (s.qp < 0.05e-9) { toast('먼저 ①로 탐침구를 대전시키세요.'); return; }
    if (!P.shareCharge(s)) { toast('바늘이 탐침구에 닿아 있을 때만 전하를 나눌 수 있습니다.'); return; }
    S.flashBalls();
    chargeStage = 2; say(`두 구가 같은 전하를 나눠 가졌습니다. 보십시오, 바늘이 <b>밀려납니다</b>. 흔들림이 가라앉으면 눈금 띠에서 각을 읽으세요.`);
  };
  $('b3').onclick = () => { settleNow(); };
  $('b4').onclick = () => {
    if (recordRow()) {
      const r = rows[rows.length - 1];
      say(`기록했습니다. 두 구는 θ = <b>${f1(r.theta)}°</b>(거리 약 ${f1(r.r)} cm) 벌어져 있고, 마이크로미터를 돌리지 않았으니 도선이 비틀린 각 Θ는 ${f0(r.Theta)}°입니다.<br><br>
        <b>이 한 점만으로는 법칙을 알 수 없습니다.</b> 거리를 바꿔 가며 힘이 어떻게 변하는지 보아야 하지요. 다음 단계로 가서 마이크로미터를 돌려 구를 가까이 밀어 보세요.`);
    }
  };
}

/* ---------- 3. 거리 줄이기 ---------- */
function enterDistance() {
  if (!(s.qn > 0.2e-9 && s.probeIn)) ensureCharged(true);
  osc = null;
  say(`마이크로미터를 돌리면 도선의 윗끝이 비틀리면서 바늘을 <b>탐침구 쪽으로 되밀어</b> 줍니다. 두 구가 더 가까워질수록 밀어내는 힘이 커지니, 더 많이 비틀어야 버틸 수 있지요.<br><br>
    각 눈금에서 평형에 이르면 <b>전체 비틀림각 Θ = α + (θ − θ₀)</b>를 기록하세요. 이 Θ가 그 거리에서의 힘에 비례합니다. 최소 4~5점을 모아 봅시다.`);
}
function renderDistance() {
  bodyEl.innerHTML = `<h2>마이크로미터 돌리며 측정</h2>
    <label class="sl">마이크로미터 α <b id="vAlpha"></b></label>
    <input id="alpha" type="range" min="0" max="900" step="1" value="${Math.round(P.deg(s.alpha))}">
    <div class="row" id="alphaChips">${[0, 50, 120, 250, 450, 800].map(a => `<button class="chip" data-a="${a}">${a}°</button>`).join('')}</div>
    <div class="row"><button class="btn" id="b3">바로 안정</button><button class="btn primary" id="b4">θ 기록</button></div>
    <p>바늘이 흔들리는 동안에는 기록되지 않습니다. 시간이 오래 흐르면 전하가 조금씩 공기 중으로 새어 나가 θ가 줄어듭니다. 쿨롱도 같은 어려움을 겪었습니다.</p>
    <div id="rowCount" class="note"></div>
    ${nextBtn('4단계: 결과 분석', 4)}`;
  const inp = $('alpha');
  inp.oninput = () => { s.alpha = P.rad(+inp.value); paintAlpha(); };
  bodyEl.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { inp.value = b.dataset.a; inp.oninput(); });
  $('b3').onclick = settleNow;
  $('b4').onclick = () => {
    if (recordRow()) {
      const n = rows.filter(r => r.tag === 'q').length;
      if (n === 2) say(`두 번째 점입니다. 마이크로미터로 더 비틀었더니 구가 <b>가까워졌고</b>, 그만큼 더 큰 Θ가 필요했지요? 점을 더 모아 봅시다.`);
      if (n >= 4) say(`점이 충분히 모였습니다. 거리가 줄수록 Θ가 얼마나 빨리 커지는지 살펴볼 차례입니다. <b>4단계</b>로 넘어가 보십시오.`);
    }
    updateRowCount();
  };
  paintAlpha(); updateRowCount();
}
function paintAlpha() { const el = $('vAlpha'); if (el) el.textContent = f0(P.deg(s.alpha)) + '°'; }
function updateRowCount() { const el = $('rowCount'); if (el) el.textContent = `기록한 점: ${rows.filter(r => r.tag === 'q').length}개`; }

/* ---------- 4. 결과 분석 ---------- */
function enterAnalysis() {
  osc = null;
  const q = rows.filter(r => r.tag === 'q');
  if (q.length < 3) say(`아직 점이 ${q.length}개뿐입니다. 3단계로 돌아가 <b>서로 다른 거리에서 3점 이상</b> 모아 오세요. 점이 많을수록 믿을 만합니다.`);
  else say(analysisSpeech(q));
  if (innerWidth > 900) openData(true);
}
function fitQ() {
  const q = rows.filter(r => r.tag === 'q' && r.Theta > 0);
  if (q.length < 3) return null;
  return { q, fit:P.linfit(q.map(r => Math.log(r.r)), q.map(r => Math.log(r.Theta))) };
}
function analysisSpeech(q) {
  const F = fitQ(); if (!F) return '';
  const n = -F.fit.b, tr = q.map(r => r.Tr2), mean = tr.reduce((a, b) => a + b) / tr.length;
  const spread = (Math.max(...tr) - Math.min(...tr)) / mean * 100;
  return `거리 r과 비틀림각 Θ를 <b>로그 눈금</b>에 찍으면 직선이 되지요. 그 기울기가 곧 Θ ∝ r<sup>−n</sup>의 지수입니다.
    <span class="eq">Θ ∝ 1 / r<sup>${n.toFixed(2)}</sup></span>
    기울기는 <b>−${n.toFixed(2)}</b>로 −2에 가깝습니다. 표의 <b>Θ·r²</b>도 거의 일정하지요(변동 약 ${f0(spread)}%).<br><br>
    다만 −2와 조금 어긋나는 것은 ① 시간이 가며 전하가 새어 나가고 ② 구가 가까울수록 호와 현이 달라지며 ③ 눈금을 눈대중으로 읽은 탓입니다. 그래도 결론은 분명합니다. <b>두 전하 사이의 힘은 거리의 제곱에 반비례한다.</b>`;
}
function renderAnalysis() {
  const F = fitQ();
  bodyEl.innerHTML = `<h2>로그–로그 그래프로 지수 찾기</h2>
    <p>오른쪽 데이터 창의 그래프를 보세요. 점선은 기울기 −2(역제곱) 기준선입니다.</p>
    ${F ? `<div class="result ${Math.abs(F.fit.b + 2) < 0.25 ? '' : 'bad'}">기울기 = <b>${F.fit.b.toFixed(2)}</b> (R² = ${F.fit.r2.toFixed(3)})<br>→ F ∝ r<sup>${F.fit.b.toFixed(2)}</sup></div>` : '<div class="result bad">점이 3개 이상(서로 다른 거리) 필요합니다.</div>'}
    <div class="row"><button class="btn" id="refBtn">${showRef ? '기준선 숨기기' : '기준선 보이기'}</button></div>
    ${nextBtn('5단계: 전하의 크기를 바꿔 보기', 5)}`;
  $('refBtn').onclick = () => { showRef = !showRef; renderAnalysis(); refreshData(); };
}

/* ---------- 5. 전하량의 영향 ---------- */
const Q_TARGET = 18;
function enterQ() {
  s = P.createState(); P.chargeProbe(s, 1.0e-9); P.shareCharge(s); P.settle(s, 6); qTag = 'q'; osc = null;
  s.alpha = P.rad(0);
  say(`거리에 관한 법칙은 얻었으니, 이번에는 <b>전하의 크기</b>입니다. 탐침구에 <b>똑같은 크기의 전기가 없는 구</b>를 닿게 하면 전하가 반씩 나뉘어 탐침구의 전하가 <b>절반</b>이 됩니다.<br><br>
    힘이 전하에 비례한다면, 같은 거리에서 필요한 비틀림각도 <b>절반</b>이어야 하겠지요. 거리를 같게(θ ≈ ${Q_TARGET}°) 맞춰 두 번 재어 봅시다.`);
}
function renderQ() {
  bodyEl.innerHTML = `<h2>같은 거리에서 전하 비교 (목표 θ ≈ ${Q_TARGET}°)</h2>
    <label class="sl">마이크로미터 α <b id="vAlpha"></b></label>
    <input id="alpha" type="range" min="0" max="900" step="1" value="${Math.round(P.deg(s.alpha))}">
    <div class="row"><button class="btn" id="b3">바로 안정</button><button class="btn primary" id="b4">θ 기록 (현재 ${qTag === 'q' ? '전하 q' : '전하 q/2'})</button></div>
    <button class="btn" id="half">탐침구 전하를 절반으로 (같은 구와 접촉)</button>
    <div id="qOut"></div>
    <p>① 지금 전하로 θ가 ${Q_TARGET}° 근처(±1.5°)가 되게 α를 맞추고 기록 → ② 전하를 절반으로 줄이고 다시 θ를 ${Q_TARGET}°로 맞춰 기록.</p>
    ${nextBtn('7단계: 오차 토론', 6)}`;
  const inp = $('alpha');
  inp.oninput = () => { s.alpha = P.rad(+inp.value); paintAlpha(); };
  $('b3').onclick = settleNow;
  $('b4').onclick = () => {
    if (Math.abs(P.readAngle(s.theta) - Q_TARGET) > 1.5) { toast(`θ가 ${Q_TARGET}°(±1.5°)에서 벗어났습니다. α를 조절하세요.`); return; }
    if (recordRow()) renderQResult();
  };
  $('half').onclick = async () => {
    if (S.busy) return;
    say(`출입구로 <b>전기가 없는 똑같은 골심구</b>를 넣어 탐침구에 닿게 합니다.`);
    await S.playWand('ball', () => { const q0 = s.qp; P.halveProbeCharge(s); qTag = 'q/2'; return (q0 / 2) / 0.6e-9; });
    renderQ();
    say(`탐침구의 전하가 <b>절반</b>이 되었습니다. 같은 거리(θ ≈ ${Q_TARGET}°)에서 필요한 비틀림각이 어떻게 달라지는지 보세요. 마이크로미터를 줄여야 할 겁니다.`);
  };
  paintAlpha(); renderQResult(true);
}
function renderQResult(silent) {
  const A = [...rows].reverse().find(r => r.tag === 'q' && Math.abs(r.theta - Q_TARGET) <= 1.5);
  const B = [...rows].reverse().find(r => r.tag === 'q/2' && Math.abs(r.theta - Q_TARGET) <= 1.5);
  const el = $('qOut'); if (!el) return;
  if (!A) { el.innerHTML = ''; return; }
  if (!B) { el.innerHTML = `<div class="note">전하 q: θ=${f1(A.theta)}°, Θ=${f0(A.Theta)}° 기록됨. 이제 전하를 절반으로 줄이세요.</div>`; if (!silent) say(`전하 q일 때 Θ = <b>${f0(A.Theta)}°</b>를 얻었습니다. 이제 탐침구 전하를 절반으로 줄이고 같은 거리에서 다시 재 봅시다.`); return; }
  const ratio = B.Theta / A.Theta;
  el.innerHTML = `<div class="result">Θ(q) = ${f0(A.Theta)}°, Θ(q/2) = ${f0(B.Theta)}°<br>비 = <b>${ratio.toFixed(2)}</b> ≈ 1/2</div>`;
  if (!silent) say(`전하 하나를 절반으로 줄이니 힘이 <b>약 ${ratio.toFixed(2)}배</b>가 되었군요. 힘은 각 전하에 비례합니다.<br>
    거리 법칙과 합치면 이렇게 쓸 수 있지요.
    <span class="eq">F = k · q<sub>1</sub>q<sub>2</sub> / r²</span>
    이것이 훗날 <b>쿨롱의 법칙</b>이라 불리게 됩니다. 두 전하가 같은 부호이면 밀어내고(반발), 다른 부호이면 끌어당깁니다(인력). 수고 많으셨습니다!`);
}

/* ---------- 6. 오차 토론 ---------- */
const SCEN = [
  { id:'actual', label:'위 실험과 같은 조건', opt:{} },
  { id:'noleak', label:'전하 누설이 없다면', opt:{ leak:false } },
  { id:'notan',  label:'접선 성분 cos(θ/2)를 무시하면', opt:{ tangent:false } },
  { id:'fine',   label:'눈금을 정밀하게 읽었다면', opt:{ round:false } },
  { id:'ideal',  label:'세 가지 모두 이상적', opt:{ leak:false, tangent:false, round:false } },
];
let errWait = 10, errPick = 'ideal', overlay = null, errRes = {};
function errAlphas() {
  const q = rows.filter(r => r.tag === 'q'); const a = q.map(r => r.alpha);
  return a.length >= 3 ? a : [0, 50, 120, 250, 450, 800];
}
function runScenarios() {
  const al = errAlphas(); errRes = {};
  for (const sc of SCEN) errRes[sc.id] = P.replay(al, { ...sc.opt, wait:errWait });
  overlay = errRes[errPick]; saveForReport();
}
function errSpeech() {
  const base = errRes.actual.fit.b, eff = ['noleak', 'notan', 'fine'].map(id => ({ id, d: errRes[id].fit.b - base, label: SCEN.find(x => x.id === id).label }));
  eff.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  return `<b>측정이 완벽하지 않은 이유</b>를 하나씩 꺼 보며 따져 봅시다. 같은 α로 실험을 다시 돌렸을 때 기울기는 <b>${base.toFixed(2)}</b>이고, 모든 요인을 이상적으로 만들면 <b>${errRes.ideal.fit.b.toFixed(2)}</b>로 −2에 닿습니다.<br><br>
    기울기를 가장 많이 바꾸는 것은 「${eff[0].label}」(${eff[0].d >= 0 ? '+' : ''}${eff[0].d.toFixed(3)})입니다. ${eff.some(e => e.d > 0) && eff.some(e => e.d < 0) ? '요인마다 효과의 <b>방향이 다르다</b>는 점도 눈여겨보세요.' : '세 요인이 기울기를 같은 방향으로 밀고 있는지 확인해 보세요.'}<br><br>
    참고로 쿨롱의 결과를 두고 후대 역사학자들 사이에도 논쟁이 있습니다. 좋은 실험은 오차를 숨기지 않고 <b>따져 보는 데</b> 있습니다.`;
}
function enterErr() {
  osc = null; runScenarios(); openData(innerWidth > 900); say(errSpeech());
}
function renderErr() {
  const b0 = errRes.actual.fit.b;
  const mine = fitQ();
  const body = SCEN.map(sc => {
    const f = errRes[sc.id].fit;
    return `<tr><td><label><input type="radio" name="scn" value="${sc.id}" ${sc.id === errPick ? 'checked' : ''}> ${sc.label}</label></td><td>${f.b.toFixed(3)}</td><td>${(f.b + 2 >= 0 ? '+' : '') + (f.b + 2).toFixed(3)}</td></tr>`;
  }).join('');
  bodyEl.innerHTML = `<h2>왜 정확히 −2가 안 나올까?</h2>
    <p>${rows.some(r => r.tag === 'q') && errAlphas().length >= 3 ? '내가 측정한 α 값들로' : '표준 α 값(0~800°)으로'} 실험을 다시 돌려, 오차 요인을 하나씩 꺼 봅니다.</p>
    <table style="font-size:.8em"><tr><th style="text-align:left">조건</th><th>기울기</th><th>−2와의 차</th></tr>${body}</table>
    ${mine ? `<div class="note">내가 측정한 기울기: <b>${mine.fit.b.toFixed(3)}</b></div>` : ''}
    <label class="sl">측정 한 번에 걸리는 시간 <b id="vWait">${errWait} s</b></label>
    <input id="errWait" type="range" min="2" max="120" step="1" value="${errWait}">
    <p>시간이 길수록 전하가 더 새어 나갑니다(누설이 켜진 조건에서만 영향). 오른쪽 그래프의 속 빈 초록 점이 선택한 조건의 결과입니다.</p>
    <details><summary style="cursor:pointer;color:var(--accent);font-size:.88em">모델이 다루지 못한 요인 · 토론 질문</summary>
      <p><b>모델에 없는 것</b><br>• 유한한 크기의 도체 구: 가까워지면 표면 전하가 치우쳐 점전하 가정이 깨짐<br>• 공기의 습도·바늘 진동의 잔류·눈금 시차<br>• 구의 전하가 정확히 같지 않을 가능성</p>
      <p><b>생각해 볼 질문</b><br>1. 어떤 요인이 기울기를 가장 크게 바꾸는가? 그 이유는?<br>2. 측정을 빨리 끝내면 결과가 어떻게 달라지는가? (슬라이더)<br>3. 구가 가까울수록(θ가 작을수록) 상대 오차가 커지는 요인은?<br>4. 쿨롱이 36°→18°→8.5°의 점 3개만으로 역제곱을 주장한 것은 충분한가?</p>
    </details>
    <div class="row"><button class="btn" data-go="4">◀ 5단계로(분석)</button></div>
    <a class="btn primary" href="report.html" style="text-decoration:none;text-align:center">📝 측정값을 들고 보고서 쓰러 가기</a>`;
  bodyEl.querySelectorAll('input[name=scn]').forEach(r => r.onchange = () => { errPick = r.value; overlay = errRes[errPick]; refreshData(); });
  $('errWait').oninput = e => { errWait = +e.target.value; $('vWait').textContent = errWait + ' s'; runScenarios(); renderErr(); refreshData(); };
}

/* ---------- 보고서 연동: 측정값을 이 브라우저에만 저장(report.html이 읽음) ---------- */
function saveForReport() {
  try {
    const q = fitQ();
    const scen = {}; for (const sc of SCEN) if (errRes[sc.id]) scen[sc.id] = errRes[sc.id].fit.b;
    localStorage.setItem('coulomb-lab-v1', JSON.stringify({
      saved: Date.now(), rows, oscRows,
      I: P.I_NEEDLE, L: P.L, theta0: P.deg(P.THETA0),
      fit: q ? { b: q.fit.b, r2: q.fit.r2 } : null, scen
    }));
  } catch {}
}

/* ---------- 데이터 창(표 + 그래프) ---------- */
const dataEl = $('data'), dataBtn = $('dataBtn');
function openData(v) { dataEl.classList.toggle('open', v); dataBtn.classList.toggle('hide', v || !rows.length); }
dataBtn.onclick = () => openData(true); $('closeData').onclick = () => openData(false);
function refreshData() {
  saveForReport();
  if (!rows.length && !(step === 6 && overlay)) { $('dataBody').innerHTML = '<p class="note">아직 기록이 없습니다.</p>'; dataBtn.classList.add('hide'); return; }
  const body = rows.map((r, i) => `<tr class="${i === newestRow ? 'new' : ''}"><td>${i + 1}${r.tag === 'q/2' ? ' <small>(q/2)</small>' : ''}</td><td>${r.alpha}</td><td>${f1(r.theta)}</td><td>${f1(r.Theta)}</td><td>${r.r.toFixed(2)}</td><td>${f0(r.Tr2)}</td></tr>`).join('');
  $('dataBody').innerHTML = `<table><tr><th>#</th><th>α(°)</th><th>θ(°)</th><th>Θ(°)</th><th>r(cm)</th><th>Θ·r²</th></tr>${body}</table>
    <div class="note">Θ = α + (θ − θ₀), θ₀ = ${f1(P.deg(P.THETA0))}° · r = 2L·sin(θ/2), L = 10.5 cm · 눈금은 0.5° 단위로 읽음</div>
    <canvas id="plot" width="700" height="500"></canvas>`;
  drawPlot();
  if (!dataEl.classList.contains('open')) dataBtn.classList.remove('hide');
}
function drawPlot() {
  const cv = $('plot'); if (!cv) return; const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  const q = rows.filter(r => r.tag === 'q' && r.Theta > 0); const all = rows.filter(r => r.Theta > 0);
  const x0 = Math.log(0.7), x1 = Math.log(9), y0 = Math.log(10), y1 = Math.log(2500);
  const m = { l:92, r:18, t:14, b:68 };
  const X = r => m.l + (Math.log(r) - x0) / (x1 - x0) * (W - m.l - m.r), Y = t => H - m.b - (Math.log(t) - y0) / (y1 - y0) * (H - m.t - m.b);
  g.clearRect(0, 0, W, H); g.font = '22px sans-serif'; g.textAlign = 'center';
  g.strokeStyle = '#2d261d'; g.fillStyle = '#b9ab93'; g.lineWidth = 1;
  for (const v of [1, 2, 5]) { g.beginPath(); g.moveTo(X(v), m.t); g.lineTo(X(v), H - m.b); g.stroke(); g.fillText(v, X(v), H - m.b + 24); }
  g.textAlign = 'right';
  for (const v of [10, 30, 100, 300, 1000]) { g.beginPath(); g.moveTo(m.l, Y(v)); g.lineTo(W - m.r, Y(v)); g.stroke(); g.fillText(v, m.l - 8, Y(v) + 7); }
  g.textAlign = 'center'; g.fillText('거리 r (cm)  — 로그 눈금', (W + m.l) / 2, H - 12);
  g.save(); g.translate(24, (H - m.b) / 2); g.rotate(-Math.PI / 2); g.fillText('총 비틀림각 Θ (°)', 0, 0); g.restore();
  const F = fitQ();
  if (F) {
    const mx = F.q.reduce((a, r) => a + Math.log(r.r), 0) / F.q.length, my = F.q.reduce((a, r) => a + Math.log(r.Theta), 0) / F.q.length;
    if (showRef && step === 4) { g.setLineDash([8, 6]); g.strokeStyle = '#7fc98a'; g.lineWidth = 2; g.beginPath(); g.moveTo(X(Math.exp(x0)), Y(Math.exp(my - 2 * (x0 - mx)))); g.lineTo(X(Math.exp(x1)), Y(Math.exp(my - 2 * (x1 - mx)))); g.stroke(); g.setLineDash([]); }
    if (step === 4 || step === 6) { g.strokeStyle = '#d9a441'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(X(Math.exp(x0)), Y(Math.exp(F.fit.a + F.fit.b * x0))); g.lineTo(X(Math.exp(x1)), Y(Math.exp(F.fit.a + F.fit.b * x1))); g.stroke(); }
  }
  if (step === 6 && overlay) {
    const o = overlay.rows.filter(r => r.Theta > 0);
    g.strokeStyle = '#7fc98a'; g.lineWidth = 2; g.setLineDash([]); g.beginPath();
    g.moveTo(X(Math.exp(x0)), Y(Math.exp(overlay.fit.a + overlay.fit.b * x0))); g.lineTo(X(Math.exp(x1)), Y(Math.exp(overlay.fit.a + overlay.fit.b * x1))); g.stroke();
    for (const r of o) { g.beginPath(); g.arc(X(r.r), Y(r.Theta), 11, 0, 7); g.stroke(); }
    g.textAlign = 'right'; g.fillStyle = '#7fc98a'; g.fillText(`초록: 선택한 조건 기울기 ${overlay.fit.b.toFixed(3)}`, W - m.r - 10, m.t + 30);
  }
  for (const r of all) { g.fillStyle = r.tag === 'q' ? '#f1e6c9' : '#6bb7e8'; g.beginPath(); g.arc(X(r.r), Y(r.Theta), 7, 0, 7); g.fill(); }
  if (F && step >= 4 && step < 6) { g.textAlign = 'right'; g.fillStyle = '#d9a441'; g.fillText(`실선: 기울기 ${F.fit.b.toFixed(2)}`, W - m.r - 10, m.t + 30); if (showRef) { g.fillStyle = '#7fc98a'; g.fillText('점선: 기울기 −2', W - m.r - 10, m.t + 58); } }
}
$('copyCsv').onclick = async () => {
  const csv = ['번호,전하,alpha_deg,theta_deg,Theta_deg,r_cm,Theta_r2', ...rows.map((r, i) => [i + 1, r.tag, r.alpha, r.theta, r.Theta.toFixed(1), r.r.toFixed(2), r.Tr2.toFixed(0)].join(','))].join('\n');
  try { await navigator.clipboard.writeText(csv); toast('표를 복사했습니다(엑셀·시트에 붙여넣기).'); } catch { toast('복사가 막혀 있습니다.'); }
};

/* ---------- 실시간 읽기 값 ---------- */
function paintLive() {
  const th = P.readAngle(s.theta), Th = P.deg(s.alpha) + th - P.deg(P.THETA0);
  const stat = steady() ? '<span class="st-ok">안정</span>' : '<span class="st-move">움직이는 중</span>';
  $('live').innerHTML = `<span>마이크로미터 α</span><span>${f0(P.deg(s.alpha))}°</span><span>눈금 θ</span><span>${f1(th)}°</span>
    <span>총 비틀림 Θ</span><span>${f1(Th)}°</span><span>구 사이 거리 r</span><span>${f1(P.chord(P.rad(th)) * 100)} cm</span>
    <span>상태</span><span>${stat}</span><span>경과 시간</span><span>${f0(s.t)} s</span>`;
}

/* ---------- 메인 루프 ---------- */
S.onFrame(dt => {
  if (playing) P.step(s, dt * speed);
  S.setPose(s.theta, s.alpha); S.setProbe(s.probeIn); S.setCharges(s.qn, s.qp);
  trackOscillation(); updateTags(); paintLive();
});
$('speed').onchange = e => speed = +e.target.value;
$('reset').onclick = () => { rows = []; oscRows = []; newestRow = -1; saveForReport(); maxStep = 0; $('data').classList.remove('open'); goStep(0); };

/* ---------- 시험용 훅 ---------- */
window.__lab = { get s() { return s; }, P, goStep, track: trackOscillation, rows: () => rows, recordRow, settleNow, ensureCharged };

goStep(0);
