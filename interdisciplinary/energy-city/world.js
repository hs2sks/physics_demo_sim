// world.js — 에너지 도시의 3D 장면(지형·자연·발전소·전선·겹쳐보기·주민 반응). 규칙은 engine.js가 맡는다.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as E from './engine.js';

const LAND_Y = 0.25;
const X = c => c - 4.5, Zc = r => r - 4.5;
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

// ── 재료·도형 캐시 ───────────────────────────────────
const mats = new Map(), geos = new Map();
const mat = (color, o = {}) => {
  const k = color + JSON.stringify(o);
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: .85, metalness: 0, flatShading: true, ...o }));
  return mats.get(k);
};
const geo = (key, make) => { if (!geos.has(key)) geos.set(key, make()); return geos.get(key); };
const shade = m => { m.castShadow = true; m.receiveShadow = true; return m; };
const bx = (w, h, d, color, x = 0, y = 0, z = 0, o) => {
  const m = shade(new THREE.Mesh(geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), mat(color, o)));
  m.position.set(x, y + h / 2, z); return m;
};
const cyl = (r1, r2, h, color, x = 0, y = 0, z = 0, seg = 8, o) => {
  const m = shade(new THREE.Mesh(geo(`c${r1},${r2},${h},${seg}`, () => new THREE.CylinderGeometry(r1, r2, h, seg)), mat(color, o)));
  m.position.set(x, y + h / 2, z); return m;
};
const cone = (r, h, color, x = 0, y = 0, z = 0, seg = 6, o) => {
  const m = shade(new THREE.Mesh(geo(`k${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg)), mat(color, o)));
  m.position.set(x, y + h / 2, z); return m;
};
const ball = (r, color, x = 0, y = 0, z = 0, o) => {
  const m = shade(new THREE.Mesh(geo(`s${r}`, () => new THREE.SphereGeometry(r, 10, 8)), mat(color, o)));
  m.position.set(x, y, z); return m;
};

// ── 자연 요소 ───────────────────────────────────────
function tree(x, z, s = 1, color = 0x3f8f45) {
  const g = new THREE.Group();
  g.add(cyl(.025 * s, .03 * s, .1 * s, 0x7a5532, 0, 0, 0, 5));
  g.add(cone(.13 * s, .26 * s, color, 0, .08 * s, 0, 6));
  g.add(cone(.1 * s, .22 * s, color, 0, .22 * s, 0, 6));
  g.position.set(x, 0, z); return g;
}
function mountain(rand) {
  const g = new THREE.Group(), n = 2 + (rand() > .5 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const h = .75 + rand() * .55, r = .3 + rand() * .15, x = (rand() - .5) * .45, z = (rand() - .5) * .45;
    g.add(cone(r, h, i % 2 ? 0x56824c : 0x3f6e43, x, 0, z, 6));
    g.add(cone(r * .42, h * .3, 0xf4f7fa, x, h * .72, z, 6));
  }
  return g;
}
function pumpjack(offshore, anims) {
  const g = new THREE.Group();
  if (offshore) {
    g.add(bx(.62, .05, .62, 0x4b5560, 0, .32, 0));
    for (const [x, z] of [[-.25, -.25], [.25, -.25], [-.25, .25], [.25, .25]]) g.add(cyl(.03, .03, .45, 0x2f3841, x, -.1, z, 6));
    g.add(cone(.14, .45, 0xc0392b, 0, .37, 0, 4));
    g.add(bx(.16, .1, .16, 0xe9b03a, .17, .37, .15));
    const fl = ball(.04, 0xff9a2e, -.2, .85, -.2, { emissive: 0xff7a00, emissiveIntensity: 1 }); g.add(fl);
    anims.push((dt, t) => { fl.scale.setScalar(1 + .25 * Math.sin(t * 9)); });
  } else {
    g.add(bx(.46, .05, .5, 0x56606a, 0, 0, 0));
    g.add(bx(.12, .12, .16, 0xe9b03a, -.1, .05, 0));
    const beam = new THREE.Group();
    beam.add(bx(.55, .045, .06, 0xc0392b, 0, 0, 0));
    beam.add(cyl(.06, .06, .07, 0x2f3841, .26, -.03, 0, 6)).rotation.x = Math.PI / 2;
    beam.position.set(0, .34, 0); g.add(beam);
    g.add(bx(.05, .3, .05, 0x56606a, 0, .05, .1)); g.add(bx(.05, .3, .05, 0x56606a, 0, .05, -.1));
    g.add(cyl(.012, .012, .26, 0x1c1c1c, .26, .06, 0, 4));
    anims.push((dt, t) => { beam.rotation.z = .28 * Math.sin(t * 1.8); });
  }
  return g;
}
function ziggurat() {
  const g = new THREE.Group();
  [[.72, .0], [.56, .12], [.4, .24], [.25, .36]].forEach(([w, y], i) => g.add(bx(w, .12, w, i % 2 ? 0xb88e55 : 0xd2ad74, 0, y, 0)));
  g.add(bx(.09, .12, .09, 0xf2c94c, 0, .48, 0, { emissive: 0x7a5c00, emissiveIntensity: .5 }));
  return g;
}
function farm(rand) {
  const g = new THREE.Group();
  g.add(bx(.92, .02, .92, 0xb9c36a, 0, 0, 0));
  for (let i = 0; i < 4; i++) g.add(bx(.8, .05, .1, i % 2 ? 0xe0c84d : 0x78b43a, 0, .02, -.34 + i * .17 + (i > 1 ? .08 : 0)));
  const t = new THREE.Group();
  t.add(cyl(.02, .025, .09, 0x7a5532, 0, 0, 0, 5)); t.add(ball(.11, 0x4f9f3a, 0, .17, 0));
  for (let i = 0; i < 3; i++) t.add(ball(.025, 0xf08a24, (rand() - .5) * .14, .17 + (rand() - .5) * .12, .1));
  t.position.set(.3, 0, .32); g.add(t);
  return g;
}
function houses(color, rand) {
  const g = new THREE.Group();
  [[-.24, -.16, .26], [.2, -.22, .22], [.0, .22, .27], [-.3, .25, .18]].forEach(([x, z, s]) => {
    const h = new THREE.Group();
    h.add(bx(s, s * .75, s * .9, 0xf4e3c1, 0, 0, 0));
    const roof = cone(s * .78, s * .55, color, 0, s * .75, 0, 4); roof.rotation.y = Math.PI / 4; h.add(roof);
    h.add(bx(s * .22, s * .35, .01, 0x6a4a2a, 0, 0, s * .45 + .005));
    h.position.set(x, 0, z); h.rotation.y = (rand() - .5) * .6; g.add(h);
  });
  g.add(cyl(.012, .012, .5, 0xdddddd, .38, 0, -.35, 4));
  const flag = bx(.2, .12, .01, color, .48, .36, -.35); g.add(flag);
  return g;
}

// ── 동물 ────────────────────────────────────────────
function birds(rand, anims) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Group(), l = bx(.07, .01, .03, 0x3a4252, -.035, 0, 0), r = bx(.07, .01, .03, 0x3a4252, .035, 0, 0);
    l.geometry = r.geometry; b.add(l, r); g.add(b);
    const R = .22 + i * .08, ph = rand() * 6.28, sp = .9 + rand() * .5, y = .55 + i * .12;
    anims.push((dt, t) => {
      const a = ph + t * sp; b.position.set(Math.cos(a) * R, y + Math.sin(t * 2 + ph) * .04, Math.sin(a) * R);
      b.rotation.y = -a; const f = Math.sin(t * 12 + ph) * .5; l.rotation.z = f; r.rotation.z = -f;
    });
  }
  return g;
}
function deer(x, z, ry) {
  const g = new THREE.Group(), c = 0x8b5a2b;
  g.add(bx(.2, .1, .08, c, 0, .12, 0));
  for (const [lx, lz] of [[-.07, -.025], [-.07, .025], [.07, -.025], [.07, .025]]) g.add(bx(.02, .12, .02, 0x6e4620, lx, 0, lz));
  g.add(bx(.04, .1, .04, c, .11, .2, 0)); g.add(bx(.09, .05, .05, c, .15, .27, 0));
  g.add(bx(.01, .06, .01, 0x4a3015, .16, .31, .015)); g.add(bx(.01, .06, .01, 0x4a3015, .16, .31, -.015));
  g.position.set(x, 0, z); g.rotation.y = ry; return g;
}
function whale(rand, anims) {
  const g = new THREE.Group(), body = new THREE.Group();
  const b = shade(new THREE.Mesh(geo('whale', () => new THREE.SphereGeometry(.5, 12, 8)), mat(0x24456b))); b.scale.set(.55, .24, .22); body.add(b);
  const belly = shade(new THREE.Mesh(b.geometry, mat(0xcfe4f2))); belly.scale.set(.5, .15, .19); belly.position.y = -.05; body.add(belly);
  body.add(bx(.04, .03, .2, 0x24456b, -.3, .0, 0).rotateZ(.35)); body.add(bx(.04, .03, .2, 0x24456b, -.34, .05, 0).rotateZ(.35));
  g.add(body);
  const spout = ball(.03, 0xffffff, .2, .12, 0, { transparent: true, opacity: .8 }); g.add(spout);
  const ph = rand() * 6, R = .12;
  anims.push((dt, t) => {
    const a = ph + t * .35; body.position.set(Math.cos(a) * R, .02 + Math.sin(t * 1.2 + ph) * .035, Math.sin(a) * R);
    body.rotation.y = -a + Math.PI / 2; body.rotation.z = Math.sin(t * 1.2 + ph) * .05;
    const s = (t * .5 + ph) % 3; spout.visible = s < .9; spout.position.set(body.position.x + .13, .1 + s * .22, body.position.z); spout.scale.setScalar(.5 + s * 1.3);
  });
  return g;
}
function fishing(rand, anims) {
  const g = new THREE.Group();
  const boat = new THREE.Group();
  boat.add(bx(.26, .06, .11, 0xc0392b, 0, 0, 0)); boat.add(bx(.1, .09, .08, 0xf4f4f4, -.04, .06, 0)); boat.add(bx(.12, .015, .1, 0x2f3841, -.04, .15, 0));
  g.add(boat);
  const fish = [];
  for (let i = 0; i < 5; i++) { const f = cone(.025, .09, 0x9fb7c9, 0, 0, 0, 4); f.rotation.z = -Math.PI / 2; const w = new THREE.Group(); w.add(f); g.add(w); fish.push(w); }
  const ph = rand() * 6;
  anims.push((dt, t) => {
    boat.position.set(Math.sin(t * .4 + ph) * .1 - .12, .02 + Math.sin(t * 1.6 + ph) * .02, .18); boat.rotation.z = Math.sin(t * 1.6 + ph) * .06;
    fish.forEach((w, i) => { const a = t * (.9 + i * .07) + i * 1.3 + ph, R = .16 + (i % 3) * .06; w.position.set(Math.cos(a) * R + .1, .03, Math.sin(a) * R - .12); w.rotation.y = -a; });
  });
  return g;
}

// ── 발전소 모델 ─────────────────────────────────────
const SMOKE_GEO = () => new THREE.SphereGeometry(1, 8, 6);
function puffs(g, anims, n, color, spots, wind, rise) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo('puff', SMOKE_GEO), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .6, depthWrite: false }));
    g.add(m); list.push(m);
  }
  anims.push((dt, t) => list.forEach((m, i) => {
    const sp = spots[i % spots.length], k = ((t * .35 + i / n) % 1);
    m.position.set(sp[0] + wind[1] * k * 1.1, sp[1] + k * rise, sp[2] + wind[0] * k * 1.1);
    m.scale.setScalar(.05 + k * .13); m.material.opacity = .65 * (1 - k);
  }));
}
export function buildPlant(type, ctx) {
  const g = new THREE.Group(), anims = [], wind = ctx.wind || [1, 0];
  const sea = ctx.sea;
  if (type === 'fossil') {
    g.add(bx(.86, .06, .86, 0x5d6770, 0, 0, 0));
    g.add(bx(.55, .28, .38, 0x8d98a3, -.08, .06, .16)); g.add(bx(.3, .42, .26, 0x6e7b87, .22, .06, .12));
    g.add(bx(.55, .04, .38, 0xb8c0c8, -.08, .34, .16));
    const c1 = cyl(.05, .065, .6, 0xb8433a, -.2, .06, -.22, 8), c2 = cyl(.05, .065, .5, 0xf1f1f1, .06, .06, -.26, 8);
    g.add(c1, c2); g.add(cyl(.052, .052, .06, 0x1c1c1c, -.2, .6, -.22, 8), cyl(.052, .052, .06, 0x1c1c1c, .06, .5, -.26, 8));
    puffs(g, anims, 10, 0x5a5a5a, [[-.2, .7, -.22], [.06, .6, -.26]], wind, .9);
  } else if (type === 'nuclear') {
    g.add(bx(.92, .06, .92, 0x6b7782, 0, 0, 0));
    const pts = [[.2, 0], [.18, .16], [.13, .42], [.115, .58], [.14, .78]].map(p => new THREE.Vector2(p[0], p[1]));
    const lg = geo('tower', () => new THREE.LatheGeometry(pts, 14));
    for (const x of [-.22, .22]) { const t = shade(new THREE.Mesh(lg, mat(0xe3e7ea, { side: THREE.DoubleSide }))); t.position.set(x, .06, -.2); g.add(t); }
    g.add(cyl(.2, .2, .2, 0xcdd5db, 0, .06, .2, 14));
    const dome = shade(new THREE.Mesh(geo('dome', () => new THREE.SphereGeometry(.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)), mat(0xd9e0e5))); dome.position.set(0, .26, .2); g.add(dome);
    g.add(bx(.5, .12, .16, 0xaeb8c1, 0, .06, -.02));
    const sign = cyl(.07, .07, .012, 0xf5d000, 0, .2, .405, 16, { emissive: 0x6b5c00, emissiveIntensity: .4 }); sign.rotation.x = Math.PI / 2; g.add(sign);
    puffs(g, anims, 10, 0xffffff, [[-.22, .85, -.2], [.22, .85, -.2]], wind, .8);
  } else if (type === 'wind') {
    if (sea) { g.add(cyl(.2, .22, .16, 0xe8c22e, 0, -.08, 0, 10)); } else g.add(cyl(.2, .22, .04, 0x69737d, 0, 0, 0, 10));
    g.add(cyl(.025, .05, .85, 0xf4f4f4, 0, .02, 0, 8));
    const head = new THREE.Group(); head.position.y = .88;
    head.add(bx(.1, .09, .22, 0xe8ecef, 0, -.045, -.03));
    const rotor = new THREE.Group(); rotor.position.z = .1;
    rotor.add(ball(.04, 0xd9dde0, 0, 0, 0));
    for (let i = 0; i < 3; i++) { const a = new THREE.Group(); const bl = bx(.055, .42, .012, 0xf7f7f7, 0, .02, 0); a.add(bl); a.rotation.z = i * 2.094; rotor.add(a); }
    head.add(rotor); g.add(head);
    head.rotation.y = Math.atan2(-wind[1], -wind[0]);
    const w = ctx.speed || 10;
    anims.push((dt, t) => { rotor.rotation.z -= dt * (.6 + w / 20 * 3.6); });
  } else { // solar
    if (sea) g.add(bx(.92, .08, .92, 0xd0d7dd, 0, -.04, 0)); else g.add(bx(.86, .04, .86, 0x69737d, 0, 0, 0));
    const tex = panelTex();
    for (const x of [-.21, .21]) for (const z of [-.2, .22]) {
      const p = new THREE.Group();
      p.add(cyl(.012, .012, .12, 0x8a949e, 0, 0, .0, 5));
      const pane = shade(new THREE.Mesh(geo('pane', () => new THREE.BoxGeometry(.36, .018, .34)), new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, roughness: .35, metalness: .3 })));
      pane.position.y = .13; pane.rotation.x = -.5; p.add(pane); p.position.set(x, .04, z); g.add(p);
    }
  }
  return { group: g, anims };
}
let _panelTex;
function panelTex() {
  if (_panelTex) return _panelTex;
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  x.fillStyle = '#1d4a8f'; x.fillRect(0, 0, 64, 64); x.strokeStyle = '#8fb4e8'; x.lineWidth = 2;
  for (let i = 0; i <= 64; i += 21) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 64); x.moveTo(0, i); x.lineTo(64, i); x.stroke(); }
  _panelTex = new THREE.CanvasTexture(c); _panelTex.colorSpace = THREE.SRGBColorSpace; return _panelTex;
}

// ── 글자 표지판 ─────────────────────────────────────
function signTex(text, bg, fg = '#fff') {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, 128, 64); x.strokeStyle = '#fff'; x.lineWidth = 5; x.strokeRect(3, 3, 122, 58);
  x.fillStyle = fg; x.font = 'bold 34px "Noto Sans CJK KR","Malgun Gothic",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 64, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ── 세계 ────────────────────────────────────────────
export function createWorld(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; 
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, .1, 120);
  camera.position.set(0, 12.5, 13.5);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = .09; controls.maxPolarAngle = 1.38; controls.minDistance = 4; controls.maxDistance = 24;
  controls.target.set(0, 0, 0); controls.update();

  scene.add(new THREE.HemisphereLight(0xdff1ff, 0x5b7a4a, 1.0));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.1); sun.position.set(-6, 12, 7); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 }); sun.shadow.bias = -.0006;
  scene.add(sun);

  const anims = [];      // 항상 도는 장난감 움직임
  const deco = {};       // 칸 이름 → 그 칸의 자연 요소 그룹(발전소를 지으면 숨김)
  const root = new THREE.Group(); scene.add(root);

  // 바다
  const deep = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0x0c4f86 }));
  deep.rotation.x = -Math.PI / 2; deep.position.y = -.4; root.add(deep);
  for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) if (!E.isLand(r, c)) {
    let near = 9; for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) if (E.inb(r + a, c + b) && E.isLand(r + a, c + b)) near = Math.min(near, Math.max(Math.abs(a), Math.abs(b)));
    const tile = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: near <= 1 ? 0x5fd3f2 : near === 2 ? 0x34b0ea : 0x1f8fd6 }));
    tile.rotation.x = -Math.PI / 2; tile.position.set(X(c), -.15, Zc(r)); root.add(tile);
  }
  const water = new THREE.Mesh(new THREE.PlaneGeometry(16, 16, 56, 56), new THREE.MeshStandardMaterial({ color: 0x57c5f5, transparent: true, opacity: .55, roughness: .25, metalness: .1, flatShading: true }));
  water.rotation.x = -Math.PI / 2; water.position.y = .0; root.add(water);
  const wpos = water.geometry.attributes.position, w0 = Float32Array.from(wpos.array);
  anims.push((dt, t) => {
    for (let i = 0; i < wpos.count; i++) { const x = w0[i * 3], y = w0[i * 3 + 1]; wpos.setZ(i, Math.sin(x * 1.3 + t * 1.1) * .018 + Math.cos(y * 1.6 + t * .9) * .018); }
    wpos.needsUpdate = true;
  });

  // 땅과 자연
  const villageIds = E.VILLAGES.map(v => E.name(v.r, v.c));
  const side = 0x8a6a45;
  for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) {
    if (!E.isLand(r, c)) continue;
    const nm = E.name(r, c), f = E.featAt(r, c), vi = E.villageAt(r, c), rand = rng(r * 31 + c * 7 + 5);
    const top = f === 'farm' ? 0xb9c36a : f === 'mountain' ? 0x6f9a56 : (r + c) % 2 ? 0x8fc96b : 0x86c062;
    const topMat = mat(vi >= 0 ? 0xa4d97a : top), sideMat = mat(side);
    const block = new THREE.Mesh(new THREE.BoxGeometry(1, .55, 1), [sideMat, sideMat, topMat, sideMat, sideMat, sideMat]);
    block.position.set(X(c), LAND_Y - .275, Zc(r)); block.receiveShadow = true; root.add(block);
    const grp = new THREE.Group(); grp.position.set(X(c), LAND_Y, Zc(r)); root.add(grp); deco[nm] = grp;
    if (vi >= 0) {
      const tile = bx(.96, .012, .96, E.VILLAGES[vi].color, 0, 0, 0, { transparent: true, opacity: .4 }); grp.add(tile);
      grp.add(houses(new THREE.Color(E.VILLAGES[vi].color).getHex(), rand)); continue;
    }
    if (f === 'mountain') grp.add(mountain(rand));
    else if (f === 'lake') { grp.add(bx(1, .02, 1, 0x3eb6f0, 0, .002, 0, { emissive: 0x0d4a70, emissiveIntensity: .35 })); grp.position.y = LAND_Y; }
    else if (f === 'oil') grp.add(pumpjack(false, anims));
    else if (f === 'culture') grp.add(ziggurat());
    else if (f === 'birds') { grp.add(birds(rand, anims)); if (rand() > .3) grp.add(tree(.3, -.25, .8)); }
    else if (f === 'deer') { grp.add(deer(-.15, .1, 1.2)); grp.add(deer(.2, -.2, -.6)); }
    else if (f === 'farm') grp.add(farm(rand));
    else { const n = rand() < .45 ? 2 : rand() < .6 ? 1 : 0; for (let i = 0; i < n; i++) grp.add(tree((rand() - .5) * .7, (rand() - .5) * .7, .8 + rand() * .5, rand() > .5 ? 0x3f8f45 : 0x4ea04f)); }
  }
  // 바다 자연(고래·물고기·해상 유전)
  for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) {
    if (E.isLand(r, c)) continue;
    const nm = E.name(r, c), f = E.featAt(r, c), rand = rng(r * 17 + c * 3 + 1);
    const grp = new THREE.Group(); grp.position.set(X(c), 0, Zc(r)); root.add(grp); deco[nm] = grp;
    if (f === 'whale') grp.add(whale(rand, anims));
    else if (f === 'fish') grp.add(fishing(rand, anims));
    else if (f === 'oil') grp.add(pumpjack(true, anims));
  }
  // 바둑판 선과 테두리
  const lp = []; for (let i = 0; i <= 10; i++) { lp.push(i - 5, .27, -5, i - 5, .27, 5, -5, .27, i - 5, 5, .27, i - 5); }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  root.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .28 })));
  for (const [w, d, x, z] of [[10.5, .25, 0, -5.12], [10.5, .25, 0, 5.12], [.25, 10, -5.12, 0], [.25, 10, 5.12, 0]]) {
    const f = bx(w, .4, d, 0x12294a, x, -.25, z); root.add(f);
  }

  // ── 발전소 ──
  const plantObjs = new Map(); // id → {group, anims, born}
  const fx = [];               // 짓는 먼지
  function setPlants(plants) {
    const ids = new Set(plants.map(p => p.id));
    for (const [id, o] of plantObjs) if (!ids.has(id)) {
      root.remove(o.group); plantObjs.delete(id);
      if (deco[o.cell]) deco[o.cell].visible = true;
    }
    for (const p of plants) {
      if (plantObjs.has(p.id)) continue;
      const nm = E.name(p.r, p.c), sea = !E.isLand(p.r, p.c), lake = E.featAt(p.r, p.c) === 'lake';
      const m = buildPlant(p.type, { wind: E.windVec(p.r, p.c), sea, speed: E.SPEED[p.r][p.c] });
      const g = m.group; g.position.set(X(p.c), sea ? 0 : lake ? LAND_Y + .02 : LAND_Y, Zc(p.r)); g.scale.setScalar(.01);
      root.add(g);
      plantObjs.set(p.id, { group: g, anims: m.anims, born: performance.now() / 1000, cell: nm, sea });
      if (deco[nm]) deco[nm].visible = false;
      for (let i = 0; i < 8; i++) {
        const d = new THREE.Mesh(geo('puff', SMOKE_GEO), new THREE.MeshBasicMaterial({ color: 0xd8cdb8, transparent: true, opacity: .8, depthWrite: false }));
        d.position.copy(g.position); d.position.y += .12; fx.push({ m: d, a: i / 8 * 6.283, t0: performance.now() / 1000 }); root.add(d);
      }
    }
  }

  // ── 전선 ──
  const wireGroup = new THREE.Group(); root.add(wireGroup);
  const pulses = [];
  function setWires(list, plants) {
    wireGroup.clear(); pulses.length = 0;
    for (const w of list) {
      const p = plants.find(q => q.id === w.plant); if (!p || !w.cells.length) continue;
      const col = new THREE.Color(E.VILLAGES[w.village].color).lerp(new THREE.Color(0xffffff), .35).getHex();
      const pts = [new THREE.Vector3(X(p.c), 0, Zc(p.r)), ...w.cells.map(([r, c]) => new THREE.Vector3(X(c), 0, Zc(r)))];
      pts.forEach((v, i) => { const [r, c] = i === 0 ? [p.r, p.c] : w.cells[i - 1]; v.y = E.isLand(r, c) ? LAND_Y + .38 : .22; });
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], len = a.distanceTo(b), m = shade(new THREE.Mesh(geo('wire', () => new THREE.BoxGeometry(1, .035, .035)), mat(col, { emissive: col, emissiveIntensity: .35 })));
        m.scale.x = len + .035; m.position.copy(a).add(b).multiplyScalar(.5);
        if (Math.abs(b.z - a.z) > .01) m.rotation.y = Math.PI / 2; wireGroup.add(m);
        if (i > 1 || true) {
          const [r, c] = w.cells[i - 1], onLand = E.isLand(r, c);
          if (i < pts.length - 1) wireGroup.add(onLand ? cyl(.012, .016, .38, 0x6b4f2c, b.x, LAND_Y, b.z, 5) : ball(.05, 0xf39c12, b.x, .16, b.z));
        }
      }
      const total = pts.reduce((s, v, i) => i ? s + v.distanceTo(pts[i - 1]) : 0, 0), n = Math.max(1, Math.round(total / 2.2));
      for (let k = 0; k < n; k++) {
        const s = new THREE.Mesh(geo('puff', SMOKE_GEO), new THREE.MeshBasicMaterial({ color: 0xfff2a8 }));
        s.scale.setScalar(.045); wireGroup.add(s); pulses.push({ m: s, pts, total, off: k / n, sp: .45 });
      }
    }
  }
  anims.push((dt, t) => {
    for (const p of pulses) {
      let d = ((t * p.sp + p.off * p.total / 1) % p.total + p.total) % p.total, i = 1;
      while (i < p.pts.length - 1 && d > p.pts[i].distanceTo(p.pts[i - 1])) { d -= p.pts[i].distanceTo(p.pts[i - 1]); i++; }
      const a = p.pts[i - 1], b = p.pts[i], f = d / Math.max(.001, a.distanceTo(b));
      p.m.position.lerpVectors(a, b, Math.min(1, f));
    }
  });

  // ── 겹쳐 보기(일사량·바람·해류·미세먼지·사고) ──
  const OC = document.createElement('canvas'); OC.width = OC.height = 1000;
  const octx = OC.getContext('2d'), otex = new THREE.CanvasTexture(OC); otex.colorSpace = THREE.SRGBColorSpace;
  const overlay = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ map: otex, transparent: true, depthWrite: false, opacity: 1 }));
  overlay.rotation.x = -Math.PI / 2; overlay.position.y = .31; overlay.renderOrder = 3; overlay.visible = false; root.add(overlay);
  const SUNC = { 5: '#ff6b78', 10: '#ff3f4d', 15: '#c1000e', 20: '#99001d' }, WINDC = { 20: '#00002f', 15: '#1414ff', 10: '#4a72ff', 5: '#9ecbff' };
  const arrow = (x, y, dx, dy, s, col) => {
    const a = Math.atan2(dy, dx); octx.save(); octx.translate(x, y); octx.rotate(a); octx.fillStyle = col;
    octx.beginPath(); octx.moveTo(s, 0); octx.lineTo(0, -s * .62); octx.lineTo(0, -s * .22); octx.lineTo(-s, -s * .22); octx.lineTo(-s, s * .22); octx.lineTo(0, s * .22); octx.lineTo(0, s * .62); octx.closePath(); octx.fill(); octx.restore();
  };
  let overlayKind = 'none';
  function setOverlay(kind, grid) {
    overlayKind = kind; overlay.visible = kind !== 'none'; if (kind === 'none') return;
    octx.clearRect(0, 0, 1000, 1000); octx.textAlign = 'center'; octx.textBaseline = 'middle';
    for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) {
      const x = c * 100, y = r * 100, cx = x + 50, cy = y + 50;
      if (kind === 'sun') {
        octx.fillStyle = SUNC[E.SUN[r]]; octx.globalAlpha = .72; octx.fillRect(x + 2, y + 2, 96, 96); octx.globalAlpha = 1;
        octx.fillStyle = '#fff'; octx.font = 'bold 34px sans-serif'; octx.fillText(E.SUN[r], cx, cy);
      } else if (kind === 'wind') {
        const v = E.SPEED[r][c]; octx.fillStyle = WINDC[v]; octx.globalAlpha = .75; octx.fillRect(x + 2, y + 2, 96, 96); octx.globalAlpha = 1;
        const d = E.windVec(r, c); arrow(cx, cy - 8, d[1], d[0], 24, v === 5 ? '#16315a' : '#fff');
        octx.fillStyle = v === 5 ? '#16315a' : '#fff'; octx.font = 'bold 24px sans-serif'; octx.fillText(v, cx, cy + 32);
      } else if (kind === 'cur') {
        const ds = E.curDirs(r, c); if (!ds.length) continue;
        octx.fillStyle = 'rgba(0,10,60,.55)'; octx.fillRect(x + 2, y + 2, 96, 96);
        const V = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
        ds.forEach((ch, i) => { const o = ds.length > 1 ? (i ? 18 : -18) : 0; arrow(cx + (ch === 'N' || ch === 'S' ? o : 0), cy + (ch === 'E' || ch === 'W' ? o : 0), V[ch][0], V[ch][1], 26, '#bfeaff'); });
      } else if (grid) {
        const v = Math.min(1, grid[r][c]); if (v < .04) continue;
        octx.fillStyle = kind === 'air' ? `rgba(70,55,40,${Math.min(.85, .15 + v * .75)})` : `rgba(${130 + v * 100},40,${200 - v * 60},${Math.min(.85, .15 + v * .75)})`;
        octx.fillRect(x + 2, y + 2, 96, 96);
        if (v >= .12) { octx.fillStyle = '#fff'; octx.font = 'bold 26px sans-serif'; octx.fillText(Math.round(v * 100) + '%', cx, cy); }
      }
    }
    otex.needsUpdate = true;
  }

  // ── 커서·유령 ──
  const cursor = new THREE.Mesh(new THREE.PlaneGeometry(.96, .96), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .35, depthWrite: false }));
  cursor.rotation.x = -Math.PI / 2; cursor.position.y = .33; cursor.visible = false; cursor.renderOrder = 4; root.add(cursor);
  let ghost = null, ghostType = null;
  function setCursor(r, c, state) {
    if (r == null) { cursor.visible = false; if (ghost) ghost.visible = false; return; }
    cursor.visible = true; cursor.position.x = X(c); cursor.position.z = Zc(r);
    cursor.material.color.set(state === 'ok' ? 0x4cd964 : state === 'bad' ? 0xff4d4d : 0xffffff);
    cursor.material.opacity = state ? .5 : .3;
  }
  function setGhost(type, r, c) {
    if (!type || r == null) { if (ghost) ghost.visible = false; return; }
    if (ghostType !== type || !ghost) {
      if (ghost) root.remove(ghost);
      const b = buildPlant(type, { wind: [1, 0], sea: false, speed: 10 }).group;
      b.traverse(o => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = .6; o.castShadow = false; } });
      ghost = b; ghostType = type; root.add(ghost);
    }
    ghost.visible = true; const sea = !E.isLand(r, c);
    ghost.position.set(X(c), sea ? 0 : LAND_Y, Zc(r));
  }

  // ── 주민 반응 ──
  const crowd = new THREE.Group(); root.add(crowd);
  const crowdAnims = [];
  const SIGN = { cheer: ['환영!', '#2e9e4f'], ok: ['좋아요', '#3a8fb7'], idle: ['…', '#7c8590'], worry: ['걱정', '#d9a21b'], anger: ['반대!', '#c0392b'], riot: ['퇴진!', '#a1121f'] };
  function showReactions(list) {
    clearReactions();
    for (const it of list) {
      const cx = X(it.c), cz = Zc(it.r), n = it.cls === 'riot' ? 14 : it.cls === 'anger' ? 11 : 8, rand = rng(it.r * 13 + it.c * 5 + 2);
      const [txt, bg] = SIGN[it.cls] || SIGN.idle, tex = signTex(txt, bg);
      const ring = new THREE.Mesh(new THREE.RingGeometry(.62, .72, 32), new THREE.MeshBasicMaterial({ color: it.cls === 'cheer' || it.cls === 'ok' ? 0x4cd964 : it.cls === 'idle' ? 0xcfd8e0 : it.cls === 'worry' ? 0xf5c518 : 0xff3b30, transparent: true, opacity: .8, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(cx, LAND_Y + .04, cz); crowd.add(ring);
      crowdAnims.push((dt, t) => { const s = 1 + .08 * Math.sin(t * (it.cls === 'riot' ? 9 : 3)); ring.scale.setScalar(s); });
      for (let i = 0; i < n; i++) {
        const a = i / n * 6.283 + rand() * .3, R = .52 + rand() * .2, p = new THREE.Group();
        const col = [0xf2c8a0, 0xd8a67a, 0xf5d6b3][i % 3], shirt = [0x2e86de, 0xe55039, 0x78e08f, 0xfad390, 0x8e44ad][Math.floor(rand() * 5)];
        p.add(cyl(.045, .055, .13, shirt, 0, 0, 0, 6)); p.add(ball(.04, col, 0, .16, 0));
        const useSign = it.cls !== 'idle' && i % 2 === 0;
        let sg = null;
        if (useSign) {
          sg = new THREE.Mesh(new THREE.PlaneGeometry(.2, .1), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
          sg.position.set(0, .34, 0); p.add(sg); p.add(cyl(.004, .004, .2, 0xcccccc, 0, .14, 0, 3));
        }
        p.position.set(cx + Math.cos(a) * R, LAND_Y, cz + Math.sin(a) * R); p.rotation.y = -a + Math.PI / 2; crowd.add(p);
        const ph = rand() * 6, y0 = p.position.y, x0 = p.position.x;
        crowdAnims.push((dt, t) => {
          if (it.cls === 'cheer') p.position.y = y0 + Math.abs(Math.sin(t * 5 + ph)) * .12;
          else if (it.cls === 'ok') p.position.y = y0 + Math.abs(Math.sin(t * 2.2 + ph)) * .03;
          else if (it.cls === 'anger' || it.cls === 'riot') { p.position.y = y0 + Math.abs(Math.sin(t * (it.cls === 'riot' ? 8 : 5) + ph)) * .06; p.rotation.z = Math.sin(t * 9 + ph) * .09; if (sg) sg.rotation.z = Math.sin(t * 8 + ph) * .25; }
          else if (it.cls === 'worry') p.rotation.z = Math.sin(t * 2.5 + ph) * .06;
        });
      }
      if (it.cls === 'cheer') {
        const N = 40, g = new THREE.BufferGeometry(), pos = new Float32Array(N * 3), colr = new Float32Array(N * 3), sd = [];
        for (let i = 0; i < N; i++) { const c = new THREE.Color().setHSL(rand(), .9, .6); colr.set([c.r, c.g, c.b], i * 3); sd.push([rand(), (rand() - .5) * .8, (rand() - .5) * .8, rand() * 2]); }
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
        const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: .07, vertexColors: true })); pts.frustumCulled = false; crowd.add(pts);
        crowdAnims.push((dt, t) => { for (let i = 0; i < N; i++) { const k = ((t * .5 + sd[i][0]) % 1); pos[i * 3] = cx + sd[i][1] * (1 + k); pos[i * 3 + 1] = LAND_Y + 1.5 - k * 1.5 + Math.sin(k * 6 + sd[i][3]) * .08; pos[i * 3 + 2] = cz + sd[i][2] * (1 + k); } g.attributes.position.needsUpdate = true; });
      }
      if (it.cls === 'riot' || it.cls === 'anger') {
        for (let i = 0; i < 3; i++) {
          const m = new THREE.Mesh(geo('puff', SMOKE_GEO), new THREE.MeshBasicMaterial({ color: 0xff5a1f, transparent: true, opacity: .8, depthWrite: false })); crowd.add(m);
          const bx0 = cx + (i - 1) * .18, bz0 = cz - .1;
          crowdAnims.push((dt, t) => { const k = (t * .8 + i * .33) % 1; m.position.set(bx0 + Math.sin(t * 5 + i) * .03, LAND_Y + .1 + k * .35, bz0); m.scale.setScalar(.06 * (1 - k * .6)); m.material.opacity = .85 * (1 - k); });
        }
      }
    }
  }
  function clearReactions() { crowd.clear(); crowdAnims.length = 0; }

  // ── 카메라 이동·선택 ──
  let fly = null;
  function flyTo(pos, target, dur = 1.2) {
    fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: new THREE.Vector3(...pos), t1: new THREE.Vector3(...target), s: performance.now(), d: dur * 1000 };
  }
  const presets = {
    oblique: [[0, 12.5, 13.5], [0, 0, 0]], top: [[0, 19.5, 2.6], [0, 0, .3]],
  };
  function view(name, dx = 0, dz = 0) { const [p, t] = presets[name]; flyTo([p[0] + dx, p[1], p[2] + dz], [t[0] + dx, t[1], t[2] + dz], 1); }
  function focusCell(r, c, dist = 3.6, dx = 0) { flyTo([X(c) + .8 + dx, dist, Zc(r) + dist * .9], [X(c) + dx, .3, Zc(r)], 1.1); }

  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -LAND_Y), hit = new THREE.Vector3();
  function pick(cx, cy) {
    const rect = renderer.domElement.getBoundingClientRect(); if (cx < rect.left || cx > rect.right || cy < rect.top || cy > rect.bottom) return null;
    ray.setFromCamera(new THREE.Vector2((cx - rect.left) / rect.width * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1), camera);
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    const c = Math.floor(hit.x + 5), r = Math.floor(hit.z + 5); return E.inb(r, c) ? { r, c } : null;
  }
  const tmp = new THREE.Vector3();
  function project(r, c, h = 0) {
    tmp.set(X(c), h, Zc(r)).project(camera); const rect = renderer.domElement.getBoundingClientRect();
    return { x: (tmp.x * .5 + .5) * rect.width + rect.left, y: (-tmp.y * .5 + .5) * rect.height + rect.top, visible: tmp.z < 1 };
  }

  // ── 반복 ──
  function resize() {
    const w = container.clientWidth, h = container.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container); resize();
  let last = performance.now() / 1000, frameHooks = [];
  const clock = { t: 0 };
  function loop() {
    const now = performance.now() / 1000, dt = Math.min(.05, now - last); last = now; clock.t += dt; const t = clock.t;
    if (fly) {
      const k = Math.min(1, (performance.now() - fly.s) / fly.d), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      camera.position.lerpVectors(fly.p0, fly.p1, e); controls.target.lerpVectors(fly.t0, fly.t1, e); if (k >= 1) fly = null;
    }
    controls.target.x = Math.max(-6, Math.min(6, controls.target.x)); controls.target.z = Math.max(-6, Math.min(6, controls.target.z));
    controls.update();
    for (const a of anims) a(dt, t);
    for (const a of crowdAnims) a(dt, t);
    for (const [id, o] of plantObjs) {
      const age = now - o.born, k = Math.min(1, age / .7), s = k < 1 ? 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2) : 1;
      o.group.scale.setScalar(Math.max(.01, s)); for (const a of o.anims) a(dt, t);
      if (o.sea) o.group.position.y = Math.sin(t * 1.3 + o.group.position.x) * .018;
    }
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i], k = (now - f.t0) / 1.0;
      if (k >= 1) { root.remove(f.m); fx.splice(i, 1); continue; }
      f.m.position.x += Math.cos(f.a) * dt * .7; f.m.position.z += Math.sin(f.a) * dt * .7; f.m.position.y += dt * .25;
      f.m.scale.setScalar(.05 + k * .12); f.m.material.opacity = .8 * (1 - k);
    }
    renderer.render(scene, camera);
    for (const h of frameHooks) h(dt);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  return {
    THREE, scene, camera, controls, renderer, root, setPlants, setWires, setOverlay, setCursor, setGhost, pick, project, flyTo, view, focusCell,
    showReactions, clearReactions, onFrame: h => frameHooks.push(h), get overlayKind() { return overlayKind; },
    resize, X, Z: Zc, plantObj: id => plantObjs.get(id), deco,
  };
}
