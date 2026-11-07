/* 광학 시뮬 공통 모듈 — 과학자 안내·사용 방법·미션·실제 사진 비교 (의존성 없음) */
(function (global) {
  "use strict";
  var BASE = new URL("../assets/", document.currentScript ? document.currentScript.src : location.href).href;

  var PEOPLE = {
    young:    { name: "토머스 영",       years: "1773–1829", role: "영국의 의사·물리학자",   img: "people/young.jpg" },
    newton:   { name: "아이작 뉴턴",     years: "1643–1727", role: "영국의 물리학자",        img: "people/newton.jpg" },
    michelson:{ name: "앨버트 마이컬슨", years: "1852–1931", role: "미국의 물리학자",        img: "people/michelson.jpg" },
    morley:   { name: "에드워드 몰리",   years: "1838–1923", role: "미국의 화학자",          img: "people/morley.jpg" },
    galileo:  { name: "갈릴레오 갈릴레이", years: "1564–1642", role: "이탈리아의 과학자",    img: "people/galileo.jpg" },
    romer:    { name: "올레 뢰머",       years: "1644–1710", role: "덴마크의 천문학자",      img: "people/romer.jpg" },
    fizeau:   { name: "이폴리트 피조",   years: "1819–1896", role: "프랑스의 물리학자",      img: "people/fizeau.jpg" },
    foucault: { name: "레옹 푸코",       years: "1819–1868", role: "프랑스의 물리학자",      img: "people/foucault.jpg" }
  };
  var CREDITS = {
    "people/young": "초상: H. P. Briggs 작 〈Thomas Young〉(Wikimedia Commons, CC BY-SA 4.0)",
    "people/newton": "초상: G. Kneller 작 〈Isaac Newton〉 1689 (Wikimedia Commons, 퍼블릭 도메인)",
    "people/michelson": "사진: 앨버트 마이컬슨 (Wikimedia Commons, 퍼블릭 도메인)",
    "people/morley": "사진: 에드워드 몰리 1885 (DPLA·Wikimedia Commons, 퍼블릭 도메인)",
    "people/galileo": "초상: J. Sustermans 작 〈Galileo Galilei〉 1636 (Wikimedia Commons, 퍼블릭 도메인)",
    "people/romer": "초상: J. Coning 작 〈Ole Rømer〉 (Wikimedia Commons, 퍼블릭 도메인)",
    "people/fizeau": "사진: E. Pirou 촬영 〈Hippolyte Fizeau〉 (Wikimedia Commons, 퍼블릭 도메인)",
    "people/foucault": "사진: 레옹 푸코 (Wikimedia Commons, 퍼블릭 도메인)",
    "photos/ripple-tank": "사진: Psgs123xyz, 물결 수조의 두 파원 간섭 (Wikimedia Commons, CC0)",
    "photos/newton-rings-laser": "사진: Robert D. Anderson, 650 nm 적색 레이저의 뉴턴 링 (Wikimedia Commons, CC BY-SA 3.0)",
    "photos/michelson-fringe": "사진: Warren Leywon, 마이컬슨 간섭계의 간섭무늬 (Wikimedia Commons, CC BY-SA 4.0)",
    "photos/michelson-interferometer": "사진: Underwood & Underwood, 간섭계를 들여다보는 마이컬슨 (Wikimedia Commons, 퍼블릭 도메인)",
    "photos/foucault-apparatus": "그림: Brews ohare, 푸코의 회전거울 장치 (Wikimedia Commons, CC BY-SA 3.0)"
  };
  function img(key) { return BASE + key + ".jpg"; }
  function h(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function wrap(host, dark) { if (!host.classList.contains("og-wrap")) host.classList.add("og-wrap"); if (dark) host.classList.add("og-dark"); }

  /* 과학자 안내: lines는 이야기 순서, say()는 학생 조작에 대한 즉석 반응 */
  function persona(host, o) {
    wrap(host, o.dark);
    var p = PEOPLE[o.who], lines = o.lines || [], idx = 0;
    var root = h("section", "og-persona");
    root.innerHTML = '<figure class="og-face"><img alt=""><figcaption></figcaption></figure>';
    var faceImg = root.querySelector("img"), faceCap = root.querySelector("figcaption");
    var bub = h("div", "og-bubble"), say = h("div", "og-say"), ctl = h("div", "og-ctl"), note = h("div", "og-note");
    var prev = h("button", null, "‹"), next = h("button", null, "›"), dots = h("div", "og-dots");
    prev.type = next.type = "button"; prev.setAttribute("aria-label", "이전 이야기"); next.setAttribute("aria-label", "다음 이야기");
    ctl.append(prev, dots, next);
    function setWho(key) {
      p = PEOPLE[key]; root.setAttribute("aria-label", p.name + "의 안내");
      faceImg.alt = p.name + " 초상"; faceImg.src = img(p.img.replace(".jpg", ""));
      faceCap.innerHTML = "<b>" + p.name + "</b>" + p.years + "<br>" + p.role;
      note.innerHTML = "※ 역사 기록을 바탕으로 재구성한 설명이며, 실제 발언이 아닙니다. · " + CREDITS[p.img.replace(".jpg", "")];
    }
    setWho(o.who);
    bub.append(say, ctl, note); root.append(bub); host.append(root);
    function show(i, react) {
      idx = Math.max(0, Math.min(lines.length - 1, i));
      say.className = "og-say" + (react ? " react" : ""); say.innerHTML = react || lines[idx] || "";
      prev.disabled = idx === 0; next.disabled = idx === lines.length - 1;
      [].forEach.call(dots.children, function (d, k) { d.classList.toggle("on", k === idx && !react); });
      ctl.style.display = lines.length > 1 ? "" : "none";
    }
    function build() {
      dots.innerHTML = "";
      lines.forEach(function (_, k) { var d = h("i"); d.onclick = function () { show(k); }; dots.append(d); });
    }
    prev.onclick = function () { show(idx - 1); }; next.onclick = function () { show(idx + 1); };
    build(); show(0);
    return {
      say: function (html) { show(idx, html); },
      set: function (ls, i, who) { if (who) setWho(who); lines = ls; build(); show(i || 0); },
      goto: function (i) { show(i); },
      get index() { return idx; }
    };
  }

  function howto(host, steps, o) {
    o = o || {}; wrap(host, o.dark);
    var d = h("details", "og-howto"); d.open = o.open !== false;
    d.innerHTML = "<summary>🧭 " + (o.title || "이렇게 사용하세요") + "</summary><ol>" + steps.map(function (s) { return "<li>" + s + "</li>"; }).join("") + "</ol>";
    host.append(d); return d;
  }

  /* 미션: done(id)로 완료 표시, 모두 끝나면 onAll */
  function missions(host, list, o) {
    o = o || {}; wrap(host, o.dark);
    var box = h("section", "og-missions"), ul = h("ul"), cnt = h("span"), done = {};
    box.innerHTML = "<h3>🎯 " + (o.title || "해 보기") + "</h3>"; box.firstChild.append(cnt);
    var lis = {};
    list.forEach(function (m) { var li = h("li", null, "<span>" + m.text + "</span>"); lis[m.id] = li; ul.append(li); });
    box.append(ul); host.append(box);
    function count() { var n = Object.keys(done).length; cnt.textContent = n + " / " + list.length; }
    count();
    return {
      done: function (id) {
        if (done[id] || !lis[id]) return false;
        done[id] = 1; lis[id].classList.add("ok"); count();
        var m = list.filter(function (x) { return x.id === id; })[0];
        if (o.onDone) o.onDone(m, Object.keys(done).length === list.length);
        return true;
      },
      has: function (id) { return !!done[id]; }
    };
  }

  /* 실제 사진 ↔ 시뮬레이션. o.draw(canvas)는 redraw()마다 호출 */
  function compare(host, o) {
    wrap(host, o.dark);
    var box = h("section", "og-compare"), pair = h("div", "og-pair");
    box.innerHTML = "<h3>📷 " + (o.title || "실제 사진과 비교해 보기") + "</h3>";
    var f1 = h("figure"), fr1 = h("div", "og-frame"), im = h("img"), c1 = h("figcaption", null, o.photoCaption || "실제 사진");
    im.alt = o.alt || ""; im.loading = "lazy"; im.src = img(o.photo); fr1.append(im); f1.append(fr1, c1);
    var f2 = h("figure"), fr2 = h("div", "og-frame"), cv = h("canvas"), c2 = h("figcaption", null, o.simCaption || "시뮬레이션");
    cv.width = o.w || 480; cv.height = o.h || 360; fr2.append(cv); f2.append(fr2, c2);
    pair.append(f1, f2); box.append(pair);
    if (o.points && o.points.length) { var ul = h("ul", "og-points"); o.points.forEach(function (t) { ul.append(h("li", null, t)); }); box.append(ul); }
    box.append(h("div", "og-credit", CREDITS[o.photo] || ""));
    host.append(box);
    function redraw() { if (o.draw) o.draw(cv); }
    redraw();
    return { redraw: redraw, canvas: cv, el: box };
  }

  global.OG = { persona: persona, howto: howto, missions: missions, compare: compare, PEOPLE: PEOPLE, CREDITS: CREDITS, img: img };
})(window);
