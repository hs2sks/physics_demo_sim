/* stages.js — 월드·스테이지 데이터. 좌표는 미터(m), 대포 위치 기준 x=0 이 화면 왼쪽 끝.
   wind>0 이면 오른쪽(적 쪽)으로 부는 바람. field 는 전기장 구역(없으면 null).
   spawns: t=시작 후 초, type=boar|tiger|eagle, speed=m/s, armor=true 면 입사각 armorDeg 이상으로 내려꽂아야 피해,
   alt=독수리 비행 높이(m). 별 3개 기준 발사 수 par = (맞혀야 하는 횟수 합) + 2 로 자동 계산. */
(function (root) {
  'use strict';
  const VD = root.VD = root.VD || {};

  VD.C = {
    PXM: 6, CW: 384, CH: 216, GROUND_PX: 192,       // 1 m = 6 px, 지면선 y=192px
    CANNON_X: 6, MUZZLE_Y: 1.5, SPAWN_X: 63, BASE_X: 11, FIELD_W: 64,
    DT: 1 / 120, BALL_R: 0.5, ARMOR_DEG: 40,
  };

  VD.ENEMY = {                                       // w,h = 충돌 상자(m), hp = 맞아야 하는 횟수
    boar:  { name: '멧돼지', w: 3.0, h: 2.0, hp: 1 },
    tiger: { name: '호랑이', w: 3.6, h: 2.6, hp: 2 },
    eagle: { name: '독수리', w: 3.0, h: 2.0, hp: 1 },
  };

  VD.WORLDS = [
    { id: 1, era: 0, name: '신석기 마을', topic: '포물선 운동', weapon: '돌 투척기', ammoName: '돌',
      story: '움집 마을에 사냥철이 왔어요. 굶주린 멧돼지와 호랑이, 독수리가 마을로 몰려옵니다. 돌 투척기로 마을을 지켜요!' },
    { id: 2, era: 1, name: '청동기 마을', topic: '공기저항', weapon: '활과 화살', ammoName: '화살',
      story: '청동 갑옷을 두른 짐승들이 나타났어요. 가벼운 화살은 공기의 영향을 많이 받아요. 바람도 읽어야 합니다!' },
    { id: 3, era: 2, name: '철기 마을', topic: '천체의 중력', weapon: '쇠 대포', ammoName: '쇠공',
      story: '대장장이가 만든 시공의 문이 열렸어요! 마을이 달·화성·목성으로 옮겨 가요. 중력이 달라지면 포탄은 어떻게 날까요?' },
    { id: 4, era: 3, name: '미래 기지', topic: '전기장 속 운동', weapon: '입자포', ammoName: '입자',
      story: '먼 미래, 사이보그 짐승이 기지를 노립니다. 입자포는 전하를 띤 입자를 쏘아요. 전기장이 입자의 길을 휘게 해요!' },
  ];

  const S = [];
  function add(o) { o.world = +o.id[0]; S.push(o); }

  /* ---------------- 월드 1: 신석기 (g=10, 공기저항 없음) ---------------- */
  add({ id: '1-1', name: '첫 사냥', env: { g: 10, k: 0, wind: 0, field: null },
    v: { min: 5, max: 30, init: 15 }, angle: { min: 5, max: 85, init: 45 }, lockAngle: 45,
    preview: { mode: 'actual', dots: 60 }, ammo: 7, hp: 3,
    spawns: [
      { t: 1, type: 'boar', speed: 0.6 }, { t: 9, type: 'boar', speed: 0.6 }, { t: 17, type: 'boar', speed: 0.6 },
    ],
    intro: '각도는 45°로 고정이에요. 멧돼지까지의 거리에 맞는 속력을 찾아 쏘세요. 점선은 지금 설정으로 날아갈 길이에요.',
    hint: '지면에서 쏘면 수평 도달 거리 R = v²·sin2θ / g. θ=45°면 R = v²/g (g = 10 m/s²). 대포가 조금 높아서 실제는 약간 더 멀리 가요.',
    ask: '속력을 2배로 하면 사거리는 몇 배가 되었나요? 그 이유는?',
    note: '사거리는 v²에 비례해요. 속력이 2배면 수평 속도도, 떠 있는 시간도 2배가 되어 거리는 4배! 수평 방향은 등속, 수직 방향은 등가속도 운동이에요.' });

  add({ id: '1-2', name: '각도를 골라라', env: { g: 10, k: 0, wind: 0, field: null },
    v: { min: 5, max: 30, init: 22 }, angle: { min: 5, max: 85, init: 30 }, lockSpeed: 22,
    preview: { mode: 'actual', dots: 14 }, ammo: 9, hp: 3,
    spawns: [
      { t: 1, type: 'boar', speed: 0.9 }, { t: 8, type: 'tiger', speed: 0.8 }, { t: 18, type: 'boar', speed: 0.9 }, { t: 24, type: 'boar', speed: 0.9 },
    ],
    intro: '이번에는 속력이 22 m/s로 고정! 각도만 바꿔서 맞혀야 해요. 점선은 처음 일부분만 보여요. 호랑이는 두 번 맞혀야 쓰러져요.',
    hint: 'R = v²·sin2θ / g. 같은 R을 만드는 각도가 두 개 있어요 (θ 와 90°−θ).',
    ask: '같은 멧돼지를 맞히는 각도가 두 개 있었나요? 두 각도를 더하면 얼마인가요?',
    note: 'sin2θ = sin(180°−2θ) 이므로 θ 와 90°−θ 는 같은 사거리를 가져요. 낮게 쏘면 빨리 도착하고, 높게 쏘면 오래 날아 위에서 떨어져요.' });

  add({ id: '1-3', name: '하늘의 독수리', env: { g: 10, k: 0, wind: 0, field: null },
    v: { min: 5, max: 30, init: 18 }, angle: { min: 5, max: 85, init: 45 },
    preview: { mode: 'none', dots: 0 }, ammo: 12, hp: 3,
    spawns: [
      { t: 1, type: 'eagle', speed: 2.0, alt: 11 }, { t: 7, type: 'boar', speed: 1.0 }, { t: 12, type: 'eagle', speed: 2.0, alt: 15 },
      { t: 20, type: 'tiger', speed: 0.9 }, { t: 26, type: 'eagle', speed: 2.0, alt: 9 },
    ],
    intro: '이번에는 점선이 없어요. 대신 지난 발사의 흔적이 흐리게 남아요. 하늘을 나는 독수리는 포탄이 오르거나 내리는 중에 맞혀야 해요.',
    hint: '최고점 높이 H = v²·sin²θ / 2g, 최고점까지 걸리는 시간 t = v·sinθ / g.',
    ask: '독수리가 지나는 높이를 맞히는 길은 포물선의 오르막과 내리막 두 곳이에요. 어느 쪽이 더 맞히기 쉬웠나요?',
    note: '수직 속도 v_y 는 올라갈 때 줄고 내려갈 때 늘어요. 최고점에서는 v_y = 0 이지만 수평 속도는 그대로여서 포탄은 멈추지 않아요.' });

  /* ---------------- 월드 2: 청동기 (공기저항, 바람) ---------------- */
  add({ id: '2-1', name: '느려지는 화살', env: { g: 10, k: 0.008, wind: 0, field: null },
    v: { min: 10, max: 45, init: 25 }, angle: { min: 5, max: 85, init: 40 },
    preview: { mode: 'vacuum', dots: 60 }, ammo: 9, hp: 3,
    spawns: [
      { t: 1, type: 'boar', speed: 0.9 }, { t: 9, type: 'boar', speed: 0.9 }, { t: 17, type: 'tiger', speed: 0.8 }, { t: 25, type: 'boar', speed: 0.9 },
    ],
    intro: '공기가 있어요! 흐린 점선은 공기저항이 없을 때의 길이에요. 실제 화살은 어떻게 달라질까요? 쏘고 비교해 보세요.',
    hint: '공기저항은 운동 방향의 반대로 작용하고 속력이 클수록 커요. 위로 갈 때도, 내려올 때도, 수평 속도도 계속 줄어요.',
    ask: '공기저항이 있을 때 같은 속력·각도의 사거리는 진공보다 길었나요, 짧았나요? 가장 멀리 가는 각도는 45°보다 커졌나요, 작아졌나요?',
    note: '공기저항 때문에 사거리가 줄고, 궤적은 내려오는 쪽이 더 가파른 비대칭이에요. 가장 멀리 가는 각도도 45°보다 작아져요 (낮게 쏠수록 공기 속에 머무는 시간이 짧아서).' });

  add({ id: '2-2', name: '맞바람', env: { g: 10, k: 0.008, wind: -5, field: null },
    v: { min: 10, max: 45, init: 28 }, angle: { min: 5, max: 85, init: 40 },
    preview: { mode: 'vacuum', dots: 60 }, ammo: 10, hp: 3,
    spawns: [
      { t: 1, type: 'boar', speed: 1.0 }, { t: 8, type: 'eagle', speed: 2.0, alt: 12 }, { t: 15, type: 'boar', speed: 1.0 },
      { t: 22, type: 'tiger', speed: 0.8 }, { t: 30, type: 'boar', speed: 1.0 },
    ],
    intro: '마을 쪽으로 맞바람(5 m/s)이 불어요. 화살이 바람에 밀려 짧게 떨어져요. 깃발이 가리키는 방향을 보세요.',
    hint: '공기에 대한 화살의 상대 속도가 클수록 저항이 커요. 맞바람이면 상대 속도가 커져서 더 많이 느려져요.',
    ask: '맞바람이 불면 위로 높이 쏜 화살과 낮게 쏜 화살 중 어느 쪽이 바람의 영향을 더 많이 받았나요?',
    note: '바람은 공기가 움직이는 것이라, 화살이 공기에 대해 얼마나 빠른지(상대 속도)가 중요해요. 오래 떠 있는 높은 화살일수록 바람에 밀리는 시간이 길어요.' });

  add({ id: '2-3', name: '청동 갑옷 멧돼지', env: { g: 10, k: 0.006, wind: 4, field: null },
    v: { min: 10, max: 45, init: 30 }, angle: { min: 5, max: 85, init: 50 },
    preview: { mode: 'vacuum', dots: 40 }, ammo: 12, hp: 3,
    spawns: [
      { t: 1, type: 'boar', speed: 0.9, armor: true }, { t: 10, type: 'eagle', speed: 2.0, alt: 13 }, { t: 16, type: 'boar', speed: 0.9, armor: true },
      { t: 26, type: 'tiger', speed: 0.8, armor: true }, { t: 34, type: 'boar', speed: 0.9 },
    ],
    intro: '청동 갑옷을 입은 짐승은 비스듬히 날아오는 화살을 튕겨내요! 40° 이상으로 가파르게 내려꽂아야 해요. 이번에는 뒷바람(4 m/s)이에요.',
    hint: '내려오는 각도 = 도착 순간 속도의 방향. 높이 쏠수록 가파르게 떨어져요. 뒷바람은 화살을 멀리 밀어 줘요.',
    ask: '갑옷 멧돼지를 맞히려면 낮게 쏴야 했나요, 높게 쏴야 했나요? 이유는?',
    note: '높이 쏘면 수직 속도 성분이 커서 내려올 때 입사각이 커져요. 갑옷처럼 비스듬한 충돌이 약한 상대는 가파른 궤적으로 공략하는 것이 효과적이에요.' });

  /* ---------------- 월드 3: 철기 (천체의 중력, 공기저항 무시) ---------------- */
  add({ id: '3-1', name: '달 위의 철기 마을', body: 'moon', env: { g: 1.6, k: 0, wind: 0, field: null },
    v: { min: 3, max: 14, init: 8 }, angle: { min: 5, max: 85, init: 45 }, lockAngle: 45,
    preview: { mode: 'actual', dots: 60 }, ammo: 8, hp: 3,
    spawns: [
      { t: 1, type: 'boar', speed: 0.5 }, { t: 12, type: 'boar', speed: 0.5 }, { t: 24, type: 'tiger', speed: 0.5 },
    ],
    intro: '달(g = 1.6 m/s²)에 도착했어요. 각도는 45° 고정. 같은 거리라도 필요한 속력이 지구와 달라요! 포탄이 날아가는 시간도 아주 길어서 앞을 예측해서 쏴야 해요.',
    hint: 'R = v²·sin2θ / g, 체공 시간 t = 2v·sinθ / g. 지구(10)에서 달(1.6)로 가면 g가 약 1/6.',
    ask: '같은 속력·같은 각도로 쏘면 달에서는 지구보다 몇 배 멀리 날아갈까요? (g 비로 예측해 보세요)',
    note: '사거리 R 은 g 에 반비례! 달의 g 는 지구의 약 1/6 이라 같은 발사 조건에서 약 6배 멀리, 6배 오래 날아요. 질량에는 상관이 없어요.' });

  add({ id: '3-2', name: '붉은 화성', body: 'mars', env: { g: 3.7, k: 0, wind: 0, field: null },
    v: { min: 5, max: 24, init: 12 }, angle: { min: 5, max: 85, init: 45 },
    preview: { mode: 'actual', dots: 16 }, ammo: 10, hp: 3,
    spawns: [
      { t: 1, type: 'boar', speed: 0.7 }, { t: 8, type: 'eagle', speed: 1.8, alt: 12 }, { t: 15, type: 'boar', speed: 0.7 }, { t: 25, type: 'tiger', speed: 0.7 },
    ],
    intro: '화성(g = 3.7 m/s²)이에요. 점선은 처음 일부만 보여요. 이번에는 각도도 자유예요.',
    hint: '최고점 높이 H = v²·sin²θ / 2g. 같은 속력이면 g가 작을수록 더 높이 올라가요.',
    ask: '독수리와 멧돼지를 맞힐 때, 지구에서 쓰던 설정과 비교해 무엇이 달라졌나요?',
    note: 'g 가 작으면 수직 방향 가속이 느려서 높이 오르고 오래 떠 있어요. 수평 속도는 같아도 체공 시간이 길어 더 멀리 가요.' });

  add({ id: '3-3', name: '거대한 목성', body: 'jupiter', env: { g: 25, k: 0, wind: 0, field: null },
    v: { min: 10, max: 55, init: 30 }, angle: { min: 5, max: 85, init: 45 },
    preview: { mode: 'none', dots: 0 }, ammo: 12, hp: 3,
    spawns: [
      { t: 1, type: 'boar', speed: 1.0 }, { t: 7, type: 'eagle', speed: 2.2, alt: 8 }, { t: 14, type: 'tiger', speed: 0.9, armor: true },
      { t: 24, type: 'boar', speed: 1.0, armor: true }, { t: 30, type: 'eagle', speed: 2.2, alt: 11 },
    ],
    intro: '목성(g = 25 m/s²)! 포탄이 금방 떨어져요. 점선은 없어요. 쇠 갑옷을 입은 짐승은 40° 이상으로 내려꽂아야 해요.',
    hint: '체공 시간이 짧으니 적이 거의 움직이지 않아요. 이번에는 속력을 크게!',
    ask: '지구·달·화성·목성에서 같은 45° 로 20 m 앞 표적을 맞히려면 필요한 속력은 g 와 어떤 관계였나요?',
    note: 'θ=45° 에서 R = v²/g 이므로 v = √(R·g). 필요한 속력은 √g 에 비례해요. g 가 4배면 속력은 2배면 충분해요.' });

  /* ---------------- 월드 4: 미래 (전기장 속 운동) ---------------- */
  // 입자: 질량 m=1 kg, 전하 q=±1 C 로 정했으니 가속도 a = qE/m = ±E (방향은 전하 부호에 따라)
  add({ id: '4-1', name: '수평 전기장', env: { g: 10, k: 0, wind: 0, field: { x0: -10, x1: 80, y0: -10, y1: 80, ex: 10, ey: 0 } },
    charge: { m: 1, q: 1, label: 'E = 10 N/C, 오른쪽 →' },
    v: { min: 5, max: 32, init: 18 }, angle: { min: 5, max: 85, init: 45 },
    preview: { mode: 'actual', dots: 50 }, ammo: 10, hp: 3,
    spawns: [
      { t: 1, type: 'boar', speed: 0.9 }, { t: 9, type: 'eagle', speed: 2.0, alt: 11 }, { t: 16, type: 'tiger', speed: 0.8 }, { t: 26, type: 'boar', speed: 0.9, armor: true },
    ],
    intro: '기지 전체에 오른쪽으로 향하는 전기장(E = 10 N/C)이 있어요. 입자의 전하 부호(+ / −)를 고를 수 있어요. 입자는 질량 1 kg, 전하 ±1 C 예요.',
    hint: '전기력 F = qE, 가속도 a = qE/m. + 전하는 E 방향으로, − 전하는 반대 방향으로 힘을 받아요. 수평 가속도가 생겨도 수직 운동(중력)은 그대로예요.',
    ask: '+ 전하와 − 전하로 같은 속력·각도로 쏘면 체공 시간은 같았나요, 달랐나요? 사거리는요?',
    note: '전기력이 수평 방향이라 수직 운동은 중력만의 등가속도 운동 그대로여서 체공 시간이 같아요. 수평으로는 가속도 ±10 m/s² 의 등가속도 운동이라 사거리가 늘거나 줄어요: x = v_x·t ± ½·a·t².' });

  add({ id: '4-2', name: '평행판 사이', env: { g: 10, k: 0, wind: 0, field: { x0: 22, x1: 44, y0: 0, y1: 32, ex: 0, ey: 20 } },
    charge: { m: 1, q: 1, label: '평행판 사이 E = 20 N/C, 위쪽 ↑' },
    v: { min: 8, max: 35, init: 22 }, angle: { min: 5, max: 85, init: 45 },
    preview: { mode: 'actual', dots: 30 }, ammo: 11, hp: 3,
    spawns: [
      { t: 1, type: 'boar', speed: 0.9 }, { t: 8, type: 'boar', speed: 0.9 }, { t: 16, type: 'eagle', speed: 2.0, alt: 12 },
      { t: 22, type: 'tiger', speed: 0.8 }, { t: 32, type: 'boar', speed: 0.9, armor: true },
    ],
    intro: '평행판 구역(x = 22~44 m) 안에만 위쪽 전기장(20 N/C)이 있어요. + 입자는 위로, − 입자는 아래로 힘을 받아요. 구역을 나오면 다시 중력만 작용해요.',
    hint: '구역 안에서 + 입자의 수직 가속도: 20 − 10 = +10 m/s² (위쪽!). − 입자는 −20 − 10 = −30 m/s² (아래쪽).',
    ask: '+ 입자가 구역을 지날 때 포물선이 어느 쪽으로 휘었나요? 중력이 있는데도 위로 휘는 이유는?',
    note: '전기력이 중력보다 크면(qE > mg) 알짜 힘이 위쪽이라 + 입자는 구역 안에서 위로 휘어요. 구역 밖에서는 다시 중력만 작용해서 평소 포물선 운동이에요.' });

  add({ id: '4-3', name: '무중력 정거장', env: { g: 0, k: 0, wind: 0, field: { x0: 22, x1: 46, y0: 0, y1: 40, ex: 0, ey: -15 } },
    charge: { m: 1, q: 1, label: '평행판 사이 E = 15 N/C, 아래쪽 ↓' },
    v: { min: 10, max: 40, init: 25 }, angle: { min: 5, max: 85, init: 30 },
    preview: { mode: 'none', dots: 0 }, ammo: 12, hp: 3,
    spawns: [
      { t: 1, type: 'eagle', speed: 2.0, alt: 9 }, { t: 8, type: 'eagle', speed: 2.0, alt: 13 }, { t: 14, type: 'boar', speed: 0.9 },
      { t: 24, type: 'tiger', speed: 0.8, armor: true }, { t: 34, type: 'boar', speed: 0.9, armor: true },
    ],
    intro: '정거장은 중력이 없어요(g = 0). 입자는 평소엔 직선으로 날아요! 평행판 구역(아래쪽 전기장 15 N/C)에서만 휘어요. 점선도 없어요.',
    hint: '구역 밖: 등속 직선 운동. 구역 안: 수직 가속도 a = qE/m = ∓15 m/s² 인 포물선 운동. 나온 뒤에는 다시 직선이에요.',
    ask: '구역을 지난 뒤 입자는 어떻게 움직였나요? 나온 순간의 속도 방향으로 계속 직선으로 갔나요?',
    note: '힘이 작용할 때만 속도가 변해요(뉴턴 제1법칙). 구역을 벗어난 입자는 나올 때의 속도로 등속 직선 운동을 해요. 지면에 있는 적은 전기장으로 아래로 꺾어서 맞혀야 해요.' });

  S.forEach(s => { s.par = s.spawns.reduce((n, e) => n + VD.ENEMY[e.type].hp, 0) + 2; });
  VD.STAGES = S;
  VD.stageById = id => S.find(s => s.id === id);
  if (typeof module !== 'undefined') module.exports = VD;
})(typeof window !== 'undefined' ? window : globalThis);
