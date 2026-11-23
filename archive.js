/* =========================================================
   Fragmented Archive — interactive 3D photography sculpture
   mountArchive(container, photos, opts) -> { destroy }
   ========================================================= */
import * as THREE from 'three';
import { RoomEnvironment } from './vendor/three/RoomEnvironment.js';
import { RoundedBoxGeometry } from './vendor/three/RoundedBoxGeometry.js';

const DEG = Math.PI / 180;
const ACCENT = new THREE.Color('#FF8A3D');

/* ---------- composition ----------
   Every fragment is built in its own local space and placed by pos/rot (deg).
   tube : open rectangular sleeve, axis = local Z, length L, section W x H.
          walls [top, bottom, right, left]; each is
          'p' photo outside, 'pp' photo both sides, 'g' glass, 'm' graphite, 0 none.
   slab : thick panel w x h x d; front/back 'p' or 'm'.
   block: solid graphite prism.
   Proportions are kept near 3:2 / 2:3 so most photos sit almost full-bleed. */
const PIECES = [
  // central core
  { t: 'tube',  pos: [0.05, 0.15, 0.0],   rot: [0, 0, 0],      L: 2.4, W: 1.6, H: 1.6, walls: ['pp', 'p', 'pp', 'g'] },
  { t: 'tube',  pos: [0.95, 0.55, 0.55],  rot: [90, 0, 22],    L: 2.4, W: 1.6, H: 1.07, walls: ['p', 'g', 'pp', 'p'] },
  { t: 'tube',  pos: [-1.25, -0.55, 0.7], rot: [-8, 38, -18],  L: 2.1, W: 1.4, H: 0.93, walls: ['p', 'p', 'g', 'pp'] },
  // upper arm, twisted
  { t: 'tube',  pos: [-0.45, 1.6, -0.35], rot: [0, -52, 14],   L: 1.95, W: 1.3, H: 0.87, walls: ['p', 'm', 'pp', 'p'] },
  { t: 'tube',  pos: [-1.05, 2.3, 0.55],  rot: [35, 10, -30],  L: 1.35, W: 0.9, H: 0.6, walls: ['p', 'g', 'p', 'p'] },
  { t: 'slab',  pos: [1.55, 1.75, -0.2],  rot: [4, -58, -12],  w: 1.1, h: 1.65, d: 0.07, front: 'p', back: 'p' },
  { t: 'slab',  pos: [0.3, 2.3, -0.95],   rot: [-35, 20, 8],   w: 1.5, h: 1.0, d: 0.06, front: 'p', back: 'p' },
  // lower arm
  { t: 'tube',  pos: [0.35, -1.45, -0.55], rot: [18, 28, 0],   L: 2.1, W: 1.4, H: 1.05, walls: ['m', 'p', 'pp', 'p'] },
  { t: 'tube',  pos: [1.45, -1.95, 0.55], rot: [0, -20, -35],  L: 1.5, W: 1.0, H: 0.67, walls: ['p', 'p', 'p', 'g'] },
  { t: 'slab',  pos: [1.85, -0.75, -0.35], rot: [-12, -32, 9], w: 1.95, h: 1.3, d: 0.08, front: 'p', back: 'p' },
  // fins that break the silhouette
  { t: 'slab',  pos: [-2.35, -0.55, 0.85], rot: [0, 60, -25],  w: 1.6, h: 1.07, d: 0.06, front: 'p', back: 'p' },
  { t: 'slab',  pos: [2.4, 0.65, 0.55],   rot: [10, -75, 30],  w: 1.4, h: 0.93, d: 0.06, front: 'p', back: 'p' },
  // left wing: tall sleeve
  { t: 'tube',  pos: [-2.05, 0.45, -0.55], rot: [90, 0, -14],  L: 2.25, W: 1.5, H: 0.75, walls: ['p', 'p', 'm', 'g'] },
  // back plane + glass shards
  { t: 'slab',  pos: [0.5, 0.35, -1.55],  rot: [0, 14, -5],    w: 2.4, h: 1.6, d: 0.06, front: 'p', back: 'p' },
  { t: 'glass', pos: [-0.35, -0.1, 1.45], rot: [0, -12, 7],    w: 1.9, h: 1.25 },
  { t: 'glass', pos: [1.25, 1.2, 1.15],   rot: [-20, 40, 15],  w: 1.2, h: 1.6 },
  { t: 'glass', pos: [-1.6, 1.2, -1.2],   rot: [15, 70, 0],    w: 1.5, h: 1.0 },
  // structural mass
  { t: 'block', pos: [-0.75, 1.0, -1.1],  rot: [0, 20, 0],     s: [1.3, 0.42, 0.85] },
  { t: 'block', pos: [0.55, -0.95, 1.05], rot: [0, -15, 0],    s: [0.55, 0.85, 1.25] },
  { t: 'block', pos: [-1.55, -1.35, -0.3], rot: [0, 30, 0],    s: [0.9, 0.36, 1.2] },
  { t: 'block', pos: [1.55, 0.25, -0.95], rot: [0, -20, 0],    s: [0.36, 1.5, 0.6] },
  // small top-left fragment
  { t: 'slab',  pos: [-1.95, 1.75, 0.45], rot: [-10, 48, -20], w: 1.05, h: 0.7, d: 0.06, front: 'p', back: 'p' },
];

