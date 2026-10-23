/* sprites.js — 도트 스프라이트(문자 지도 → 캔버스). 시대(era 0~3)마다 팔레트를 바꿔 같은 그림을 다시 칠한다.
   글자 약속: k 윤곽 w 흰색 f 멧돼지 g 멧돼지 어두움 t 호랑이 u 줄무늬 e 독수리 h 독수리 머리 y 부리
   A 갑옷(없는 시대엔 어두운 털색) R 눈 s 피부 c 옷 C 옷 어두움 */
(function (root) {
  'use strict';
  const VD = root.VD = root.VD || {};

  const PAL = [
    { // 0 신석기
      k: '#2b1d12', w: '#f4ecd8', f: '#8a5a36', g: '#5c3a22', t: '#e08a2e', u: '#5a3210', e: '#6b4a2b', h: '#f1e6c8', y: '#e8b830',
      A: '#5c3a22', R: '#ffffff', s: '#e0a878', c: '#a8763c', C: '#6c4a24', p: '#3a2616' },
    { // 1 청동기
      k: '#2b1d12', w: '#f4ecd8', f: '#8a5a36', g: '#5c3a22', t: '#e08a2e', u: '#5a3210', e: '#6b4a2b', h: '#f1e6c8', y: '#e8b830',
      A: '#d89a3a', R: '#ffffff', s: '#e0a878', c: '#3d6fa6', C: '#274a74', p: '#d89a3a' },
    { // 2 철기
      k: '#1c1c24', w: '#f4ecd8', f: '#7a5236', g: '#4e3220', t: '#d9822a', u: '#4a2a10', e: '#5c4228', h: '#e8e0c8', y: '#e8b830',
      A: '#aab4c2', R: '#ffffff', s: '#e0a878', c: '#9b3535', C: '#5f1f1f', p: '#aab4c2' },
    { // 3 미래
      k: '#0a0e1a', w: '#e8f4ff', f: '#56688a', g: '#2c3a58', t: '#7a5ad0', u: '#2a1c5a', e: '#3e6a8c', h: '#bfe8ff', y: '#ffd24a',
      A: '#25e0d0', R: '#ff3355', s: '#e0a878', c: '#e8eef8', C: '#8a9ab4', p: '#25e0d0' },
  ];

  const MAP = {
    boar: [
      '.......kkkk.....',
      '....kkkAAAAkk...',
      '...kgggAAAAgggk.',
      '..kfffgggggggfk.',
      '.kfffRfffgggggfk',
      'kwfffffffffffffk',
      'kwffffffffffffk.',
      '.kkfffffffffffk.',
      '...kfk....kfk...',
      '...kfk....kfk...',
      '...kkk....kkk...'],
    tiger: [
      '.....kk.............',
      '....kttkkkkkkkk.....',
      '...kttttttAAAAAkk...',
      '..kttRttttuAAAuttk..',
      '.kttttttutttuttttttk',
      'kwtttttttututtutttuk',
      'kwwttttttttttttttttk',
      '.kkttuttuttuttuttttk',
      '..kwttttttttttttttk.',
      '...ktk.ktk..ktk.ktk.',
      '...ktk.ktk..ktk.ktk.',
      '...kkk.kkk..kkk.kkk.'],
    eagle0: [
      '........e.......',
      '.......eee......',
      '......eeAe.e....',
      '.....eeAee.ee...',
      '..kk.eeeeeeee...',
      '.kyhheeeeeeeeee.',
      'yyhRheeeeeeee.e.',
      '.yyhheeeeeee....',
      '...kheeeee......',
      '.....kk.kk......'],
    eagle1: [
      '................',
      '..kk............',
      '.kyhhe..........',
      'yyhRheeeeeeeee..',
      '.yyhheeeeeeeeee.',
      '...kheeeAAAeeee.',
      '.....eeeAAAee...',
      '......eeeAeee...',
      '......eee.eee...',
      '.......e...e....'],
    person: [
      '..kkkk..',
      '.kAAAAk.',
      '.kAsssk.',
      '.kssksk.',
      '.kssssk.',
      '..kccck.',
      '.kcccCck',
      'kscccCcs',
      'ks.cccCk',
      '..kcCck.',
      '..kC.Ck.',
      '..kC.Ck.',
      '.kkk.kkk'],
    heart: [
      '.kk.kk.',
      'kRRkRRk',
      'kRRRRRk',
      '.kRRRk.',
      '..kRk..',
      '...k...'],
  };
  // 하트·글자색은 시대와 무관하게 고정
  const FIXED = { heart: { k: '#2b1d12', R: '#e8334a' } };

  const cache = {};
  const ENEMY_SPRITE = { boar: 1, tiger: 1, eagle0: 1, eagle1: 1 };
  function make(name, era, flip, armored) {
    const key = name + '|' + era + '|' + (flip ? 1 : 0) + '|' + (armored ? 1 : 0);
    if (cache[key]) return cache[key];
    const rows = MAP[name], w = Math.max.apply(null, rows.map(r => r.length)), h = rows.length;
    const pal = Object.assign({}, PAL[era], FIXED[name] || {});
    if (ENEMY_SPRITE[name] && !armored) pal.A = pal.g;     // 갑옷 없는 적은 갑옷 자리를 어두운 털색으로
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    rows.forEach((r, y) => {
      for (let x = 0; x < r.length; x++) {
        const ch = r[x]; if (ch === '.') continue;
        const col = pal[ch]; if (!col) continue;
        g.fillStyle = col; g.fillRect(flip ? w - 1 - x : x, y, 1, 1);
      }
    });
    return (cache[key] = c);
  }

  function rect(g, x, y, w, h, col) { g.fillStyle = col; g.fillRect(x, y, w, h); }

  // 마을(48×26 px): 시대마다 다른 집
  function village(era) {
    const key = 'village|' + era;
    if (cache[key]) return cache[key];
    const c = document.createElement('canvas'); c.width = 48; c.height = 26;
    const g = c.getContext('2d'), P = PAL[era];
    if (era === 0) {                                   // 움집: 풀로 덮은 뾰족 지붕
      for (let i = 0; i < 14; i++) rect(g, 12 + (i >> 1) * 0 + (13 - i) >> 0, 26 - 1 - i, 0, 0, '#000');
      const row = (y, x0, x1, col) => rect(g, x0, y, x1 - x0, 1, col);
      for (let y = 0; y < 16; y++) { const half = Math.floor(y * 0.9) + 1; row(8 + y, 13 - half + 6, 13 + half + 6, y % 3 === 0 ? '#8d6f2a' : '#c9a24a'); }
      rect(g, 17, 20, 6, 6, '#3a2616'); rect(g, 18, 21, 4, 5, '#1f130a');
      for (let y = 0; y < 12; y++) { const half = Math.floor(y * 0.8) + 1; row(14 + y, 36 - half, 36 + half, y % 3 === 0 ? '#8d6f2a' : '#c9a24a'); }
      rect(g, 34, 22, 4, 4, '#1f130a');
      rect(g, 5, 18, 1, 8, '#6a4524'); rect(g, 4, 17, 3, 2, '#a02a20');   // 횃불
    } else if (era === 1) {                            // 목책을 두른 나무집
      rect(g, 6, 12, 22, 14, '#9a6b3a'); for (let x = 6; x < 28; x += 4) rect(g, x, 12, 1, 14, '#6a4524');
      for (let y = 0; y < 8; y++) rect(g, 3 + y, 4 + y, 28 - 2 * y, 1, y % 2 ? '#7a3f24' : '#a05a3a');
      rect(g, 14, 18, 6, 8, '#3a2616'); rect(g, 9, 15, 4, 4, '#ffd34a');
      for (let x = 32; x < 48; x += 3) { rect(g, x, 14, 2, 12, '#9a6b3a'); rect(g, x, 12, 2, 2, '#6a4524'); }
      rect(g, 0, 23, 3, 3, '#6a4524');
    } else if (era === 2) {                            // 돌 성채: 흉벽과 깃발
      rect(g, 4, 8, 26, 18, '#9aa0a8'); for (let y = 10; y < 26; y += 4) rect(g, 4, y, 26, 1, '#6a6f78');
      for (let x = 4; x < 30; x += 6) rect(g, x, 4, 3, 4, '#9aa0a8');
      rect(g, 13, 17, 8, 9, '#2c2f36'); rect(g, 14, 15, 6, 3, '#2c2f36');
      rect(g, 30, 12, 14, 14, '#868c94'); for (let x = 30; x < 44; x += 5) rect(g, x, 9, 3, 3, '#868c94');
      rect(g, 17, 0, 1, 8, '#3a2616'); rect(g, 18, 0, 6, 4, '#9b3535');
    } else {                                           // 미래 기지: 돔과 안테나
      for (let y = 0; y < 14; y++) { const hw = Math.round(Math.sqrt(14 * 14 - (14 - y) * (14 - y))); rect(g, 18 - hw, 12 + y, hw * 2, 1, y < 5 ? '#bfe8ff' : '#7a98b8'); }
      rect(g, 4, 26 - 2, 28, 2, '#364458'); rect(g, 15, 18, 6, 6, '#25e0d0'); rect(g, 16, 19, 4, 4, '#e8ffff');
      rect(g, 18, 0, 1, 10, '#8a98b0'); rect(g, 16, 0, 5, 1, '#ff3355');
      rect(g, 36, 12, 8, 14, '#56688a'); rect(g, 38, 14, 4, 2, '#25e0d0'); rect(g, 38, 19, 4, 2, '#25e0d0');
    }
    return (cache[key] = c);
  }

  VD.sprites = { PAL, MAP, make, village };
})(window);
