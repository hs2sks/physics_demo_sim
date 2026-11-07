/* 허브 공통: 단원 태그·단원 필터·관련 수업 자료 (2026-11-07). 데이터: ../sim-meta.json (경로→{u 단원, kw 관련 키워드}) */
(function () {
  var hub = location.pathname.replace(/\/index\.html$/, '').split('/').filter(Boolean).pop();
  function J(u) { return fetch(u).then(function (r) { return r.json(); }); }
  function list(j) { return Array.isArray(j) ? j : (j && j.items) || []; }
  Promise.all([J('../sim-meta.json'), J('../lectures/index.json'), J('../motion-graphic/index.json')]).then(function (a) {
    var meta = a[0], mats = [];
    list(a[1]).forEach(function (d) { mats.push({ k: '수업 자료', t: d.title, u: d.subject + ' · ' + d.unit, href: '../lectures/' + d.path, hay: (d.title + ' ' + (d.desc || '') + ' ' + (d.tags || []).join(' ')).toLowerCase() }); });
    list(a[2]).forEach(function (d) { if (d.subject === '진학 면접') return; mats.push({ k: '모션그래픽', t: d.title, u: d.subject + ' · ' + d.unit, href: '../motion-graphic/' + d.path, hay: (d.title + ' ' + (d.desc || '') + ' ' + (d.tags || []).join(' ')).toLowerCase() }); });
    var cards = [].slice.call(document.querySelectorAll('a.card')), units = [], items = [];
    cards.forEach(function (c) {
      var key = hub + '/' + (c.getAttribute('href') || '').replace(/\/index\.html$/, ''), m = meta[key];
      if (!m) return;
      var t = c.querySelector('.title'), el = document.createElement('div'); el.className = 'unit'; el.textContent = m.u;
      if (t) t.parentNode.insertBefore(el, t);
      if (units.indexOf(m.u) < 0) units.push(m.u);
      items.push({ c: c, m: m });
    });
    var wrap = document.querySelector('.wrap'), cur = '';
    if (units.length > 1) {
      var bar = document.createElement('div'); bar.className = 'unitbar';
      bar.innerHTML = '<b>단원으로 보기</b>' + ['전체'].concat(units).map(function (u, i) { return '<button data-u="' + (i ? u : '') + '"' + (i ? '' : ' class="on"') + '>' + u + '</button>'; }).join('');
      var hd = document.querySelector('.wrap > header') || document.querySelector('header'); hd.parentNode.insertBefore(bar, hd.nextSibling);
      bar.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; cur = b.dataset.u; [].forEach.call(bar.querySelectorAll('button'), function (x) { x.classList.toggle('on', x === b); }); apply(); });
    }
    var rel = document.createElement('section'); rel.className = 'related'; wrap.appendChild(rel);
    function apply() {
      items.forEach(function (i) { i.c.style.display = (!cur || i.m.u === cur) ? '' : 'none'; });
      [].forEach.call(document.querySelectorAll('.wrap > .grid'), function (g) {
        var any = [].some.call(g.querySelectorAll('a.card'), function (c) { return c.style.display !== 'none'; });
        g.style.display = any ? '' : 'none'; var h = g.previousElementSibling; if (h && h.tagName === 'H2') h.style.display = any ? '' : 'none';
      });
      var seen = {}, out = [];
      items.forEach(function (i) {
        if (cur && i.m.u !== cur) return;
        (i.m.kw || []).forEach(function (w) { var q = w.toLowerCase(); mats.forEach(function (d) { if (d.hay.indexOf(q) >= 0 && !seen[d.href]) { seen[d.href] = 1; out.push(d); } }); });
      });
      rel.innerHTML = out.length ? '<h2>🔗 이 분야와 관련된 수업 자료 · 모션그래픽</h2><ul>' + out.slice(0, 14).map(function (d) { return '<li><a href="' + d.href + '"><span class="rk">' + d.k + '</span> ' + d.t.replace(/</g, '&lt;') + '</a> <small>' + d.u + '</small></li>'; }).join('') + '</ul>' + (out.length > 14 ? '<p class="more">… 외 ' + (out.length - 14) + '개 — <a href="../lectures/index.html">수업 자료에서 검색</a></p>' : '') : '';
    }
    apply();
  }).catch(function () { });
})();
