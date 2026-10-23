/* ui.js — 화면 전환·조작 패널·미션·결과·탐구 노트·랭킹 창. 엔진(game.js)과는 hooks 로만 주고받는다. */
(function () {
  'use strict';
  const VD = window.VD, C = VD.C, SP = VD.sprites, R = VD.rank;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const UNLOCK = new URLSearchParams(location.search).has('unlock');     // 교사·시험용: 모든 스테이지 열고 미션 건너뛰기 허용
  let game, cur = null, mission = null, mstate = null, mDone = false;

  function show(id) { document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id)); window.scrollTo(0, 0); }
  function modal(html, sticky) { const c = $('modal-card'); c.innerHTML = html; if (sticky) c.dataset.sticky = '1'; else delete c.dataset.sticky; $('modal').classList.add('on'); $('modal').scrollTop = 0; }
  function closeModal() { $('modal').classList.remove('on'); delete $('modal-card').dataset.sticky; }
  $('modal').addEventListener('pointerdown', e => { if (e.target === $('modal') && !$('modal-card').dataset.sticky) closeModal(); });
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // ---------- 탐구 노트(이 기기에만 저장) ----------
  const Notes = {
    all() { return R.kv.get('vd.notes', {}); },
    get(id) { return this.all()[id] || null; },
    set(id, patch) { const a = this.all(); a[id] = Object.assign({}, a[id], patch); R.kv.put('vd.notes', a); return a[id]; },
    answered(id) { const n = this.get(id); return !!(n && n.why && n.why.choice != null); },
  };
  const tableHtml = t => !t ? '' : `<table class="cmp"><tr>${t.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr>${t.rows.map(r => `<tr>${r.map((c, i) => i ? `<td>${esc(c)}</td>` : `<th>${esc(c)}</th>`).join('')}</tr>`).join('')}</table>${t.foot ? `<p class="small">${esc(t.foot)}</p>` : ''}`;

  // ---------- 메뉴 ----------
  function drawMenuArt() {
    const g = $('menu-art').getContext('2d'); g.imageSmoothingEnabled = false;
    const sky = ['#7ec4ee', '#f0c088', '#8aa0b8', '#241450'], gr = ['#6fae4a', '#b8955a', '#6a7d5a', '#3a4560'];
    for (let e = 0; e < 4; e++) {
      g.fillStyle = sky[e]; g.fillRect(e * 48, 0, 48, 64); g.fillStyle = gr[e]; g.fillRect(e * 48, 56, 48, 8);
      g.drawImage(SP.village(e), e * 48, 56 - 26 + 1);
      const en = SP.make('boar', e, false, e > 0); g.drawImage(en, e * 48 + 31, 56 - en.height + 1);
    }
  }
  function renderMenu() {
    const pf = R.profile();
    if (pf) { $('in-nick').value = pf.nick; $('in-cls').value = pf.cls || ''; }
    $('net-status').textContent = '랭킹 서버 확인 중…';
    R.ping().then(r => { $('net-status').textContent = r.ok ? '🟢 랭킹 서버 연결됨' : '⚪ 랭킹 서버에 연결되지 않았어요. 기록은 이 기기에 저장되고, 연결되면 자동으로 올라가요.'; });
  }
  $('profile').addEventListener('submit', async e => {
    e.preventDefault();
    const nick = $('in-nick').value.trim(), cls = $('in-cls').value.trim(), err = $('form-err');
    err.textContent = '';
    if (!/^[0-9A-Za-z가-힣_\- ]{2,10}$/.test(nick)) { err.textContent = '닉네임은 2~10자의 한글·영문·숫자만 쓸 수 있어요.'; return; }
    if (/\d{4,}/.test(nick)) { err.textContent = '숫자가 너무 길어요. 학번·전화번호 같은 개인정보는 쓰지 마세요.'; return; }
    if (cls && !/^[0-9A-Za-z가-힣_\- ]{1,12}$/.test(cls)) { err.textContent = '반 코드는 한글·영문·숫자 12자까지예요.'; return; }
    R.setProfile(nick, cls);
    const r = await R.register();
    if (r.status === 409) { err.textContent = '이 반에 이미 같은 닉네임이 있어요. 다른 닉네임을 써 주세요.'; R.profile().registered = false; return; }
    if (r.status === 400) { err.textContent = r.msg || '닉네임을 다시 확인해 주세요.'; return; }
    renderStages(); show('scr-stages'); R.flush().then(refreshRankLine);
  });
  $('btn-help').onclick = () => modal(helpHtml());
  $('btn-rank-menu').onclick = () => openRanking();
  $('btn-menu').onclick = () => { renderMenu(); show('scr-menu'); };
  $('btn-rank').onclick = () => openRanking();
  $('btn-notes').onclick = () => openNotes();

  function helpHtml() {
    return `<h2>📖 이렇게 해요</h2>
    <p>🎯 <b>각도</b>와 <b>속력</b>을 정해 발사! 적이 마을에 닿기 전에 맞혀 쓰러뜨려요. 화면을 끌어서 조준할 수도 있어요.</p>
    <p>🔬 스테이지마다 <b>전투 전에 미션</b>이 있어요. 연습 단계에서는 적이 나오지 않고 탄도 줄지 않아요. 미션을 마치면 <b>⚔ 전투 시작</b>!</p>
    <p>📓 클리어하면 <b>탐구 노트</b>에 미션 때 쏜 기록이 자동으로 남아요. 데이터를 보고 "왜 그럴까?"에 답하면 다음 스테이지가 열려요. 노트는 이 기기에만 저장돼요.</p>
    <p>📏 바닥의 숫자는 대포에서의 거리(m), 오른쪽 끝 숫자는 높이(m)예요.</p>
    <p>⭐ 별: 마을을 지키면 1개, 마을이 한 번도 피해를 입지 않으면 +1개, 발사 횟수가 목표 이하면 +1개.</p>
    <p>🛡 갑옷 짐승은 ${C.ARMOR_DEG}° 이상으로 가파르게 내려꽂아야 피해를 줘요. 닉네임으로 랭킹에 올라가요(실명 금지).</p>
    <div class="modal-actions"><button class="btn" onclick="document.getElementById('modal').classList.remove('on')">닫기</button></div>`;
  }

  // ---------- 스테이지 선택 ----------
  function unlocked(i) {
    if (UNLOCK || i === 0) return true;
    const prev = VD.STAGES[i - 1].id;
    return !!R.progress()[prev] && Notes.answered(prev);
  }
  function renderStages() {
    const pf = R.profile(), prog = R.progress();
    $('who').textContent = pf ? pf.nick + (pf.cls ? ' · ' + pf.cls : '') : '';
    const t = R.totals(); $('sum-score').textContent = t.score + '점'; $('sum-stars').textContent = '★ ' + t.stars + ' / ' + VD.STAGES.length * 3;
    const box = $('worlds'); box.innerHTML = '';
    VD.WORLDS.forEach(w => {
      const el = document.createElement('div'); el.className = 'world w' + w.era;
      const cv = document.createElement('canvas'); cv.width = 48; cv.height = 48; const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
      g.fillStyle = ['#7ec4ee', '#f0c088', '#8aa0b8', '#241450'][w.era]; g.fillRect(0, 0, 48, 48); g.drawImage(SP.village(w.era), 0, 22);
      const head = document.createElement('div'); head.className = 'world-head'; head.appendChild(cv);
      head.insertAdjacentHTML('beforeend', `<div><h2>월드 ${w.id} · ${esc(w.name)}</h2><p>${esc(w.topic)} · ${esc(w.weapon)}</p></div>`);
      const grid = document.createElement('div'); grid.className = 'stage-grid';
      VD.STAGES.filter(s => s.world === w.id).forEach(s => {
        const i = VD.STAGES.indexOf(s), b = prog[s.id], open = unlocked(i);
        const btn = document.createElement('button'); btn.className = 'stbtn' + (open ? '' : ' locked');
        const noteTag = b ? (Notes.answered(s.id) ? '📓' : '✎ 노트') : '&nbsp;';
        btn.innerHTML = `<b>${s.id}</b><span class="nm">${esc(s.name)}</span><span class="st">${open ? '★'.repeat(b ? b.stars : 0) + '☆'.repeat(3 - (b ? b.stars : 0)) : '🔒'}</span><span class="sc">${b ? b.score + '점 · ' : ''}${noteTag}</span>`;
        if (open) btn.onclick = () => intro(s); grid.appendChild(btn);
      });
      el.appendChild(head); el.appendChild(grid); box.appendChild(el);
    });
    refreshRankLine();
  }
  function refreshRankLine() {
    const el = $('sum-rank'); if (!el) return;
    R.list('').then(r => {
      if (!r.ok) { el.textContent = R.pending() ? ' · 올라가지 못한 기록 ' + R.pending() + '건 (서버 연결 대기)' : ''; return; }
      el.textContent = r.me ? ' · 전체 ' + r.me.rank + '위' + (r.me.cls_rank ? ' · 우리 반 ' + r.me.cls_rank + '위' : '') : '';
    });
  }

  // ---------- 스테이지 소개 ----------
  function intro(stage) {
    const w = VD.WORLDS[stage.world - 1], first = stage.id.endsWith('-1'), m = VD.MISSIONS[stage.id], note = Notes.get(stage.id);
    const kinds = {}; stage.spawns.forEach(s => { const n = VD.ENEMY[s.type].name + (s.armor ? '(갑옷)' : ''); kinds[n] = (kinds[n] || 0) + 1; });
    const locks = (stage.lockAngle ? `각도 ${stage.lockAngle}° 고정 · ` : '') + (stage.lockSpeed ? `속력 ${stage.lockSpeed} m/s 고정 · ` : '');
    const needM = m && !(note && note.missionDone);
    modal(`<h2>${stage.id} · ${esc(stage.name)}</h2>
      ${first ? `<div class="qbox n"><b>${esc(w.name)}</b> — ${esc(w.story)}</div>` : ''}
      <p>${esc(stage.intro)}</p>
      ${needM ? `<div class="qbox">🎯 <b>먼저 미션: ${esc(m.title)}</b><br>전투 전에 연습 단계에서 미션을 해요. 적이 나오지 않고 탄도 줄지 않아요.</div>` : (m ? '<p class="small">🎯 이 스테이지의 미션은 이미 마쳤어요. 바로 전투!</p>' : '')}
      <p class="small">${locks}적: ${Object.entries(kinds).map(([k, v]) => k + ' ' + v).join(', ')} · ${esc(w.ammoName)} ${stage.ammo}발 · 목표 ${stage.par}발 이내(⭐)</p>
      <div class="modal-actions"><button class="btn" id="m-back">← 목록</button><button class="btn big" id="m-go">시작!</button></div>`);
    $('m-back').onclick = closeModal; $('m-go').onclick = () => { closeModal(); play(stage); };
  }

  // ---------- 플레이 ----------
  const heart = () => { const c = SP.make('heart', 0); const k = document.createElement('canvas'); k.width = c.width; k.height = c.height; k.getContext('2d').drawImage(c, 0, 0); return k; };
  function infoLine(s) {
    const e = s.env, parts = [`중력 g = <b>${e.g}</b> m/s²`];
    if (s.body) parts[0] = { moon: '달', mars: '화성', jupiter: '목성' }[s.body] + ' · ' + parts[0];
    if (e.k) parts.push('공기저항 <b>있음</b>');
    if (e.wind) parts.push(`바람 <b>${e.wind < 0 ? '← 맞바람' : '→ 뒷바람'} ${Math.abs(e.wind)}</b> m/s`);
    if (s.charge) parts.push(esc(s.charge.label) + ` · 입자 m = ${s.charge.m} kg, q = ±${s.charge.q} C`);
    if (s.preview.mode === 'vacuum') parts.push('흰 점선 = 공기저항 없는 이론 궤적');
    return parts.join(' · ') + '<span id="lastshot"></span>';
  }
  function play(stage) {
    cur = stage;
    const w = VD.WORLDS[stage.world - 1], m = VD.MISSIONS[stage.id], note = Notes.get(stage.id);
    const doMission = !!m && !(note && note.missionDone);
    show('scr-play');
    $('hud-name').textContent = stage.id + ' ' + stage.name;
    $('infoline').innerHTML = infoLine(stage);
    $('hintbox').classList.remove('on');
    $('btn-fire').textContent = ['던지기!', '쏘기!', '발사!', '발사!'][w.era];
    $('floats').innerHTML = ''; $('pausemask').classList.remove('on'); $('btn-pause').textContent = 'Ⅱ';
    const ra = $('rng-angle'), rs = $('rng-speed');
    ra.min = stage.angle.min; ra.max = stage.angle.max; rs.min = stage.v.min; rs.max = stage.v.max;
    $('ctl-angle').classList.toggle('locked', !!stage.lockAngle); $('ctl-speed').classList.toggle('locked', !!stage.lockSpeed);
    $('ctl-charge').classList.toggle('on', !!stage.charge);
    if (!game) game = new VD.Game($('cv'), hooks);
    game.start(stage, { mission: doMission ? m : null });
    syncAim(); setSign(1);
    $('battle').hidden = true;
    if (doMission) startMission(stage, m); else { mission = null; $('mission').hidden = true; }
  }

  // ---------- 미션(전투 전 연습 단계) ----------
  function startMission(stage, m) {
    mission = m; mstate = m.init(); mDone = false;
    const el = $('mission'); el.hidden = false; el.classList.remove('done', 'min');
    $('m-title').textContent = '🎯 미션 · ' + m.title; $('m-body').textContent = m.text; $('m-msg').textContent = '';
    setChips(0);
    game.setPaused(true);
    const pq = m.predict, opts = pq.options.map((t, i) => `<button class="btn why-opt" data-i="${i}">${esc(t)}</button>`).join('');
    modal(`<h2>🔮 먼저 예측해 보세요</h2><div class="qbox">${esc(pq.q)}</div><div>${opts}</div>
      <p class="small">정답은 지금 알려 주지 않아요. 미션을 하면서 직접 확인해요!</p>
      ${UNLOCK ? '<p class="small"><a href="#" id="m-skip">(교사용) 미션 건너뛰기</a></p>' : ''}`, true);
    document.querySelectorAll('#modal-card .why-opt').forEach(b => b.onclick = () => {
      Notes.set(stage.id, { prediction: +b.dataset.i, missionDone: false, data: null, why: null });
      closeModal(); game.setPaused(false);
    });
    if ($('m-skip')) $('m-skip').onclick = e => { e.preventDefault(); Notes.set(stage.id, { missionDone: true }); closeModal(); game.setPaused(false); toCombat(); };
  }
  function setChips(n) { $('m-chips').innerHTML = mission.steps.map((s, i) => `<span class="chip ${i < n ? 'on' : ''}">${i < n ? '✔' : '○'} ${esc(s)}</span>`).join(''); }
  function onMissionShot(r) {
    if (game.mShots === 1) $('mission').classList.add('min');
    const res = mission.feed(mstate, r);
    setChips(res.progress || 0); $('m-msg').textContent = res.msg || '';
    if (res.done) {
      mDone = true; Notes.set(cur.id, { missionDone: true, data: mission.table(mstate) });
      $('mission').classList.add('done'); $('mission').classList.add('min'); $('m-title').textContent = '✅ 미션 완료 · ' + mission.title;
      $('battle').hidden = false;
    } else if (game.mShots >= 6 && !$('hintbox').classList.contains('on')) { $('hintbox').textContent = '💡 ' + mission.hint; $('hintbox').classList.add('on'); }
  }
  function toCombat() {
    $('battle').hidden = true; $('mission').hidden = true; mission = null; $('floats').innerHTML = '';
    game.beginCombat(); $('hintbox').classList.remove('on');
  }
  $('battle').onclick = toCombat;
  $('mission').onclick = () => $('mission').classList.toggle('min');

  const hooks = {
    hud(g) {
      const hp = $('hud-hp'); hp.innerHTML = '';
      for (let i = 0; i < g.maxHp; i++) { const h = heart(); if (i >= g.hp) h.style.opacity = .22; hp.appendChild(h); }
      const mis = g.phase === 'mission';
      $('hud-ammo').textContent = VD.WORLDS[g.stage.world - 1].ammoName + ' ' + (mis ? '∞' : g.ammo);
      $('hud-kill').textContent = mis ? '🎯 연습 중' : '처치 ' + g.kills + '/' + g.total;
      $('btn-fire').disabled = (!mis && g.ammo <= 0) || g.over;
    },
    aim() { syncAim(); },
    float(text, x, y, cls) {
      const s = document.createElement('span'); s.className = 'fl ' + cls; s.textContent = text;
      s.style.left = Math.max(8, Math.min(92, x * C.PXM / C.CW * 100)) + '%'; s.style.top = Math.max(6, (C.GROUND_PX - y * C.PXM) / C.CH * 100) + '%';
      $('floats').appendChild(s); setTimeout(() => s.remove(), 1500);
    },
    shot(r) {
      const el = $('lastshot');
      if (el && r.how !== 'out') el.innerHTML = ` · <b>지난 발사</b> ${r.angle}°, ${r.speed} m/s${cur.charge ? (r.sign > 0 ? ', +' : ', −') : ''} → d = <b>${r.range.toFixed(1)}</b> m, ${r.time.toFixed(1)} s`;
      if (game.phase === 'mission' && mission && !mDone) onMissionShot(r);
    },
    end: res => onEnd(res),
  };
  function syncAim() {
    const a = game.aim;
    $('rng-angle').value = a.angle; $('rng-speed').value = a.speed;
    $('val-angle').textContent = a.angle + '°'; $('val-speed').textContent = a.speed + ' m/s';
  }
  function setSign(s) {
    game.setAim({ sign: s });
    $('btn-qpos').classList.toggle('sel', s > 0); $('btn-qneg').classList.toggle('sel', s < 0);
    $('val-charge').textContent = s > 0 ? '+' + (cur.charge ? cur.charge.q : 1) + ' C' : '−' + (cur.charge ? cur.charge.q : 1) + ' C';
  }
  $('rng-angle').oninput = e => { game.setAim({ angle: +e.target.value }); syncAim(); };
  $('rng-speed').oninput = e => { game.setAim({ speed: +e.target.value }); syncAim(); };
  document.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { const d = +b.dataset.d; game.setAim(b.dataset.k === 'angle' ? { angle: game.aim.angle + d } : { speed: game.aim.speed + d }); syncAim(); });
  $('btn-qpos').onclick = () => setSign(1); $('btn-qneg').onclick = () => setSign(-1);
  $('btn-hint').onclick = () => { $('hintbox').textContent = '💡 ' + (game.phase === 'mission' && mission ? mission.hint : cur.hint); $('hintbox').classList.toggle('on'); };
  const fire = () => game.fire();
  $('btn-fire').onclick = fire;
  function setPause(p) { game.setPaused(p); $('pausemask').classList.toggle('on', p); $('btn-pause').textContent = p ? '▶' : 'Ⅱ'; }
  $('btn-pause').onclick = () => setPause(!game.paused);
  $('btn-resume').onclick = () => setPause(false);
  $('btn-quit').onclick = () => { setPause(true); modal(`<h2>그만할까요?</h2><p>이 스테이지의 진행은 저장되지 않아요.</p><div class="modal-actions"><button class="btn" id="q-no">계속하기</button><button class="btn big" id="q-yes">목록으로</button></div>`);
    $('q-no').onclick = () => { closeModal(); setPause(false); }; $('q-yes').onclick = () => { closeModal(); game.stop(); renderStages(); show('scr-stages'); }; };
  document.addEventListener('keydown', e => {
    if (!$('scr-play').classList.contains('active') || /INPUT|TEXTAREA/.test((e.target.tagName || '')) && e.target.type !== 'range' || $('modal').classList.contains('on')) return;
    const k = e.key;
    if (k === ' ' || k === 'Enter') { e.preventDefault(); fire(); }
    else if (k === 'ArrowLeft') { game.setAim({ angle: game.aim.angle - 1 }); syncAim(); }
    else if (k === 'ArrowRight') { game.setAim({ angle: game.aim.angle + 1 }); syncAim(); }
    else if (k === 'ArrowDown') { e.preventDefault(); game.setAim({ speed: game.aim.speed - 1 }); syncAim(); }
    else if (k === 'ArrowUp') { e.preventDefault(); game.setAim({ speed: game.aim.speed + 1 }); syncAim(); }
    else if (k === 'p' || k === 'P') setPause(!game.paused);
  });

  // ---------- 결과 ----------
  let submitted = null;
  function onEnd(res) { submitted = null; renderResult(res); }
  function renderResult(res) {
    const s = cur, i = VD.STAGES.indexOf(s), next = VD.STAGES[i + 1];
    let html = '';
    if (!res.win) {
      html = `<h2>😢 마을이 무너졌어요</h2><p>${esc(s.name)} — 처치 ${res.kills}/${res.total}. 다시 도전해요!</p>
        <div class="qbox">💡 ${esc(s.hint)}</div>
        <div class="modal-actions"><button class="btn" id="r-list">목록</button><button class="btn big" id="r-again">다시 하기</button></div>`;
    } else {
      const best = R.saveBest(s.id, res.score, res.stars), ans = Notes.answered(s.id), ok = ans || UNLOCK || !VD.MISSIONS[s.id];
      const p = res.parts, row = (a, b) => b ? `<tr><td>${a}</td><td>+${b}</td></tr>` : '';
      html = `<h2>🎉 ${s.id} 클리어!</h2>
        <div class="stars">${'★'.repeat(res.stars)}<span class="off">${'★'.repeat(3 - res.stars)}</span></div>
        <p class="small" style="text-align:center">${res.stars >= 2 ? '' : '마을이 피해를 입었어요. '}발사 ${res.shots}회 (목표 ${res.par}회 이내면 ⭐)</p>
        <table class="brk"><tr><td>처치 (${res.kills}/${res.total})</td><td>+${p.kills}</td></tr>${row('마을 체력 보너스', p.hp)}${row('남은 ' + VD.WORLDS[s.world - 1].ammoName + ' 보너스', p.ammo)}
        <tr class="sum"><td>이번 점수</td><td>${res.score}</td></tr><tr><td>이 스테이지 최고</td><td>${best.score}</td></tr></table>
        <p class="small" id="res-rank">${submitted || '랭킹에 기록하는 중…'}</p>
        ${VD.MISSIONS[s.id] ? `<div class="qbox ${ans ? 'n' : ''}">📓 ${ans ? '탐구 노트를 썼어요!' : '<b>탐구 노트</b>에 미션 데이터가 기록돼 있어요. "왜 그럴까?"에 답하면 다음 스테이지가 열려요.'}</div>` : ''}
        <div class="modal-actions">${VD.MISSIONS[s.id] ? `<button class="btn ${ans ? '' : 'big'}" id="r-note">📓 ${ans ? '노트 보기' : '탐구 노트 쓰기'}</button>` : ''}<button class="btn" id="r-list">목록</button><button class="btn" id="r-again">다시 하기</button><button class="btn" id="r-rank">🏆 랭킹</button>${next ? `<button class="btn ${ok ? 'big' : ''}" id="r-next" ${ok ? '' : 'disabled'}>다음 ▶</button>` : ''}</div>`;
    }
    modal(html, true);
    const close = () => closeModal();
    $('r-list').onclick = () => { close(); renderStages(); show('scr-stages'); };
    $('r-again').onclick = () => { close(); play(s); };
    if (!res.win) return;
    if ($('r-next')) $('r-next').onclick = () => { close(); renderStages(); intro(next); };
    if ($('r-note')) $('r-note').onclick = () => openWhy(s, () => renderResult(res));
    $('r-rank').onclick = () => { close(); renderStages(); show('scr-stages'); openRanking(); };
    if (submitted === null) {
      submitted = '';
      R.submit(s.id, res.score, res.stars, res.shots).then(r => {
        submitted = r.ok ? (r.me ? '🏆 현재 전체 ' + r.me.rank + '위' + (r.me.cls_rank ? ' · 우리 반 ' + r.me.cls_rank + '위' : '') + ' (총 ' + r.me.total + '점)' : '랭킹에 기록했어요.')
          : '⚪ 랭킹 서버에 연결되지 않아 이 기기에만 저장했어요. 연결되면 자동으로 올라가요.';
        const el = $('res-rank'); if (el) el.textContent = submitted;
      });
    }
  }

  // ---------- 탐구 노트: "왜 그럴까?" ----------
  function openWhy(stage, after) {
    const m = VD.MISSIONS[stage.id]; if (!m) { after && after(); return; }
    const n = Notes.get(stage.id) || {}, pq = m.predict;
    const pr = n.prediction != null ? `<p class="small">처음 예측: <b>${esc(pq.options[n.prediction])}</b> — ${n.prediction === pq.correct ? '✓ 맞았어요' : '✗ 데이터와 비교해 보세요'}</p>` : '';
    const head = `<h2>📓 ${stage.id} ${esc(stage.name)}</h2><div class="qbox n">🎯 미션: ${esc(m.title)}</div>${tableHtml(n.data)}${pr}<div class="qbox">❓ ${esc(m.why.q)}</div>`;
    const done = () => { closeModal(); after && after(); };
    if (n.why && n.why.choice != null) {                       // 이미 쓴 노트: 다시 보기
      modal(head + `<p>내가 고른 답: <b>${esc(n.why.choice)}</b> ${n.why.ok ? '✓' : '✗'}</p>${n.why.text ? `<div class="qbox">✏ ${esc(n.why.text)}</div>` : ''}<div class="qbox n">📌 ${esc(m.why.explain)}</div><div class="modal-actions"><button class="btn big" id="w-close">닫기</button></div>`, true);
      $('w-close').onclick = done; return;
    }
    const opts = shuffle(m.why.options.map((t, i) => ({ t, ok: i === m.why.correct })));
    modal(head + `<div id="why-opts">${opts.map((o, i) => `<button class="btn why-opt" data-i="${i}">${esc(o.t)}</button>`).join('')}</div><div id="why-after"></div>`, true);
    document.querySelectorAll('#why-opts .why-opt').forEach(b => b.onclick = () => {
      const o = opts[+b.dataset.i]; document.querySelectorAll('#why-opts .why-opt').forEach(x => { x.disabled = true; x.classList.toggle('right', opts[+x.dataset.i].ok); if (x === b && !o.ok) x.classList.add('wrong'); });
      $('why-after').innerHTML = `<p style="margin-top:8px"><b>${o.ok ? '✓ 맞아요!' : '✗ 아쉬워요. 초록색이 알맞은 답이에요.'}</b></p><div class="qbox n">📌 ${esc(m.why.explain)}</div>
        <label class="small">내 말로 한 줄 정리 (선택)<textarea id="w-text" maxlength="120" rows="2" placeholder="예: 속력이 2배면 시간도 2배라서…"></textarea></label>
        <div class="modal-actions"><button class="btn big" id="w-save">저장하고 계속</button></div>`;
      $('w-save').onclick = () => { Notes.set(stage.id, { why: { choice: o.t, ok: o.ok, text: $('w-text').value.trim() } }); done(); };
    });
  }
  function openNotes() {
    const rows = VD.STAGES.map(s => { const n = Notes.get(s.id), m = VD.MISSIONS[s.id]; const st = n && n.why ? '📓 완료' : n && n.missionDone ? '✎ 노트 쓰기' : '—';
      return `<tr><td>${s.id}</td><td>${esc(m ? m.title : s.name)}</td><td>${st}</td><td>${n && (n.missionDone || n.why) ? `<button class="btn sm" data-s="${s.id}">열기</button>` : ''}</td></tr>`; }).join('');
    modal(`<h2>📓 내 탐구 노트</h2><p class="small">이 기기에만 저장돼요.</p><table class="rk"><tr><th>#</th><th>미션</th><th></th><th></th></tr>${rows}</table><div class="modal-actions"><button class="btn" id="n-close">닫기</button></div>`);
    $('n-close').onclick = closeModal;
    document.querySelectorAll('#modal-card [data-s]').forEach(b => b.onclick = () => { const st = VD.stageById(b.dataset.s); openWhy(st, openNotes); });
  }

  // ---------- 랭킹 ----------
  function openRanking() {
    const pf = R.profile(); let tab = 'all';
    const render = async () => {
      modal(`<h2>🏆 랭킹</h2><div class="rank-tabs"><button class="btn sm ${tab === 'all' ? 'on' : ''}" id="t-all">전체</button>${pf && pf.cls ? `<button class="btn sm ${tab === 'cls' ? 'on' : ''}" id="t-cls">우리 반 (${esc(pf.cls)})</button>` : ''}</div>
        <div id="rk-body" class="small">불러오는 중…</div><div class="modal-actions"><button class="btn" id="rk-close">닫기</button></div>`);
      $('rk-close').onclick = closeModal; $('t-all').onclick = () => { tab = 'all'; render(); }; if ($('t-cls')) $('t-cls').onclick = () => { tab = 'cls'; render(); };
      const r = await R.list(tab === 'cls' ? pf.cls : '');
      const body = $('rk-body'); if (!body) return;
      if (!r.ok) { body.textContent = '⚪ 랭킹 서버에 연결할 수 없어요. 잠시 뒤에 다시 열어 보세요.'; return; }
      if (!r.rows.length) { body.textContent = '아직 기록이 없어요. 첫 번째가 되어 보세요!'; return; }
      body.className = '';
      body.innerHTML = `<table class="rk"><tr><th>#</th><th>닉네임</th><th>★</th><th>점수</th></tr>${r.rows.map((x, i) =>
        `<tr class="${x.me ? 'me' : ''}"><td>${i + 1}</td><td>${esc(x.nick)}${x.cls && tab === 'all' ? ` <small>${esc(x.cls)}</small>` : ''}</td><td>${x.stars}</td><td>${x.total}</td></tr>`).join('')}</table>` +
        (r.me && !r.rows.some(x => x.me) ? `<p class="small" style="margin-top:8px">내 순위: ${tab === 'cls' ? r.me.cls_rank : r.me.rank}위 · ${r.me.total}점</p>` : '');
    };
    render();
  }

  // ---------- 시작 ----------
  drawMenuArt(); renderMenu();
  window.__vd = { get game() { return game; }, play, intro, renderStages, show, Notes, openWhy, get mission() { return mission; }, get mstate() { return mstate; } };   // 시험용
})();
