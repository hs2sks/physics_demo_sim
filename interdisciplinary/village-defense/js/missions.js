/* missions.js — 스테이지마다 하나씩, 전투 전에 하는 필수 미션(연습 단계).
   mission = { title, text, hint, targets, predict, steps, init(), feed(state, shot), table(state), why }
   - targets: 연습용 표적 [{kind:'post'|'balloon', x(m), cy(높이 m), w, h, armor}] (x 는 대포 기준 d 가 아니라 화면 x)
   - feed 가 돌려주는 {progress, msg, done}: progress 는 steps 중 몇 칸을 채웠는지
   - table: 탐구 노트에 자동으로 남길 데이터 {head, rows, foot}
   - shot(발사 기록) = { how:'ground'|'target'|'bounce'|'out', range, time, angle, speed, sign, apex, vac, earth, target, field } */
(function (root) {
  'use strict';
  const VD = root.VD, C = VD.C;
  const f1 = x => (Math.round(x * 10) / 10).toFixed(1);
  const M = VD.MISSIONS = {};
  const sg = s => (s > 0 ? '＋' : '−');
  const key = r => r.angle + '/' + r.speed;

  M['1-1'] = {
    title: '속력을 2배로!',
    text: '각도는 45°로 고정이에요. 먼저 10~15 m/s 중 한 속력으로 한 발 쏘고, 이어서 정확히 2배 속력으로 한 발 더 쏴서 둘 다 땅에 떨어뜨려 보세요.',
    hint: '예: 10 m/s로 쏜 다음 20 m/s로 쏘기. 속력 칸의 ＋/− 버튼은 1씩 바뀌어요.',
    targets: [],
    predict: { q: '속력을 2배로 하면 사거리는 몇 배가 될까요?', options: ['약 2배', '약 3배', '약 4배'], correct: 2 },
    steps: ['기준 발사', '2배 속력 발사'],
    init: () => ({ land: {} }),
    feed(s, r) {
      if (r.how !== 'ground') return { progress: s.pair ? 2 : 0, msg: '땅에 떨어진 발사만 기록돼요.' };
      if (r.speed < 10) return { progress: 0, msg: '10 m/s 이상으로 쏴 주세요(속력이 작으면 대포 높이의 영향이 커서 비교가 흐려져요).' };
      s.land[r.speed] = { d: r.range, t: r.time };
      for (const v in s.land) if (s.land[+v * 2]) { s.pair = [+v, +v * 2]; return { progress: 2, done: true, msg: `${v} m/s → ${f1(s.land[v].d)} m, ${+v * 2} m/s → ${f1(s.land[+v * 2].d)} m 기록 완료!` }; }
      const v2 = r.speed * 2 <= 30 ? r.speed * 2 : r.speed / 2;   // 30을 넘으면 절반 속력을 권한다
      return { progress: 1, msg: `${r.speed} m/s → ${f1(r.range)} m 기록! 이제 ${Number.isInteger(v2) ? v2 : '절반'} m/s 로 쏴 보세요.` };
    },
    table(s) {
      const [a, b] = s.pair, A = s.land[a], B = s.land[b];
      return { head: ['속력 (m/s)', '사거리 d (m)', '비행 시간 (s)'], rows: [[a, f1(A.d), f1(A.t)], [b, f1(B.d), f1(B.t)]],
        foot: `속력 ${b / a}배 → 사거리 ${f1(B.d / A.d)}배, 비행 시간 ${f1(B.t / A.t)}배 (대포가 땅보다 조금 높아서 정확히 4배보다 약간 작아요)` };
    },
    why: { q: '사거리가 약 4배가 된 이유는?', options: ['수평 속도와 떠 있는 시간이 모두 2배가 되기 때문', '수평 속도만 2배가 되기 때문', '중력이 절반이 되기 때문'], correct: 0,
      explain: '속력이 2배면 수평 속도 v·cosθ 도 2배, 떠 있는 시간 t = 2v·sinθ/g 도 2배예요. 거리 = 수평 속도 × 시간 이므로 2×2 = 4배! 그래서 R = v²·sin2θ/g 처럼 사거리는 v²에 비례해요.' },
  };

  M['1-2'] = {
    title: '같은 표적, 다른 각도',
    text: '속력은 22 m/s 로 고정이에요. 35 m 앞 과녁을 맞혀 보세요. 그다음 20° 이상 다른 각도로 같은 과녁을 한 번 더 맞히세요.',
    hint: '낮게 쏘는 각도(20° 근처)와 높게 쏘는 각도(65° 근처)가 있어요. 점선이 과녁을 지나는 각도를 찾으세요.',
    targets: [{ kind: 'post', x: C.CANNON_X + 35, cy: 1.5, w: 3, h: 3 }],
    predict: { q: '같은 속력으로 같은 과녁을 맞히는 각도는 몇 개일까요?', options: ['1개', '2개', '3개 이상'], correct: 1 },
    steps: ['첫 번째 명중', '다른 각도로 명중'],
    init: () => ({ hits: [] }),
    feed(s, r) {
      if (!(r.target && r.target.hit)) return { progress: s.hits.length ? 1 : 0, msg: `이번 발사 d = ${f1(r.range)} m. 과녁은 35 m 앞이에요. 각도를 바꿔 보세요.` };
      s.hits.push(r.angle);
      for (const a of s.hits) for (const b of s.hits) if (Math.abs(a - b) >= 20) { s.pair = [Math.min(a, b), Math.max(a, b)]; return { progress: 2, done: true, msg: `${s.pair[0]}° 와 ${s.pair[1]}° 모두 명중!` }; }
      return { progress: 1, msg: `${r.angle}° 로 명중! 이번엔 ${r.angle}° 와 20° 이상 다른 각도로 맞혀 보세요.` };
    },
    table(s) { const [a, b] = s.pair; return { head: ['발사', '각도 (°)', '결과'], rows: [['낮게', a, '명중'], ['높게', b, '명중']], foot: `두 각도의 합 = ${a + b}°` }; },
    why: { q: '같은 과녁을 맞히는 두 각도를 더하면 거의 90°가 되는 이유는?', options: ['사거리 식의 sin2θ 가 θ 와 90°−θ 에서 같은 값이기 때문', '중력이 두 번 작용하기 때문', '그냥 우연이기 때문'], correct: 0,
      explain: 'R = v²·sin2θ/g 에서 sin2θ = sin(180°−2θ) 이므로 θ 와 90°−θ 는 같은 사거리를 줘요. (대포가 땅보다 조금 높아서 합이 90°에서 약간 어긋날 수 있어요.) 낮게 쏘면 빨리 도착하고, 높게 쏘면 오래 날아 위에서 떨어져요.' },
  };

  M['1-3'] = {
    title: '풍선을 두 번 지나기',
    text: '20 m 앞, 높이 10 m 에 풍선이 있어요. 포탄이 올라가는 중에 풍선을 터뜨리고, 한 번 더 내려오는 중에 터뜨려 보세요.',
    hint: '올라가는 중에 맞히려면 낮고 빠르게(35°, 20 m/s 근처), 내려오는 중이면 높고 느리게(55°, 16 m/s 근처) 쏴 보세요.',
    targets: [{ kind: 'balloon', x: C.CANNON_X + 20, cy: 10, w: 3.2, h: 3.2 }],
    predict: { q: '같은 높이의 풍선을 포탄이 지나는 경우는?', options: ['올라가는 중에만', '내려오는 중에만', '올라갈 때도 내려올 때도 가능'], correct: 2 },
    steps: ['올라가는 중 명중', '내려오는 중 명중'],
    init: () => ({}),
    feed(s, r) {
      if (!(r.target && r.target.hit)) return { progress: (s.up ? 1 : 0) + (s.down ? 1 : 0), msg: `풍선을 못 맞혔어요. 점선이 풍선(20 m 앞, 높이 10 m)을 지나게 맞춰 보세요.` };
      const rec = { a: r.angle, v: r.speed, t: r.target.t };
      if (r.target.ascending) s.up = rec; else s.down = rec;
      const n = (s.up ? 1 : 0) + (s.down ? 1 : 0);
      if (n === 2) return { progress: 2, done: true, msg: '올라갈 때와 내려올 때 모두 명중!' };
      return { progress: 1, msg: r.target.ascending ? '올라가는 중에 명중! 이제 내려오는 중에 맞혀 보세요.' : '내려오는 중에 명중! 이제 올라가는 중에 맞혀 보세요.' };
    },
    table(s) { return { head: ['발사', '각도 (°)', '속력 (m/s)', '맞힌 시각 (s)'], rows: [['올라가는 중', s.up.a, s.up.v, f1(s.up.t)], ['내려오는 중', s.down.a, s.down.v, f1(s.down.t)]], foot: '같은 높이(10 m)를 올라갈 때 한 번, 내려올 때 한 번 지나요' }; },
    why: { q: '같은 높이를 포탄이 두 번 지나는 이유는?', options: ['올라가는 길과 내려오는 길에서 같은 높이를 한 번씩 지나기 때문', '공기저항이 높이를 바꾸기 때문', '포탄이 공중에서 한 번 멈추기 때문'], correct: 0,
      explain: '수직 방향은 등가속도 운동이라 올라갈 때 v_y 가 줄고 최고점에서 0, 내려갈 때 다시 늘어요. 그래서 최고점 아래의 모든 높이를 올라갈 때 한 번, 내려올 때 한 번 지나요. 최고점에서도 수평 속도는 그대로여서 포탄은 멈추지 않아요.' },
  };

  M['2-1'] = {
    title: '점선과 비교하기',
    text: '흰 점선은 공기저항이 없을 때의 길이에요. 20°~70° 각도, 30 m/s 이상의 속력으로 한 발 쏴서 화면 안 땅에 떨어뜨리고 점선과 얼마나 다른지 확인하세요.',
    hint: '예: 각도 30°, 속력 30 m/s. 속력이 너무 크면 화면 밖으로 날아가요. 점선이 떨어지는 곳과 실제 화살이 떨어지는 곳을 비교해요.',
    targets: [],
    predict: { q: '공기가 있으면 사거리는 진공(점선)에 비해 어떻게 될까요?', options: ['더 길다', '같다', '더 짧다'], correct: 2 },
    steps: ['빠른 화살 한 발'],
    init: () => ({}),
    feed(s, r) {
      if (r.how !== 'ground') return { progress: 0, msg: '땅에 떨어지는 발사만 기록돼요(화면 안에 떨어지게).' };
      if (r.speed < 30 || r.angle < 20 || r.angle > 70) return { progress: 0, msg: '30 m/s 이상, 20°~70° 로 쏴 주세요.' };
      s.r = r; return { progress: 1, done: true, msg: `실제 ${f1(r.range)} m, 점선(진공) ${f1(r.vac.range)} m` };
    },
    table(s) { const r = s.r; return { head: ['', '진공(점선)', '실제'], rows: [['사거리 d (m)', f1(r.vac.range), f1(r.range)], ['비행 시간 (s)', f1(r.vac.time), f1(r.time)], ['최고점 높이 (m)', f1(r.vac.apex), f1(r.apex)]],
      foot: `${r.speed} m/s, ${r.angle}° → 사거리가 ${Math.round((1 - r.range / r.vac.range) * 100)}% 줄었어요` }; },
    why: { q: '공기저항이 있으면 사거리가 짧아지는 이유는?', options: ['공기저항이 운동 반대 방향으로 작용해 속도가 계속 줄어들기 때문', '공기가 화살을 아래로 눌러 주기 때문', '공기 때문에 중력이 커지기 때문'], correct: 0,
      explain: '공기저항은 속력이 클수록 커지고 운동 반대 방향이라, 수평 속도도 수직 속도도 계속 줄어요. 그래서 사거리·최고점·비행 시간이 모두 줄고, 궤적은 내려오는 쪽이 더 가파른 비대칭이 돼요.' },
  };

  M['2-2'] = {
    title: '낮게 vs 높게',
    text: '맞바람이 불어요. 속력 25 m/s 이상으로, 낮게(30° 이하) 한 발, 높게(60° 이상) 한 발 쏴서 둘 다 땅에 떨어뜨리고 점선(진공)과 비교하세요.',
    hint: '예: 낮게 28°·30 m/s, 높게 62°·32 m/s. 화면 안에 떨어지도록 속력을 조절하세요.',
    targets: [],
    predict: { q: '맞바람이 부는 공기 속에서 진공 값에서 더 많이 벗어나는 쪽은?', options: ['낮게 쏜 화살', '높게 쏜 화살', '같다'], correct: 1 },
    steps: ['낮게 쏘기', '높게 쏘기'],
    init: () => ({}),
    feed(s, r) {
      if (r.how !== 'ground') return { progress: (s.lo ? 1 : 0) + (s.hi ? 1 : 0), msg: '땅에 떨어지는 발사만 기록돼요(화면 안에 떨어지게).' };
      if (r.speed < 25) return { progress: (s.lo ? 1 : 0) + (s.hi ? 1 : 0), msg: '속력은 25 m/s 이상이어야 해요.' };
      if (r.angle <= 30) s.lo = r; else if (r.angle >= 60) s.hi = r; else return { progress: (s.lo ? 1 : 0) + (s.hi ? 1 : 0), msg: '각도는 30° 이하(낮게) 또는 60° 이상(높게)이어야 해요.' };
      const n = (s.lo ? 1 : 0) + (s.hi ? 1 : 0);
      return n === 2 ? { progress: 2, done: true, msg: '낮게·높게 모두 기록 완료!' } : { progress: 1, msg: `${r.angle <= 30 ? '낮게' : '높게'} 쏜 기록 완료! 이제 ${r.angle <= 30 ? '높게(60° 이상)' : '낮게(30° 이하)'} 쏴 보세요.` };
    },
    table(s) { const row = (n, r) => [n + ` (${r.angle}°, ${r.speed} m/s)`, f1(r.vac.range), f1(r.range), Math.round((1 - r.range / r.vac.range) * 100) + '%']; return { head: ['발사', '진공 사거리 (m)', '실제 사거리 (m)', '줄어든 비율'], rows: [row('낮게', s.lo), row('높게', s.hi)], foot: '줄어든 비율이 큰 쪽이 공기의 영향을 더 받은 거예요' }; },
    why: { q: '높게 쏜 화살이 진공 값에서 더 많이 벗어난 이유로 가장 알맞은 것은?', options: ['공기 속에 더 오래 머물러 저항과 바람의 영향을 받는 시간이 길기 때문', '높이 쏠수록 중력이 커지기 때문', '바람은 낮은 화살에만 작용하기 때문'], correct: 0,
      explain: '높게 쏜 화살은 더 높이 올라가 더 오래 날아요. 공기저항과 바람은 날아가는 내내 작용하므로 비행 시간이 길수록 영향이 누적돼요. (바람은 공기가 움직이는 것이라 화살의 공기에 대한 상대 속도가 저항을 정해요.)' },
  };

  M['2-3'] = {
    title: '갑옷 과녁 시험',
    text: '30 m 앞의 갑옷 과녁에 화살을 두 번 쏴 보세요. 한 번은 낮게 날아가 튕겨 나오게, 한 번은 가파르게 내려꽂아 명중시키세요.',
    hint: '낮은 각도(20° 근처, 20 m/s)는 비스듬히 닿아 튕겨요. 높은 각도(57° 근처, 20 m/s)는 가파르게 내려꽂혀요. 과녁에 닿을 때의 입사각이 40° 이상이어야 해요.',
    targets: [{ kind: 'post', x: C.CANNON_X + 30, cy: 1.5, w: 3, h: 3, armor: true }],
    predict: { q: '갑옷을 입은 과녁에 닿은 화살이 튕기는 경우는?', options: ['가파르게 닿을 때', '비스듬히 닿을 때', '항상 튕긴다'], correct: 1 },
    steps: ['튕겨 보기', '내려꽂아 명중'],
    init: () => ({}),
    feed(s, r) {
      if (r.target && r.target.bounce) { s.b = r; return s.h ? { progress: 2, done: true, msg: '튕김과 명중을 모두 확인했어요!' } : { progress: 1, msg: `튕김! 입사각 ${Math.round(r.target.descDeg)}°. 이번엔 40° 이상으로 내려꽂아 보세요.` }; }
      if (r.target && r.target.hit) { s.h = r; return s.b ? { progress: 2, done: true, msg: '튕김과 명중을 모두 확인했어요!' } : { progress: 1, msg: `명중! 입사각 ${Math.round(r.target.descDeg)}°. 이번엔 낮게 쏴서 튕겨 보세요.` }; }
      return { progress: (s.b ? 1 : 0) + (s.h ? 1 : 0), msg: `과녁을 못 맞혔어요(d = ${f1(r.range)} m). 과녁은 30 m 앞이에요.` };
    },
    table(s) { return { head: ['발사', '각도 (°)', '입사각 (°)', '결과'], rows: [['낮게', s.b.angle, Math.round(s.b.target.descDeg), '튕김'], ['높게', s.h.angle, Math.round(s.h.target.descDeg), '명중']], foot: `입사각이 ${C.ARMOR_DEG}° 이상일 때만 갑옷이 뚫려요(게임 규칙)` }; },
    why: { q: '갑옷을 뚫으려면 가파르게 내려꽂아야 하는 이유는?', options: ['가파르게 닿으면 충격이 갑옷 면에 거의 수직으로 전달되고, 비스듬하면 미끄러져 흘러가기 때문', '가파르게 쏘면 화살이 더 빨라지기 때문', '가파르게 쏘면 공기저항이 없어지기 때문'], correct: 0,
      explain: '높게 쏘면 수직 속도 성분이 커서 내려올 때 입사각이 커져요. 갑옷 면에 수직에 가깝게 부딪힐수록 충격이 면을 곧장 누르고, 비스듬하면 면을 따라 미끄러져요. (40°라는 기준은 게임에서 단순화한 값이에요.)' },
  };

  M['3-1'] = {
    title: '달에서 한 발',
    text: '달에 도착했어요(각도 45° 고정). 속력 6 m/s 이상으로 한 발 쏴서 땅에 떨어뜨리고, 지구(g = 10)였다면 어땠을지와 비교하세요.',
    hint: '예: 속력 9 m/s. 달은 중력이 작아서 속력이 작아도 멀리 날아가요. 화면 안(약 55 m)에 떨어지게 하세요.',
    targets: [],
    predict: { q: '같은 속력·각도로 쏘면 달에서의 사거리는 지구와 비교해?', options: ['더 짧다', '같다', '더 길다'], correct: 2 },
    steps: ['달에서 한 발'],
    init: () => ({}),
    feed(s, r) {
      if (r.how !== 'ground') return { progress: 0, msg: '땅에 떨어지는 발사만 기록돼요(화면 안에 떨어지게).' };
      if (r.speed < 6) return { progress: 0, msg: '속력 6 m/s 이상으로 쏴 주세요.' };
      s.r = r; return { progress: 1, done: true, msg: `달 ${f1(r.range)} m, 지구라면 ${f1(r.earth.range)} m` };
    },
    table(s) { const r = s.r; return { head: ['', '달 (g = 1.6)', '지구였다면 (g = 10)'], rows: [['사거리 d (m)', f1(r.range), f1(r.earth.range)], ['비행 시간 (s)', f1(r.time), f1(r.earth.time)], ['최고점 높이 (m)', f1(r.apex), f1(r.earth.apex)]],
      foot: `${r.speed} m/s, ${r.angle}° → 달에서는 사거리가 ${f1(r.range / r.earth.range)}배, 비행 시간이 ${f1(r.time / r.earth.time)}배` }; },
    why: { q: '같은 속력·각도인데 달에서 훨씬 멀리 날아간 이유는?', options: ['달의 중력가속도가 작아 수직 속도가 천천히 줄어 떠 있는 시간이 길어지기 때문', '달에서는 포탄이 더 빨라지기 때문', '달에서는 수평 속도가 커지기 때문'], correct: 0,
      explain: '수평 속도는 지구와 같지만, 중력가속도가 작아서 떠 있는 시간 t = 2v·sinθ/g 가 길어져요. 사거리 R = v²·sin2θ/g 는 g 에 반비례! 달의 g 는 지구의 약 1/6 이라 약 6배 멀리 가요. 질량과는 상관없어요.' },
  };

  M['3-2'] = {
    title: '화성에서 높이 쏘기',
    text: '화성이에요. 각도 50°~80°, 속력 12 m/s 이상으로 한 발 쏴서 땅에 떨어뜨리고, 지구였다면 최고점이 어땠을지 비교하세요.',
    hint: '예: 각도 60°, 속력 14 m/s.',
    targets: [],
    predict: { q: '화성에서 같은 속력·각도로 쏘면 최고점은 지구보다?', options: ['낮다', '같다', '높다'], correct: 2 },
    steps: ['높게 한 발'],
    init: () => ({}),
    feed(s, r) {
      if (r.how !== 'ground') return { progress: 0, msg: '땅에 떨어지는 발사만 기록돼요(화면 안에 떨어지게).' };
      if (r.speed < 12 || r.angle < 50 || r.angle > 80) return { progress: 0, msg: '50°~80°, 12 m/s 이상으로 쏴 주세요.' };
      s.r = r; return { progress: 1, done: true, msg: `화성 최고점 ${f1(r.apex)} m, 지구라면 ${f1(r.earth.apex)} m` };
    },
    table(s) { const r = s.r; return { head: ['', '화성 (g = 3.7)', '지구였다면 (g = 10)'], rows: [['최고점 높이 (m)', f1(r.apex), f1(r.earth.apex)], ['비행 시간 (s)', f1(r.time), f1(r.earth.time)], ['사거리 d (m)', f1(r.range), f1(r.earth.range)]],
      foot: `${r.speed} m/s, ${r.angle}° → 화성에서는 최고점이 ${f1((r.apex - 1.5) / (r.earth.apex - 1.5))}배 (발사 높이 1.5 m 제외)` }; },
    why: { q: '화성에서 같은 속력으로 더 높이 올라가는 이유는?', options: ['중력가속도가 작아서 수직 속도가 천천히 줄어들기 때문', '화성의 공기가 포탄을 밀어 올리기 때문', '화성에서는 포탄이 더 가벼워지기 때문'], correct: 0,
      explain: '최고점 높이 H = v²·sin²θ / 2g 는 g 에 반비례해요. 같은 v_y 로 출발해도 g 가 작으면 v_y 가 0이 되기까지 더 오래, 더 높이 올라가요. 화성의 g(3.7)는 지구(10)의 약 0.37배라 올라간 높이는 약 2.7배예요.' },
  };

  M['3-3'] = {
    title: '목성에서 20 m 과녁',
    text: '목성이에요(g = 25). 20 m 앞의 과녁을 40°~50° 각도로 맞혀서, 맞힌 속력을 기록하세요.',
    hint: '목성은 중력이 커서 속력이 커야 해요. 45°에서 21~24 m/s 근처를 시도해 보세요.',
    targets: [{ kind: 'post', x: C.CANNON_X + 20, cy: 1.5, w: 3, h: 3 }],
    predict: { q: '목성에서 같은 거리를 맞히려면 지구보다 필요한 속력은?', options: ['더 작다', '같다', '더 크다'], correct: 2 },
    steps: ['과녁 명중'],
    init: () => ({}),
    feed(s, r) {
      if (!(r.target && r.target.hit)) return { progress: 0, msg: `못 맞혔어요(d = ${f1(r.range)} m). 과녁은 20 m 앞이에요.` };
      if (r.angle < 40 || r.angle > 50) return { progress: 0, msg: '명중! 하지만 각도를 40°~50° 로 맞춰서 다시 맞혀 주세요.' };
      s.r = r; return { progress: 1, done: true, msg: `${r.angle}°, ${r.speed} m/s 로 명중!` };
    },
    table(s) {
      const r = s.r, P = VD.physics; let ev = null;
      for (let v = 5; v <= 40; v += 0.1) if (P.vacuumRange(v, r.angle, C.MUZZLE_Y, 10).range >= 20) { ev = v; break; }
      return { head: ['', '목성 (g = 25)', '지구라면 (계산)'], rows: [['같은 과녁(20 m)을 맞히는 속력 (m/s)', r.speed, f1(ev)]], foot: `각도 ${r.angle}° · 속력 비 ≈ ${f1(r.speed / ev)}배, 중력 비 = 2.5배, √2.5 ≈ 1.6` };
    },
    why: { q: '목성에서 필요한 속력이 지구의 약 1.6배인 이유는?', options: ['R = v²·sin2θ/g 에서 v 가 √g 에 비례하기 때문', '속력이 g 에 정비례하기 때문', '속력은 g 와 상관없기 때문'], correct: 0,
      explain: '45°에서 R = v²/g 이므로 v = √(R·g) 예요. 필요한 속력은 √g 에 비례해요. g 가 2.5배면 속력은 √2.5 ≈ 1.6배면 충분해요. g 가 4배라면 속력은 2배죠.' },
  };

  M['4-1'] = {
    title: '＋ 입자와 − 입자',
    text: '기지 전체에 오른쪽 방향 전기장이 있어요. 같은 각도·속력으로 ＋ 입자와 − 입자를 한 발씩 쏴서 둘 다 땅에 떨어뜨려 보세요.',
    hint: '속력을 작게(예: 45°, 12 m/s) 해야 ＋ 입자도 화면 안에 떨어져요. 입자 전하 버튼으로 부호를 바꾸세요.',
    targets: [],
    predict: { q: '전기력이 수평일 때 ＋ 입자와 − 입자의 비행 시간은?', options: ['＋ 가 더 길다', '같다', '− 가 더 길다'], correct: 1 },
    steps: ['＋ 입자', '− 입자'],
    init: () => ({ by: {} }),
    feed(s, r) {
      if (r.how !== 'ground') return { progress: 0, msg: '땅에 떨어지는 발사만 기록돼요(화면 안에 떨어지게 속력을 줄여 보세요).' };
      const k = key(r); (s.by[k] = s.by[k] || {})[r.sign > 0 ? 'p' : 'n'] = r;
      for (const kk in s.by) if (s.by[kk].p && s.by[kk].n) { s.pair = s.by[kk]; return { progress: 2, done: true, msg: '＋ 와 − 입자 기록 완료!' }; }
      return { progress: 1, msg: `${sg(r.sign)} 입자 기록! 같은 각도(${r.angle}°)·속력(${r.speed} m/s)으로 ${r.sign > 0 ? '− ' : '＋ '}입자를 쏴 보세요.` };
    },
    table(s) { const p = s.pair.p, n = s.pair.n; return { head: ['', '＋ 입자', '− 입자'], rows: [['사거리 d (m)', f1(p.range), f1(n.range)], ['비행 시간 (s)', f1(p.time), f1(n.time)], ['최고점 높이 (m)', f1(p.apex), f1(n.apex)]], foot: `${p.speed} m/s, ${p.angle}° · 비행 시간은 거의 같고 사거리만 달라요` }; },
    why: { q: '전기력이 수평인데도 ＋ 와 − 의 비행 시간이 같은 이유는?', options: ['수직 방향은 두 입자 모두 중력만 받는 똑같은 운동이기 때문', '전기력이 수직 방향으로도 작용하기 때문', '＋ 입자가 더 빠르게 날아서'], correct: 0,
      explain: '전기력이 수평이라 수직 운동은 중력만의 등가속도 운동 그대로예요. 그래서 비행 시간이 같아요. 수평으로는 가속도 ±10 m/s² 의 등가속도 운동이라 x = v_x·t ± ½·a·t² 만큼 사거리가 늘거나 줄어요.' },
  };

  M['4-2'] = {
    title: '평행판을 지나는 입자',
    text: '평행판 구역(x = 22~44 m) 안에는 위쪽 전기장이 있어요. 구역을 통과하도록 같은 각도·속력으로 ＋ 입자와 − 입자를 한 발씩 쏴 보세요.',
    hint: '예: 45°, 22 m/s. 구역을 지나가야 기록돼요. ＋ 입자는 화면 위로 높이 날아갈 수 있어요.',
    targets: [],
    predict: { q: '＋ 입자(전기력 20 N > 중력 10 N)는 구역 안에서 어느 쪽으로 휠까요?', options: ['위로', '아래로', '휘지 않는다'], correct: 0 },
    steps: ['＋ 입자', '− 입자'],
    init: () => ({ by: {} }),
    feed(s, r) {
      if (!r.field || !r.field.enter || !r.field.exit) return { progress: 0, msg: '평행판 구역(x = 22~44 m)을 완전히 통과해야 기록돼요.' };
      const k = key(r); (s.by[k] = s.by[k] || {})[r.sign > 0 ? 'p' : 'n'] = r;
      for (const kk in s.by) if (s.by[kk].p && s.by[kk].n) { s.pair = s.by[kk]; return { progress: 2, done: true, msg: '＋ 와 − 입자 기록 완료!' }; }
      return { progress: 1, msg: `${sg(r.sign)} 입자 기록! 같은 각도(${r.angle}°)·속력(${r.speed} m/s)으로 ${r.sign > 0 ? '− ' : '＋ '}입자를 쏴 보세요.` };
    },
    table(s) { const row = r => [f1(r.field.enter.vy), f1(r.field.exit.vy), (r.field.exit.vy - r.field.enter.vy >= 0 ? '+' : '') + f1(r.field.exit.vy - r.field.enter.vy)]; const p = row(s.pair.p), n = row(s.pair.n);
      return { head: ['수직 속도 v_y (m/s)', '＋ 입자', '− 입자'], rows: [['구역에 들어갈 때', p[0], n[0]], ['구역을 나올 때', p[1], n[1]], ['변화', p[2], n[2]]], foot: 'v_y 가 늘면 위로, 줄면 아래로 휘어진 거예요' }; },
    why: { q: '＋ 입자가 구역 안에서 위로 휘는 이유는?', options: ['전기력(qE = 20 N)이 중력(mg = 10 N)보다 커서 알짜 힘이 위쪽이기 때문', '전기장이 중력을 없애 주기 때문', '입자가 가벼워지기 때문'], correct: 0,
      explain: '＋ 입자의 구역 안 수직 가속도는 +20 − 10 = +10 m/s²(위쪽), − 입자는 −20 − 10 = −30 m/s²(아래쪽)예요. 구역 밖에서는 다시 중력만 작용해서 평소의 포물선 운동이에요.' },
  };

  M['4-3'] = {
    title: '구역을 지나며 꺾이기',
    text: '이 정거장은 중력이 없어요. 입자를 평행판 구역(x = 22~46 m)에 통과시켜서, 들어갈 때와 나올 때 속도가 어떻게 달라지는지 기록하세요.',
    hint: '예: 각도 30°, 속력 25 m/s. ＋/− 어느 입자든 구역을 완전히 지나가면 돼요.',
    targets: [],
    predict: { q: '평행판 구역 밖에서 입자는 어떻게 움직일까요?', options: ['직선(등속)', '포물선', '원'], correct: 0 },
    steps: ['구역 통과'],
    init: () => ({}),
    feed(s, r) {
      if (!r.field || !r.field.enter || !r.field.exit) return { progress: 0, msg: '구역(x = 22~46 m)을 완전히 통과해야 기록돼요.' };
      s.r = r; return { progress: 1, done: true, msg: `${sg(r.sign)} 입자가 구역을 통과했어요!` };
    },
    table(s) { const r = s.r, a = r.field.enter, b = r.field.exit; return { head: ['', '들어갈 때', '나올 때'], rows: [['수평 속도 v_x (m/s)', f1(a.vx), f1(b.vx)], ['수직 속도 v_y (m/s)', f1(a.vy), f1(b.vy)], ['진행 방향 (°)', Math.round(a.ang), Math.round(b.ang)]], foot: `${sg(r.sign)} 입자 · 수평 속도는 그대로, 수직 속도만 변했어요` }; },
    why: { q: '구역을 나온 뒤 입자가 직선으로 가는 이유는?', options: ['나온 뒤에는 입자에 작용하는 힘이 없어 속도가 변하지 않기 때문', '전기장이 계속 남아 방향을 유지하기 때문', '입자가 구역을 나오면 멈추기 때문'], correct: 0,
      explain: '힘이 작용할 때만 속도가 변해요(뉴턴 제1법칙). 구역 안에서는 수직 가속도 qE/m 만큼 v_y 가 바뀌고, v_x 는 힘이 없어 그대로예요. 구역을 벗어나면 중력도 없으니 나올 때의 속도로 등속 직선 운동을 해요.' },
  };

  if (typeof module !== 'undefined') module.exports = M;
})(typeof window !== 'undefined' ? window : globalThis);
