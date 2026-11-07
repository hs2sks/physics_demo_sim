/* 상대성 이론 시뮬 2종 공통 스크립트: 탭, 단계 안내(말풍선+확인 문제), 오개념 ○/✕ */
const $ = id => document.getElementById(id);
const RelUI = {
  tabs(onShow) {
    const btns = [...document.querySelectorAll('nav.tabs button')];
    const show = id => {
      btns.forEach(b => b.classList.toggle('active', b.dataset.tab === id));
      document.querySelectorAll('.pane').forEach(p => p.classList.toggle('active', p.id === 'pane-' + id));
      window.scrollTo({ top: 0 });
      if (onShow) onShow(id);
    };
    btns.forEach(b => b.onclick = () => show(b.dataset.tab));
    return show;
  },
  guide({ steps, sci, onApply }) {
    let cur = 0; const done = new Set();
    const render = () => {
      const st = steps[cur], sc = sci[st.sci];
      $('gTitle').textContent = `${cur + 1} / ${steps.length} · ${st.title}`;
      $('gDots').innerHTML = steps.map((_, i) => `<i class="${i === cur ? 'on' : done.has(i) ? 'done' : ''}" data-i="${i}"></i>`).join('');
      $('gDots').querySelectorAll('i').forEach(d => d.onclick = () => { cur = +d.dataset.i; render(); });
      $('gAvatar').textContent = sc.face;
      $('gWho').textContent = sc.name;
      $('gText').innerHTML = st.text;
      $('gTask').innerHTML = st.task;
      $('gApply').hidden = !st.apply;
      if (st.apply) $('gApply').textContent = '▶ ' + st.apply.label;
      const q = st.quiz, qz = $('gQuiz');
      qz.innerHTML = `<h4>✅ 확인 문제</h4><div>${q.q}</div>` + q.opts.map((o, i) => `<button class="opt" data-i="${i}">${o}</button>`).join('') + '<div class="why"></div>';
      qz.querySelectorAll('.opt').forEach(b => b.onclick = () => {
        const ok = +b.dataset.i === q.ans;
        qz.querySelectorAll('.opt').forEach(x => x.classList.remove('right', 'wrong'));
        b.classList.add(ok ? 'right' : 'wrong');
        qz.querySelector('.why').innerHTML = (ok ? '⭕ 맞아요. ' : '❌ 다시 생각해 봐요. ') + q.why;
        if (ok) done.add(cur);
      });
      $('gPrev').disabled = cur === 0;
      $('gNext').hidden = cur === steps.length - 1;
      $('gLast').hidden = cur !== steps.length - 1;
    };
    $('gPrev').onclick = () => { cur--; render(); };
    $('gNext').onclick = () => { done.add(cur); cur++; render(); };
    $('gApply').onclick = () => onApply(steps[cur].apply);
    render();
  },
  myths(list, host) {
    $(host).innerHTML = list.map((m, i) => `<div class="myth" id="myth${i}"><div class="claim">“${m.claim}”</div>
      <div class="btns"><button data-v="1">⭕ 맞다</button><button data-v="0">❌ 틀리다</button></div>
      <div class="ans"><span class="tag ${m.ok ? 'o' : 'x'}">${m.ok ? '맞음' : '틀림'}</span>${m.why}</div></div>`).join('');
    list.forEach((m, i) => {
      const el = $('myth' + i);
      el.querySelectorAll('button').forEach(b => b.onclick = () => {
        el.classList.add('shown');
        const right = (+b.dataset.v === 1) === m.ok;
        el.querySelector('.ans').insertAdjacentHTML('afterbegin', right ? '🎯 ' : '🔁 ');
        el.querySelector('.btns').remove();
      });
    });
  }
};
