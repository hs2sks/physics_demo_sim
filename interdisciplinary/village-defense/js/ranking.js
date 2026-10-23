/* ranking.js — 내 기록(이 기기)과 서버 랭킹. 서버가 안 열려도 게임은 계속 되고, 못 보낸 기록은 다음에 다시 보낸다.
   주소는 ?api=… 로 바꿀 수 있다(시험용). 서버: ~/board/game_rank.py */
(function (root) {
  'use strict';
  const VD = root.VD;
  const API = (new URLSearchParams(location.search).get('api') || 'https://board.crazyray.uk/api/vd').replace(/\/$/, '');
  const K = { profile: 'vd.profile', prog: 'vd.progress', pend: 'vd.pending' };

  function load(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 불가(사생활 보호 모드 등)면 이번 접속만 유지 */ } }
  const mem = {};                                         // localStorage 가 막혀도 이번 접속 동안은 동작
  const get = (k, d) => (k in mem ? mem[k] : (mem[k] = load(k, d)));
  const put = (k, v) => { mem[k] = v; save(k, v); };

  function newToken() {
    if (root.crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '') + Math.random().toString(16).slice(2, 10);
    return Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }

  async function call(method, path, body) {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 7000);
    try {
      const r = await fetch(API + path, { method, signal: ctl.signal,
        body: body ? JSON.stringify(body) : undefined, headers: body ? { 'Content-Type': 'text/plain;charset=UTF-8' } : undefined });
      const j = await r.json().catch(() => ({}));
      return Object.assign({ ok: r.ok, status: r.status }, j);
    } catch (e) { return { ok: false, status: 0, error: 'network' }; } finally { clearTimeout(to); }
  }

  const rank = {
    API,
    profile() { return get(K.profile, null); },
    setProfile(nick, cls) {
      const old = get(K.profile, null) || {};
      put(K.profile, { nick, cls, token: old.token || newToken(), registered: old.registered && old.nick === nick && old.cls === cls });
      return get(K.profile, null);
    },
    progress() { return get(K.prog, {}); },
    saveBest(stageId, score, stars) {
      const p = get(K.prog, {}), b = p[stageId];
      if (!b || score > b.score || stars > b.stars) { p[stageId] = { score: Math.max(score, b ? b.score : 0), stars: Math.max(stars, b ? b.stars : 0) }; put(K.prog, p); }
      return p[stageId];
    },
    totals() { const p = get(K.prog, {}); let s = 0, st = 0; for (const k in p) { s += p[k].score; st += p[k].stars; } return { score: s, stars: st }; },

    async register() {
      const pf = get(K.profile, null); if (!pf) return { ok: false, error: 'noprofile' };
      const r = await call('POST', '/register', { token: pf.token, nick: pf.nick, cls: pf.cls });
      if (r.ok) { pf.registered = true; put(K.profile, pf); }
      return r;
    },
    async submit(stage, score, stars, shots) {
      const pend = get(K.pend, []); pend.push({ stage, score, stars, shots }); put(K.pend, pend);
      return rank.flush();
    },
    async flush() {                                         // 보내지 못한 기록을 차례로 보낸다
      const pf = get(K.profile, null); if (!pf) return { ok: false, error: 'noprofile' };
      if (!pf.registered) { const r = await rank.register(); if (!r.ok) return r; }
      let last = { ok: true };
      let pend = get(K.pend, []);
      while (pend.length) {
        const it = pend[0];
        const r = await call('POST', '/score', Object.assign({ token: pf.token }, it));
        if (r.status === 403) { pf.registered = false; put(K.profile, pf); return r; }   // 서버가 참가자를 잊음 → 다음에 다시 등록
        if (!r.ok && r.status !== 400) return r;            // 네트워크·서버 오류: 남겨 두고 다음에 다시
        pend = get(K.pend, []).slice(1); put(K.pend, pend); last = r;
      }
      return last;
    },
    pending() { return get(K.pend, []).length; },
    async list(cls) {
      const pf = get(K.profile, null);
      const q = new URLSearchParams({ limit: '50' });
      if (cls) q.set('cls', cls);
      if (pf) q.set('token', pf.token);
      return call('GET', '/ranking?' + q.toString());
    },
    async ping() { return call('GET', '/ping'); },
  };
  VD.rank = rank;
})(window);