const T = 0.045;          // wall thickness
const BORDER = 0.014;     // metal border around photographs
const MAT = 0.035;        // graphite margin between wall edge and photo

/* ---------- seeded random ---------- */
function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) { return false; }
}

export function mountArchive(container, photos, opts = {}) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const onOpen = opts.onOpen || function () {};
  const onReady = opts.onReady || function () {};

  /* ---------- renderer / scene ---------- */
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.75 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = !coarse;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = 'archive__canvas';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

  // restrained, warm key + cool rim
  scene.add(new THREE.HemisphereLight(0xf2e8dc, 0x131110, 0.35));
  const key = new THREE.DirectionalLight(0xffeedd, 1.6);
  key.position.set(-4, 6, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -4.5; key.shadow.camera.right = 4.5;
  key.shadow.camera.top = 4.5; key.shadow.camera.bottom = -4.5;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbcc8d6, 0.6);
  rim.position.set(5, 2, -6);
  scene.add(rim);

  /* ---------- materials ---------- */
  const M = {
    graphite: new THREE.MeshStandardMaterial({ color: 0x26231f, roughness: 0.55, metalness: 0.4, envMapIntensity: 0.7 }),
    inner:    new THREE.MeshStandardMaterial({ color: 0x1b1916, roughness: 0.7, metalness: 0.2 }),
    metal:    new THREE.MeshStandardMaterial({ color: 0xb8a994, roughness: 0.32, metalness: 1.0, envMapIntensity: 1.1 }),
    glass:    new THREE.MeshPhysicalMaterial({
      color: 0x2a2724, roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0.26,
      envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false,
      clearcoat: 1, clearcoatRoughness: 0.1
    }),
    edge:      new THREE.LineBasicMaterial({ color: 0xd8c8b3, transparent: true, opacity: 0.16 }),
    edgeGlass: new THREE.LineBasicMaterial({ color: 0xd8c8b3, transparent: true, opacity: 0.42 }),
  };

  /* ---------- groups ----------
     yawGroup  : idle rotation + drag + scroll
     tiltGroup : pointer-driven viewing angle
     sculpture : the static composition */
  const yawGroup = new THREE.Group();
  const tiltGroup = new THREE.Group();
  const sculpture = new THREE.Group();
  tiltGroup.add(sculpture);
  yawGroup.add(tiltGroup);
  scene.add(yawGroup);

  const slots = [];          // photographic faces
  const hitTargets = [];     // everything opaque, for occlusion-aware picking
  const geoCache = new Map();

  function roundedBox(w, h, d) {
    const k = [w, h, d].map(v => v.toFixed(3)).join('x');
    if (!geoCache.has(k)) geoCache.set(k, new RoundedBoxGeometry(w, h, d, 2, Math.min(0.016, d * 0.45)));
    return geoCache.get(k);
  }
  function edgesOf(w, h, d, mat) {
    return new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), mat);
  }

  /* A wall lies in its local XY plane, normal +Z. Faces get a "slot" that a
     photograph is fitted into later, once world orientation is known. */
  function makeWall(w, h, front, back, glass) {
    const g = new THREE.Group();
    if (glass) {
      const m = new THREE.Mesh(roundedBox(w, h, 0.02), M.glass);
      m.renderOrder = 2;
      g.add(m, edgesOf(w, h, 0.02, M.edgeGlass));
      return g;
    }
    const body = new THREE.Mesh(roundedBox(w, h, T), M.graphite);
    body.castShadow = body.receiveShadow = true;
    g.add(body, edgesOf(w, h, T, M.edge));
    hitTargets.push(body);
    [[front, 1], [back, -1]].forEach(([kind, side]) => {
      if (kind !== 'p') return;
      const slot = new THREE.Group();
      slot.position.z = side * (T / 2);
      if (side < 0) slot.rotation.y = Math.PI;
      g.add(slot);
      slots.push({ group: slot, w, h });
    });
    return g;
  }

  function place(obj, p) {
    obj.position.set(p.pos[0], p.pos[1], p.pos[2]);
    obj.rotation.set(p.rot[0] * DEG, p.rot[1] * DEG, p.rot[2] * DEG);
    sculpture.add(obj);
  }

  PIECES.forEach(p => {
    const o = new THREE.Group();
    if (p.t === 'tube') {
      const { L, W, H } = p;
      // [top, bottom, right, left]: width/height of each wall + transform
      const specs = [
        { w: W, h: L, pos: [0, H / 2, 0],  rot: [-90, 0, 0] },
        { w: W, h: L, pos: [0, -H / 2, 0], rot: [90, 0, 0] },
        { w: L, h: H, pos: [W / 2, 0, 0],  rot: [0, 90, 0] },
        { w: L, h: H, pos: [-W / 2, 0, 0], rot: [0, -90, 0] },
      ];
      specs.forEach((s, i) => {
        const kind = p.walls[i];
        if (!kind) return;
        // walls overlap at the corners by the thickness, like folded plate
        const wall = kind === 'g'
          ? makeWall(s.w, s.h, 0, 0, true)
          : makeWall(s.w + (i < 2 ? T : 0), s.h, kind[0] === 'p' ? 'p' : 0, kind === 'pp' ? 'p' : 0, false);
        if (kind === 'm') wall.children.forEach(c => { if (c.isMesh) c.material = M.graphite; });
        wall.position.set(...s.pos);
        wall.rotation.set(s.rot[0] * DEG, s.rot[1] * DEG, s.rot[2] * DEG);
        o.add(wall);
      });
    } else if (p.t === 'slab') {
      o.add(makeWall(p.w, p.h, p.front, p.back, false));
      // thicken: a slab is a wall with a deeper body
      const core = new THREE.Mesh(roundedBox(p.w - 0.04, p.h - 0.04, p.d), M.graphite);
      core.castShadow = core.receiveShadow = true;
      o.add(core);
      o.children[0].children.forEach(c => { if (c.type === 'Group') c.position.z = Math.sign(c.position.z) * (p.d / 2 + 0.002); });
    } else if (p.t === 'glass') {
      o.add(makeWall(p.w, p.h, 0, 0, true));
    } else if (p.t === 'block') {
      const [x, y, z] = p.s;
      const m = new THREE.Mesh(roundedBox(x, y, z), M.graphite);
      m.castShadow = m.receiveShadow = true;
      hitTargets.push(m);
      o.add(m, edgesOf(x, y, z, M.edge));
    }
    place(o, p);
  });

  /* ---------- fit photographs into slots ---------- */
  sculpture.updateMatrixWorld(true);
  const pool = photos.slice();
  const rand = rng(1211);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const used = new Set();
  const UP = new THREE.Vector3(0, 1, 0);
  const tmp = new THREE.Vector3();
  const q = new THREE.Quaternion();

  slots.forEach(slot => {
    // turn the photo in its face so "up" points as close to world-up as possible
    slot.group.getWorldQuaternion(q);
    const nrm = tmp.set(0, 0, 1).applyQuaternion(q).clone();
    let turn = 0;
    if (Math.abs(nrm.dot(UP)) < 0.85) {
      const axes = [[0, 1, 0, 0], [-1, 0, 0, 90], [0, -1, 0, 180], [1, 0, 0, -90]];
      let best = -2;
      axes.forEach(([x, y, z, a]) => {
        const d = tmp.set(x, y, z).applyQuaternion(q).dot(UP);
        if (d > best) { best = d; turn = a; }
      });
    }
    const side = (turn === 90 || turn === -90);
    const aw = (side ? slot.h : slot.w) - MAT * 2;
    const ah = (side ? slot.w : slot.h) - MAT * 2;
    const want = aw / ah;

    // closest aspect among a few unused candidates keeps it varied
    let pick = null, score = 1e9, seen = 0;
    for (let i = 0; i < pool.length && seen < 14; i++) {
      const ph = pool[i];
      if (used.has(ph)) continue;
      seen++;
      const a = ph.w / ph.h;
      const s = Math.abs(Math.log(a / want)) + rand() * 0.05;
      if (s < score) { score = s; pick = ph; }
    }
    if (!pick) return;
    used.add(pick);

    const a = pick.w / pick.h;
    let pw = aw, ph = aw / a;
    if (ph > ah) { ph = ah; pw = ah * a; }

    const holder = new THREE.Group();           // moves forward on hover
    holder.rotation.z = turn * DEG;
    slot.group.add(holder);

    const frameMat = M.metal.clone();
    frameMat.emissive = new THREE.Color(0x000000);
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(pw + BORDER * 2, ph + BORDER * 2), frameMat);
    frame.position.z = 0.0015;
    const photoMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL((pick.hue || 0) / 360, pick.bw ? 0 : 0.18, 0.16),
      roughness: 0.62, metalness: 0, envMapIntensity: 0.35,
      emissive: 0xffffff, emissiveIntensity: 0,
    });
    const photo = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), photoMat);
    photo.position.z = 0.003;
    photo.receiveShadow = true;
    holder.add(frame, photo);

    slot.photo = pick;
    slot.holder = holder;
    slot.frameMat = frameMat;
    slot.photoMat = photoMat;
    slot.mesh = photo;
    slot.hover = 0;
    photo.userData.slot = slot;
    frame.userData.slot = slot;
    hitTargets.push(photo, frame);
  });

  const live = slots.filter(s => s.photo);
  const list = live.map(s => s.photo);
  live.forEach((s, i) => { s.index = i; });

  /* ---------- lazy texture loading ---------- */
  const loader = new THREE.TextureLoader();
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  let loaded = 0;
  (function queue() {
    const order = live.slice();
    let active = 0, next = 0;
    function pump() {
      while (active < 6 && next < order.length) {
        const s = order[next++];
        active++;
        loader.load(s.photo.thumb || s.photo.src, tex => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = maxAniso;
          s.photoMat.map = tex;
          s.photoMat.emissiveMap = tex;
          s.photoMat.color.set(0xffffff);
          s.photoMat.needsUpdate = true;
          s.fadeIn = 0;
          active--; loaded++; pump();
          if (loaded === order.length) onReady(list.length);
        }, undefined, () => { active--; pump(); });
      }
    }
    pump();
  })();

  /* ---------- contact shadow ---------- */
  const sh = document.createElement('canvas');
  sh.width = sh.height = 256;
  const sctx = sh.getContext('2d');
  const grd = sctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)');
  grd.addColorStop(0.5, 'rgba(0,0,0,0.22)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  sctx.fillStyle = grd; sctx.fillRect(0, 0, 256, 256);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 7),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sh), transparent: true, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -2.95;
  shadow.scale.set(1, 0.55, 1);
  scene.add(shadow);

  /* ---------- sizing ---------- */
  const RADIUS = 3.6;
  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const fitH = RADIUS / Math.tan((camera.fov * DEG) / 2);
    const fitW = fitH / Math.min(1, camera.aspect);
    const dist = Math.max(fitH, fitW) * (w < 700 ? 0.9 : 1.1);
    camera.position.set(0, 0.35, dist);
    camera.lookAt(0, -0.1, 0);
    camera.updateProjectionMatrix();
    needsRender = true;
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  /* ---------- interaction state ---------- */
  const pointer = new THREE.Vector2(2, 2);
  const ray = new THREE.Raycaster();
  let px = 0, py = 0, spx = 0, spy = 0;    // pointer -1..1 (smoothed)
  let yaw = -0.5, yawVel = 0, dragging = false, dragX = 0, downX = 0, downY = 0, moved = 0;
  let hovered = null, pointerIn = false, needsRender = true;
  let scrollRef = window.scrollY;

  function setPointer(e) {
    const r = container.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    px = pointer.x; py = pointer.y;
  }

  const el = renderer.domElement;
  el.style.touchAction = 'pan-y';
  el.addEventListener('pointermove', e => {
    pointerIn = true;
    setPointer(e);
    if (dragging) {
      const dx = e.clientX - dragX;
      dragX = e.clientX;
      moved += Math.abs(dx) + Math.abs(e.clientY - downY) * 0.1;
      yaw += dx * 0.006;
      yawVel = dx * 0.006;
    }
  });
  el.addEventListener('pointerdown', e => {
    dragging = true; moved = 0;
    dragX = downX = e.clientX; downY = e.clientY;
    setPointer(e);
  });
  window.addEventListener('pointerup', e => {
    if (!dragging) return;
    dragging = false;
    if (moved < 6 && e.target === el) {
      setPointer(e);
      const s = pick();
      if (s) onOpen(s.index, list);
    }
  });
  el.addEventListener('pointerleave', () => {
    pointerIn = false; px = 0; py = 0; pointer.set(2, 2);
  });
  el.addEventListener('pointercancel', () => { dragging = false; });

  function pick() {
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects(hitTargets, false)[0];
    return hit && hit.object.userData.slot ? hit.object.userData.slot : null;
  }

  /* ---------- loop ---------- */
  let running = false, last = 0, t = 0;
  const clock = { now: () => performance.now() };

  function frame(now) {
    if (!running) return;
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
    last = now; t += dt;
    const k = 1 - Math.exp(-dt * 4);

    // idle rotation slows while a photograph is under the pointer
    if (!dragging) {
      yawVel *= Math.exp(-dt * 3);
      yaw += yawVel;
      if (!reduce) yaw += dt * (hovered ? 0.02 : 0.09);
    }
    // page scroll turns it a little; never blocks scrolling
    if (!reduce) {
      const sy = window.scrollY;
      yaw += (sy - scrollRef) * 0.0022;
      scrollRef = sy;
    }
    spx += (px - spx) * k; spy += (py - spy) * k;

    yawGroup.rotation.y = yaw + spx * 0.35;
    tiltGroup.rotation.x = -0.12 + spy * -0.18;
    if (!reduce) yawGroup.position.y = Math.sin(t * 0.6) * 0.04;

    // hover
    const s = (pointerIn && !dragging) ? pick() : null;
    if (s !== hovered) {
      hovered = s;
      el.style.cursor = s ? 'pointer' : (dragging ? 'grabbing' : 'grab');
      if (opts.onHover) opts.onHover(s ? s.photo : null, s ? s.index : -1, list.length);
    }
    live.forEach(sl => {
      const target = sl === hovered ? 1 : 0;
      sl.hover += (target - sl.hover) * (reduce ? 1 : 1 - Math.exp(-dt * 10));
      sl.holder.position.z = sl.hover * 0.09;
      sl.holder.scale.setScalar(1 + sl.hover * 0.025);
      sl.frameMat.emissive.copy(ACCENT).multiplyScalar(sl.hover * 0.9);
      if (sl.fadeIn !== undefined && sl.fadeIn < 1) {
        sl.fadeIn = Math.min(1, sl.fadeIn + dt * 1.6);
      }
      // photographs keep their colour on shaded faces
      sl.photoMat.emissiveIntensity = sl.photoMat.map ? (0.28 + sl.hover * 0.12) * (sl.fadeIn == null ? 1 : sl.fadeIn) : 0;
    });

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  function start() { if (!running) { running = true; last = 0; requestAnimationFrame(frame); } }
  function stop() { running = false; }

  const io = new IntersectionObserver(en => { en[0].isIntersecting ? start() : stop(); });
  io.observe(container);
  document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start(); });
  resize();

  return {
    list,
    destroy() {
      stop(); io.disconnect(); ro.disconnect();
      renderer.dispose(); el.remove();
    }
  };
}
