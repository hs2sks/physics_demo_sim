/* ui.js — 화면 전환·조작 패널·결과/랭킹 창. 엔진(game.js)과는 hooks 로만 주고받는다. */
(function () {
  'use strict';
  const VD = window.VD, C = VD.C, SP = VD.sprites, R = VD.rank;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const UNLOCK = new URLSearchParams(location.search).has('unlock');     // 교사·시험용: 모든 스테이지 열기
  let game, cur = null;

  function show(id) { document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id)); window.scrollTo(0, 0); }
  function modal(html) { $('modal-card').innerHTML = html; $('modal').classList.add('on'); $('modal').scrollTop = 0; }
  function closeModal() { $('modal').classList.remove('on'); }
  $('modal').addEventListener('pointerdown', e => { if (e.target === $('modal') && !$('modal-card').dataset.sticky) closeModal(); });

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

  function helpHtml() {
    return `<h2>📖 이렇게 해요</h2>
    <p>🎯 <b>각도</b>와 <b>속력</b>을 정해 발사! 적이 마을에 닿기 전에 맞혀 쓰러뜨려요. 화면을 끌어서 조준할 수도 있어요.</p>
    <p>📏 바닥의 숫자는 대포에서의 거리(m), 오른쪽 끝 숫자는 높이(m)예요. 계산에 쓰세요.</p>
    <p>🔮 발사 전에 <b>예상 사거리</b>를 적으면 오차가 작을수록 보너스 점수(최대 +60)!</p>
    <p>⭐ 별: 마을을 지키면 1개, 마을이 한 번도 피해를 입지 않으면 +1개, 발사 횟수가 목표 이하면 +1개.</p>
    <p>🛡 갑옷 짐승은 ${C.ARMOR_DEG}° 이상으로 가파르게 내려꽂아야 피해를 줘요.</p>
    <p>⏸ 일시정지하고 천천히 계산해도 돼요. 닉네임으로 랭킹에 올라가요(실명 금지).</p>
    <div class="modal-actions"><button class="btn" onclick="document.getElementById('modal').classList.remove('on')">닫기</button></div>`;
  }

  // ---------- 스테이지 선택 ----------
  function unlocked(i) {
    if (UNLOCK || i === 0) return true;
    return !!R.progress()[VD.STAGES[i - 1].id];
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
        btn.innerHTML = `<b>${s.id}</b><span class="nm">${esc(s.name)}</span><span class="st">${open ? '★'.repeat(b ? b.stars : 0) + '☆'.repeat(3 - (b ? b.stars : 0)) : '🔒'}</span><span class="sc">${b ? b.score + '점' : '&nbsp;'}</span>`;
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
    const w = VD.WORLDS[stage.world - 1], first = stage.id.endsWith('-1');
    const kinds = {}; stage.spawns.forEach(s => { const n = VD.ENEMY[s.type].name + (s.armor ? '(갑옷)' : ''); kinds[n] = (kinds[n] || 0) + 1; });
    const locks = (stage.lockAngle ? `각도 ${stage.lockAngle}° 고정 · ` : '') + (stage.lockSpeed ? `속력 ${stage.lockSpeed} m/s 고정 · ` : '');
    modal(`<h2>${stage.id} · ${esc(stage.name)}</h2>
      ${first ? `<div class="qbox n"><b>${esc(w.name)}</b> — ${esc(w.story)}</div>` : ''}
      <p>${esc(stage.intro)}</p>
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
    const w = VD.WORLDS[stage.world - 1];
    show('scr-play');
    $('hud-name').textContent = stage.id + ' ' + stage.name;
    $('infoline').innerHTML = infoLine(stage);
    $('hintbox').classList.remove('on'); $('hintbox').textContent = '💡 ' + stage.hint;
    $('btn-fire').textContent = ['던지기!', '쏘기!', '발사!', '발사!'][w.era];
    $('floats').innerHTML = ''; $('pausemask').classList.remove('on'); $('in-pred').value = '';
    const ra = $('rng-angle'), rs = $('rng-speed');
    ra.min = stage.angle.min; ra.max = stage.angle.max; rs.min = stage.v.min; rs.max = stage.v.max;
    $('ctl-angle').classList.toggle('locked', !!stage.lockAngle); $('ctl-speed').classList.toggle('locked', !!stage.lockSpeed);
    $('ctl-charge').classList.toggle('on', !!stage.charge);
    if (!game) game = new VD.Game($('cv'), hooks);
    game.start(stage);
    syncAim();
    setSign(1);
  }
  const hooks = {
    hud(g) {
      const hp = $('hud-hp'); hp.innerHTML = '';
      for (let i = 0; i < g.maxHp; i++) { const h = heart(); if (i >= g.hp) h.style.opacity = .22; hp.appendChild(h); }
      $('hud-ammo').textContent = VD.WORLDS[g.stage.world - 1].ammoName + ' ' + g.ammo;
      $('hud-kill').textContent = '처치 ' + g.kills + '/' + g.total;
      $('btn-fire').disabled = g.ammo <= 0 || g.over;
    },
    aim() { syncAim(); },
    float(text, x, y, cls) {
      const s = document.createElement('span'); s.className = 'fl ' + cls; s.textContent = text;
      s.style.left = Math.max(8, Math.min(92, x * C.PXM / C.CW * 100)) + '%'; s.style.top = Math.max(6, (C.GROUND_PX - y * C.PXM) / C.CH * 100) + '%';
      $('floats').appendChild(s); setTimeout(() => s.remove(), 1500);
    },
    shot(r) {
      const el = $('lastshot'); if (!el || r.how === 'out') return;
      el.innerHTML = ` · <b>지난 발사</b> ${r.angle}°, ${r.speed} m/s${cur.charge ? (r.sign > 0 ? ', +' : ', −') : ''} → d = <b>${r.range.toFixed(1)}</b> m, ${r.time.toFixed(1)} s`;
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
  $('btn-hint').onclick = () => $('hintbox').classList.toggle('on');
  function fire() { const v = parseFloat($('in-pred').value); if (game.fire(v)) $('in-pred').value = ''; }
  $('btn-fire').onclick = fire;
  function setPause(p) { game.setPaused(p); $('pausemask').classList.toggle('on', p); $('btn-pause').textContent = p ? '▶' : 'Ⅱ'; }
  $('btn-pause').onclick = () => setPause(!game.paused);
  $('btn-resume').onclick = () => setPause(false);
  $('btn-quit').onclick = () => { setPause(true); modal(`<h2>그만할까요?</h2><p>이 스테이지의 진행은 저장되지 않아요.</p><div class="modal-actions"><button class="btn" id="q-no">계속하기</button><button class="btn big" id="q-yes">목록으로</button></div>`);
    $('q-no').onclick = () => { closeModal(); setPause(false); }; $('q-yes').onclick = () => { closeModal(); game.stop(); renderStages(); show('scr-stages'); }; };
  document.addEventListener('keydown', e => {
    if (!$('scr-play').classList.contains('active') || /INPUT|TEXTAREA/.test((e.target.tagName || '')) && e.target.type !== 'range') return;
    const k = e.key;
    if (k === ' ' || k === 'Enter') { e.preventDefault(); fire(); }
    else if (k === 'ArrowLeft') { game.setAim({ angle: game.aim.angle - 1 }); syncAim(); }
    else if (k === 'ArrowRight') { game.setAim({ angle: game.aim.angle + 1 }); syncAim(); }
    else if (k === 'ArrowDown') { e.preventDefault(); game.setAim({ speed: game.aim.speed - 1 }); syncAim(); }
    else if (k === 'ArrowUp') { e.preventDefault(); game.setAim({ speed: game.aim.speed + 1 }); syncAim(); }
    else if (k === 'p' || k === 'P') setPause(!game.paused);
  });

  // ---------- 결과 ----------
  function onEnd(res) {
    const s = cur, i = VD.STAGES.indexOf(s), next = VD.STAGES[i + 1];
    let html = '';
    if (!res.win) {
      html = `<h2>😢 마을이 무너졌어요</h2><p>${esc(s.name)} — 처치 ${res.kills}/${res.total}. 다시 도전해요!</p>
        <div class="qbox">💡 ${esc(s.hint)}</div>
        <div class="modal-actions"><button class="btn" id="r-list">목록</button><button class="btn big" id="r-again">다시 하기</button></div>`;
    } else {
      const best = R.saveBest(s.id, res.score, res.stars);
      const p = res.parts, row = (a, b) => b ? `<tr><td>${a}</td><td>+${b}</td></tr>` : '';
      html = `<h2>🎉 ${s.id} 클리어!</h2>
        <div class="stars">${'★'.repeat(res.stars)}<span class="off">${'★'.repeat(3 - res.stars)}</span></div>
        <p class="small" style="text-align:center">${res.stars >= 2 ? '' : '마을이 피해를 입었어요. '}발사 ${res.shots}회 (목표 ${res.par}회 이내면 ⭐)</p>
        <table class="brk"><tr><td>처치 (${res.kills}/${res.total})</td><td>+${p.kills}</td></tr>${row('예측 보너스', p.pred)}${row('마을 체력 보너스', p.hp)}${row('남은 ' + VD.WORLDS[s.world - 1].ammoName + ' 보너스', p.ammo)}
        <tr class="sum"><td>이번 점수</td><td>${res.score}</td></tr><tr><td>이 스테이지 최고</td><td>${best.score}</td></tr></table>
        <p class="small" id="res-rank">랭킹에 기록하는 중…</p>
        ${compareHtml(res.last)}
        <div class="qbox">❓ ${esc(s.ask)}</div><div class="qbox n">📌 ${esc(s.note)}</div>
        <div class="modal-actions"><button class="btn" id="r-list">목록</button><button class="btn" id="r-again">다시 하기</button><button class="btn" id="r-rank">🏆 랭킹</button>${next ? '<button class="btn big" id="r-next">다음 ▶</button>' : ''}</div>`;
    }
    modal(html); $('modal-card').dataset.sticky = '1';
    const close = () => { delete $('modal-card').dataset.sticky; closeModal(); };
    $('r-list').onclick = () => { close(); renderStages(); show('scr-stages'); };
    $('r-again').onclick = () => { close(); play(s); };
    if (res.win) {
      if ($('r-next')) $('r-next').onclick = () => { close(); renderStages(); intro(next); };
      $('r-rank').onclick = () => { close(); renderStages(); show('scr-stages'); openRanking(); };
      R.submit(s.id, res.score, res.stars, res.shots).then(r => {
        const el = $('res-rank'); if (!el) return;
        el.textContent = r.ok ? (r.me ? '🏆 현재 전체 ' + r.me.rank + '위' + (r.me.cls_rank ? ' · 우리 반 ' + r.me.cls_rank + '위' : '') + ' (총 ' + r.me.total + '점)' : '랭킹에 기록했어요.')
          : '⚪ 랭킹 서버에 연결되지 않아 이 기기에만 저장했어요. 연결되면 자동으로 올라가요.';
      });
    }
  }
  function compareHtml(lg) {
    if (!lg) return '';
    const th = game.theory(lg); if (!th) return '';
    const f = (x, u) => x.toFixed(1) + u;
    const label = th.exact ? '이론값(식으로 계산)' : '진공 기준 값(공기저항·바람·전기장 무시)';
    return `<p class="small" style="margin-top:8px">🔬 마지막으로 땅에 떨어진 발사: ${lg.angle}°, ${lg.speed} m/s${cur.charge ? (lg.sign > 0 ? ', + 입자' : ', − 입자') : ''}</p>
      <table class="cmp"><tr><th></th><th>${label}</th><th>실제</th></tr>
      <tr><th>사거리 d</th><td>${f(th.range, ' m')}</td><td>${f(lg.range, ' m')}</td></tr>
      <tr><th>비행 시간</th><td>${f(th.time, ' s')}</td><td>${f(lg.time, ' s')}</td></tr>
      <tr><th>최고점 높이</th><td>${f(th.apex, ' m')}</td><td>${f(lg.apex, ' m')}</td></tr></table>
      <p class="small">${th.exact ? '식과 실제가 거의 같으면 계산이 맞은 거예요. 다르면 어떤 조건을 빼먹었는지 생각해 보세요.' : '이론값과 다르다면, 그 차이를 만든 것이 무엇인지 적어 보세요.'}</p>`;
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
      body.className = ''; const mine = pf ? pf.nick : null;
      body.innerHTML = `<table class="rk"><tr><th>#</th><th>닉네임</th><th>★</th><th>점수</th></tr>${r.rows.map((x, i) =>
        `<tr class="${x.me ? 'me' : ''}"><td>${i + 1}</td><td>${esc(x.nick)}${x.cls && tab === 'all' ? ` <small>${esc(x.cls)}</small>` : ''}</td><td>${x.stars}</td><td>${x.total}</td></tr>`).join('')}</table>` +
        (r.me && !r.rows.some(x => x.me) ? `<p class="small" style="margin-top:8px">내 순위: ${tab === 'cls' ? r.me.cls_rank : r.me.rank}위 · ${r.me.total}점</p>` : '');
    };
    render();
  }

  // ---------- 시작 ----------
  drawMenuArt(); renderMenu();
  window.__vd = { get game() { return game; }, play, intro, renderStages, show };   // 시험용
})();
