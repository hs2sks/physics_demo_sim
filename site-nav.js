// 상단 공통 바: 홈·허브 페이지 끝에 <script src="(상대경로)/site-nav.js"></script> 한 줄을 넣으면 붙는다.
// 메뉴를 바꾸려면 아래 ITEMS만 고친다.
(function () {
  var root = new URL('.', document.currentScript.src).pathname;
  var path = location.pathname;
  var rel = path.indexOf(root) === 0 ? path.slice(root.length) : path;
  var SIM = ['mechanics', 'electromagnetism', 'optics', 'modern-physics', 'thermodynamics', 'semiconductor', 'interdisciplinary', 'tools'];
  var top = rel.split('/')[0];
  var ITEMS = [
    { label: '홈', href: 'index.html', on: rel === '' || rel === 'index.html' },
    { label: '수업 자료', href: 'lectures/index.html', on: top === 'lectures' },
    { label: '모션그래픽', href: 'motion-graphic/index.html', on: top === 'motion-graphic' },
    { label: '진학·면접', href: 'interview/index.html', on: top === 'interview' },
    { label: '시뮬레이션', href: 'index.html#sims', on: SIM.indexOf(top) >= 0 },
    { label: '학생 작품', href: 'students/index.html', on: top === 'students' }
  ];
  var css = document.createElement('style');
  css.textContent =
    '#site-nav{position:fixed;top:0;left:0;right:0;z-index:50;height:48px;background:rgba(255,255,255,.96);border-bottom:1px solid #d7dee8;font-family:"Segoe UI","Malgun Gothic",sans-serif;font-size:15px;line-height:1.2}' +
    '#site-nav .in{max-width:1040px;height:100%;margin:0 auto;padding:0 12px;display:flex;align-items:center;gap:4px}' +
    '#site-nav .menu{display:flex;gap:2px;overflow-x:auto;flex:1;scrollbar-width:none;height:100%;align-items:center}' +
    '#site-nav .menu::-webkit-scrollbar{display:none}' +
    '#site-nav a{white-space:nowrap;text-decoration:none;color:#5a6b7d;padding:7px 12px;border-radius:8px}' +
    '#site-nav a:hover{color:#1f6fd6;background:#eef4fd}' +
    '#site-nav a.on{color:#1f6fd6;font-weight:700;background:#eef4fd}' +
    '#site-nav a:focus-visible{outline:2px solid #1f6fd6;outline-offset:1px}' +
    '#site-nav a.cta{background:#1f6fd6;color:#fff;font-weight:600;flex:none}' +
    '#site-nav a.cta:hover{background:#143f82;color:#fff}' +
    'section[id]{scroll-margin-top:64px}';
  document.head.appendChild(css);
  var nav = document.createElement('nav');
  nav.id = 'site-nav';
  nav.setAttribute('aria-label', '사이트 메뉴');
  nav.innerHTML = '<div class="in"><div class="menu">' + ITEMS.map(function (i) {
    return '<a href="' + root + i.href + '"' + (i.on ? ' class="on" aria-current="page"' : '') + '>' + i.label + '</a>';
  }).join('') + '</div><a class="cta" href="https://board.crazyray.uk/">과제 제출</a></div>';
  document.body.insertBefore(nav, document.body.firstChild);
  document.body.style.paddingTop = (parseFloat(getComputedStyle(document.body).paddingTop) + 48) + 'px';
})();
