/* =========================================================
   Fragmented Archive
   fragmented sculpture (drag to turn freely)
     -> scroll: photo faces break out of the prisms
     -> they re-form into a photo carousel (scroll / drag / keys)
   mountArchive(container, photos, opts) -> { total, tags, filter, setProgress, stage, openFront, step, destroy }
   ========================================================= */
import * as THREE from 'three';
import { RoomEnvironment } from './vendor/three/RoomEnvironment.js';

const DEG = Math.PI / 180;
const ACCENT = new THREE.Color('#FF8A3D');
const PW = 1.5, PH = 1.0;              // every photo panel is 3:2

/* ---------- the sculpture: interlocking prisms ----------
   c: centre, r: rotation (deg), s: size [x, y, z]
   f: faces — 'p' photograph, 'g' smoked glass. Unlisted faces stay open,
   so the prisms read as glass-and-photo sleeves rather than solid blocks.
   Photo faces are 3:2; a face that would show a photo sideways turns to glass. */
const PRISMS = [
  { c: [0, 0.1, 0],        r: [0, 25, 0],     s: [2.25, 1.5, 1.0], f: { pz: 'p', nz: 'p', py: 'g', px: 'g' } },
  { c: [0.75, 0.95, 0.6],  r: [0, -35, 12],   s: [1.5, 1.0, 1.0],  f: { pz: 'p', nz: 'p', py: 'p', ny: 'p' } },
  { c: [-0.95, -0.6, 0.5], r: [20, 50, -10],  s: [1.8, 1.2, 0.8],  f: { pz: 'p', nz: 'p', py: 'g' } },
  { c: [-0.2, 1.35, -0.7], r: [-15, -10, 25], s: [1.5, 1.0, 0.6],  f: { pz: 'p', nz: 'p', ny: 'g' } },
  { c: [1.25, -0.7, -0.3], r: [10, -60, -20], s: [1.65, 1.1, 1.1], f: { pz: 'p', nz: 'p', py: 'p', ny: 'p' } },
  { c: [-1.55, 0.6, -0.2], r: [0, 75, 15],    s: [1.35, 0.9, 0.9], f: { pz: 'p', nz: 'p', py: 'p' } },
  { c: [0.1, -1.35, 0.7],  r: [-25, 15, 5],   s: [1.5, 1.0, 0.5],  f: { pz: 'p', nz: 'p', ny: 'g' } },
  { c: [0.4, 0.2, -1.3],   r: [5, 10, -8],    s: [2.1, 1.4, 0.4],  f: { pz: 'p', nz: 'p' } },
  { c: [-0.6, -0.2, 1.35], r: [-8, -25, 12],  s: [1.2, 0.8, 0.8],  f: { pz: 'p', nz: 'p', py: 'p' } },
  { c: [1.65, 0.8, -1.0],  r: [30, -20, 40],  s: [1.2, 0.8, 0.4],  f: { pz: 'p', nz: 'p' } },
  { c: [-1.25, -1.4, -0.6], r: [15, 40, -30], s: [1.35, 0.9, 0.5], f: { pz: 'p', nz: 'p' } },
  { c: [0.9, 1.85, 0.2],   r: [-30, 30, 0],   s: [1.2, 0.8, 0.5],  f: { pz: 'p', nz: 'p' } },
];

/* face -> [orientation, which size components give the face's w/h, which is the normal] */
const FACES = {
  pz: { e: [0, 0, 0],    w: 0, h: 1, n: 2, sgn: 1 },
  nz: { e: [0, 180, 0],  w: 0, h: 1, n: 2, sgn: -1 },
  px: { e: [0, 90, 0],   w: 2, h: 1, n: 0, sgn: 1 },
  nx: { e: [0, -90, 0],  w: 2, h: 1, n: 0, sgn: -1 },
  py: { e: [-90, 0, 0],  w: 0, h: 2, n: 1, sgn: 1 },
  ny: { e: [90, 0, 0],   w: 0, h: 2, n: 1, sgn: -1 },
};

/* scroll phases */
/* intro progress (first two screens of scroll): explode, then form the carousel.
   Everything after that is spin progress: one full turn through every photo. */
const P_EXPLODE = [0.06, 0.55];
const P_FORM = [0.58, 1.0];

function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
function ease(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
function seg(p, r) { return ease(clamp((p - r[0]) / (r[1] - r[0]), 0, 1)); }
function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function eulerQ(e) { return new THREE.Quaternion().setFromEuler(new THREE.Euler(e[0] * DEG, e[1] * DEG, e[2] * DEG)); }

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) { return false; }
}

/* Panels bend around a cylinder in the vertex shader: flat in the sculpture,
   gently curved in the carousel ring. */
function bendable(mat, curve) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uCurve = curve;
    sh.vertexShader = 'uniform float uCurve;\n' + sh.vertexShader
      .replace('#include <beginnormal_vertex>', `
        float bendA = position.x * uCurve;
        vec3 objectNormal = vec3(sin(bendA), 0.0, cos(bendA));
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3(tangent.xyz);
        #endif`)
      .replace('#include <begin_vertex>', `
        vec3 transformed = vec3(position);
        if (abs(uCurve) > 1e-4) {
          float r = 1.0 / uCurve;
          float bendB = position.x * uCurve;
          transformed.x = sin(bendB) * (r + position.z);
          transformed.z = cos(bendB) * (r + position.z) - r;
        }`);
  };
  mat.customProgramCacheKey = () => 'bend';
  return mat;
}

export function mountArchive(container, photos, opts = {}) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const onOpen = opts.onOpen || function () {};
  const onHover = opts.onHover || function () {};
  const onStage = opts.onStage || function () {};

  /* ---------- renderer ---------- */
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.75 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.domElement.className = 'archive__canvas';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.6;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);

  scene.add(new THREE.HemisphereLight(0xf2e8dc, 0x131110, 0.45));
  const key = new THREE.DirectionalLight(0xffeedd, 1.4);
  key.position.set(-5, 6, 7);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffb27a, 0.7);      // warm rim catches the glass edges
  rim.position.set(6, 2, -5);
  scene.add(rim);

  /* ---------- rig ----------
     rig rotation = free trackball orientation in the sculpture,
     blending to the carousel yaw as the panels break out. */
  const tilt = new THREE.Group();
  const rig = new THREE.Group();
  tilt.add(rig);
  scene.add(tilt);

  /* ---------- shared materials ---------- */
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xd8c8b3, transparent: true, opacity: 0.4 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x6b6b6b, metalness: 0.1, roughness: 0.08, transparent: true, opacity: 0.16,
    envMapIntensity: 1.8, side: THREE.DoubleSide, depthWrite: false,
  });

  /* ---------- build prisms: outlines, glass faces, photo face slots ---------- */
  const extras = [];          // glass + outlines: they scatter and fade on explode
  const slots = [];           // photo faces in sculpture space
  const UP = new THREE.Vector3(0, 1, 0);
  const rand = rng(7);

  PRISMS.forEach(pr => {
    const qB = eulerQ(pr.r);
    const cB = new THREE.Vector3(...pr.c);
    const box = new THREE.Group();
    box.position.copy(cB); box.quaternion.copy(qB);
    const lines = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(...pr.s)), edgeMat);
    box.add(lines);
    rig.add(box);
    extras.push({ obj: box, home: cB.clone(), dir: cB.clone().normalize().multiplyScalar(2.5 + rand() * 1.5) });

    Object.keys(pr.f).forEach(fk => {
      const F = FACES[fk];
      let w = pr.s[F.w], h = pr.s[F.h];
      const off = pr.s[F.n] / 2;
      // face orientation in box space, then in sculpture space
      let qF = eulerQ(F.e);
      let kind = pr.f[fk];
      if (h > w) { qF.multiply(eulerQ([0, 0, 90])); [w, h] = [h, w]; }
      const qW = qB.clone().multiply(qF);
      const xAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(qW);
      const yAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(qW);
      if (kind === 'p') {
        if (Math.abs(xAxis.dot(UP)) > 0.75 || Math.abs(w / h - 1.5) > 0.2) kind = 'g';
        else if (yAxis.dot(UP) < -0.05) qW.multiply(eulerQ([0, 0, 180]));   // never upside down
      }
      const nLocal = new THREE.Vector3(); nLocal.setComponent(F.n, F.sgn * off);
      const pos = nLocal.applyQuaternion(qB).add(cB);
      if (kind === 'g') {
        const g = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glassMat);
        g.position.copy(pos).sub(cB).applyQuaternion(qB.clone().invert());
        g.quaternion.copy(qB.clone().invert().multiply(qW));
        g.renderOrder = 3;
        box.add(g);
      } else {
        slots.push({ pos, q: qW, scale: (w / PW) * 0.985 });
      }
    });
  });

  /* ---------- photos ----------
     Every photo goes into the carousel at its own aspect ratio.
     30 landscape ones (spread across the hue order) also form the sculpture;
     the rest fly in when the carousel forms. */
  const all = photos.slice();
  const land = all.filter(p => p.w / p.h > 1.3 && p.w / p.h < 1.85);
  const nSculpt = Math.min(slots.length, land.length);
  const sculptSet = new Set();
  for (let i = 0; i < nSculpt; i++) sculptSet.add(land[Math.floor(i * land.length / nSculpt)]);

  /* ---------- carousel geometry (arc-length layout on one big ring) ---------- */
  const SC = 1.0;
  const GAP = 0.14;
  const widthOf = p => PH * clamp(p.w / p.h, 0.55, 2.0);
  const totalLen = all.reduce((s, p) => s + widthOf(p) * SC + GAP, 0);
  const RC = Math.max(9, totalLen / (2 * Math.PI));   // the ring closes exactly: endless loop, no ends
  const CIRC = 2 * Math.PI * RC;
  const dmod = (a, b) => ((((a - b) % CIRC) + CIRC * 1.5) % CIRC) - CIRC / 2;   // shortest arc from b to a

  /* ---------- panels ---------- */
  const geoCache = new Map();
  function planes(w) {
    const k = w.toFixed(3);
    if (!geoCache.has(k)) geoCache.set(k, [new THREE.PlaneGeometry(w, PH, 24, 1), new THREE.PlaneGeometry(w + 0.05, PH + 0.05, 24, 1)]);
    return geoCache.get(k);
  }
  const panels = [];
  const pickables = [];
  const order = slots.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  let slotCursor = 0;

  all.forEach((p, i) => {
    const w = widthOf(p);
    const [geo, rimGeo] = planes(w);
    const curve = { value: 0 };
    // unlit + no tone mapping: the photograph shows exactly as exported
    const photoMat = bendable(new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL((p.hue || 0) / 360, p.bw ? 0 : 0.15, 0.06),
      toneMapped: false,
    }), curve);
    const backMat = bendable(new THREE.MeshStandardMaterial({ color: 0x1f1c1a, metalness: 0.7, roughness: 0.45, side: THREE.BackSide }), curve);
    const rimMat = bendable(new THREE.MeshPhysicalMaterial({
      color: 0xd8c8b3, metalness: 0.9, roughness: 0.25, transparent: true, opacity: 0.55,
      envMapIntensity: 1.4, depthWrite: false, emissive: 0x000000,
    }), curve);

    const holder = new THREE.Group();
    const rimMesh = new THREE.Mesh(rimGeo, rimMat); rimMesh.position.z = -0.006; rimMesh.renderOrder = 2;
    const photo = new THREE.Mesh(geo, photoMat); photo.position.z = 0.004;
    const back = new THREE.Mesh(geo, backMat); back.position.z = -0.002;
    holder.add(rimMesh, back, photo);
    const g = new THREE.Group();
    g.add(holder);
    rig.add(g);

    const pn = {
      photo: p, index: i, w, g, holder, photoMat, rimMat, curve, hover: 0,
      sculpt: sculptSet.has(p), delay: rand() * 0.3,
      s: 0, ang: 0, angT: 0, vis: 1, visT: 1, tex: null, loading: false,
    };
    if (pn.sculpt) {
      const slot = slots[order[slotCursor++]];
      pn.A = slot.pos.clone(); pn.qA = slot.q.clone();
      pn.sA = Math.min((slot.scale * PW) / w, slot.scale);   // fit inside the prism face
      const dir = slot.pos.clone().add(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.6)).normalize();
      pn.E = slot.pos.clone().add(dir.multiplyScalar(1.5 + rand() * 1.3));
      pn.qE = slot.q.clone().multiply(eulerQ([(rand() - 0.5) * 45, (rand() - 0.5) * 45, (rand() - 0.5) * 35]));
    } else {
      // not in the sculpture: waits hidden in the scatter, flies in with the carousel
      const d = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
      pn.A = d.clone().multiplyScalar(5 + rand() * 4); pn.qA = eulerQ([rand() * 360, rand() * 360, 0]);
      pn.sA = 0; pn.E = pn.A; pn.qE = pn.qA;
    }
    photo.userData.panel = pn;
    panels.push(pn);
    pickables.push(photo, back);
  });

  /* ---------- filtering + layout ---------- */
  let visible = panels.slice();
  let sFirst = 0, sLast = 0, sOffset = 0;
  const tagCounts = {};
  all.forEach(p => (p.tags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
  const tags = Object.keys(tagCounts).sort();

  function layout(tag) {
    visible = tag ? panels.filter(pn => (pn.photo.tags || []).includes(tag)) : panels.slice();
    let s = 0;
    visible.forEach((pn, j) => {
      pn.s = s + pn.w * SC / 2;
      pn.angT = pn.s / RC;
      pn.vis_i = j;
      s += pn.w * SC + GAP;
    });
    panels.forEach(pn => { pn.visT = visible.includes(pn) ? 1 : 0; });
    sFirst = visible.length ? visible[0].s : 0;
    sLast = visible.length ? visible[visible.length - 1].s : 0;
    sOffset = 0;
    vel = 0;
  }

  /* ---------- textures: lazy, nearest-first, with paging so memory stays flat ---------- */
  const loader = new THREE.TextureLoader();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  let active = 0, loadedSculpt = 0;
  const MAX_ACTIVE = 6, KEEP = 26;      // cards loaded around the front in the carousel

  function load(pn) {
    pn.loading = true; active++;
    loader.load(pn.photo.thumb || pn.photo.src, tex => {
      active--; pn.loading = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = aniso;
      pn.tex = tex;
      pn.photoMat.map = tex;
      pn.photoMat.color.set(0xffffff);
      pn.photoMat.needsUpdate = true;
      pn.fade = 0;
      if (pn.sculpt && opts.onLoad) opts.onLoad(++loadedSculpt, nSculpt);
    }, undefined, () => { active--; pn.loading = false; });
  }
  function unload(pn) {
    if (!pn.tex) return;
    pn.tex.dispose(); pn.tex = null;
    pn.photoMat.map = null;
    pn.photoMat.color.setHSL((pn.photo.hue || 0) / 360, pn.photo.bw ? 0 : 0.15, 0.06);
    pn.photoMat.needsUpdate = true;
  }
  let pageTimer = 0;
  function pageTextures(inCarousel, sNow) {
    // sculpture first; once the carousel forms, keep the nearest cards loaded
    let want;
    if (!inCarousel) want = panels.filter(pn => pn.sculpt);
    else {
      const byDist = visible.slice().sort((a, b) => Math.abs(dmod(a.s, sNow)) - Math.abs(dmod(b.s, sNow)));
      want = byDist.slice(0, KEEP);
      const keep = new Set(want);
      panels.forEach(pn => { if (pn.tex && !keep.has(pn) && !(pn.sculpt && seg(pSmooth, P_FORM) < 0.5)) unload(pn); });
    }
    for (const pn of want) {
      if (active >= MAX_ACTIVE) break;
      if (!pn.tex && !pn.loading) load(pn);
    }
  }

  /* ---------- soft contact shadow ---------- */
  const c2 = document.createElement('canvas'); c2.width = c2.height = 256;
  const x2 = c2.getContext('2d'), gr = x2.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  x2.fillStyle = gr; x2.fillRect(0, 0, 256, 256);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(6, 6),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c2), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = -2.9; shadow.scale.y = 0.5;
  scene.add(shadow);


  /* ---------- camera framing ---------- */
  let vw = 1, vh = 1;
  const camA = new THREE.Vector3(), camC = new THREE.Vector3();
  const R_SCULPT = 2.75;
  function resize() {
    vw = container.clientWidth; vh = container.clientHeight;
    if (!vw || !vh) return;
    renderer.setSize(vw, vh, false);
    camera.aspect = vw / vh;
    camera.updateProjectionMatrix();
    const tan = Math.tan(camera.fov * DEG / 2);
    const dA = Math.max(R_SCULPT / tan, R_SCULPT / tan / camera.aspect);
    camA.set(0, 0.2, dA * (vw < 700 ? 0.92 : 1.0));
    const frac = camera.aspect < 1 ? 0.8 : 0.4;          // a 3:2 card's share of the width
    const dC = (PW * SC / frac) / 2 / tan / camera.aspect;
    // ...but never taller than the space between the filter bar and the caption bar
    const pad = Math.min(72, Math.max(22, vw * 0.05));
    const availH = Math.max(0.3, Math.min(0.58, (vh - 2 * (pad + 56)) / vh));
    const dH = (PH * SC / availH) / 2 / tan;
    camC.set(0, 0, RC + Math.max(dC, dH));   // level: card centred, far side of the ring hidden
  }
  new ResizeObserver(resize).observe(container);

  /* ---------- interaction ---------- */
  const pointer = new THREE.Vector2(9, 9);
  const ray = new THREE.Raycaster();
  let px = 0, py = 0, spx = 0, spy = 0;
  let dragging = false, lastX = 0, lastY = 0, moved = 0, lastInput = 0;
  let avx = 0, avy = 0;                                 // free-rotation velocity
  let vel = 0;                                          // carousel velocity (arc length / frame)
  let pointerIn = false, hovered = null, progress = 0, pSmooth = 0, spinP = 0, spinSmooth = 0, frontPn = null, stage = -1;
  const freeQ = eulerQ([12, -20, 0]);
  const el = renderer.domElement;
  el.style.touchAction = 'pan-y';

  const qx = new THREE.Quaternion(), qy = new THREE.Quaternion();
  const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0);
  function turnFree(dx, dy) {
    qy.setFromAxisAngle(AY, dx); qx.setFromAxisAngle(AX, dy);
    freeQ.premultiply(qy).premultiply(qx);
  }
  function scrollS() {
    return spinSmooth * CIRC;
  }
  function currentS() { return sFirst + scrollS() + sOffset; }
  function cardPx() { return vw * (camera.aspect < 1 ? 0.8 : 0.4); }

  function setPointer(e) {
    const r = el.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    px = pointer.x; py = pointer.y;
  }
  el.addEventListener('pointerdown', e => {
    dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY;
    avx = avy = vel = 0;
    setPointer(e);
  });
  el.addEventListener('pointermove', e => {
    pointerIn = e.pointerType === 'mouse';
    setPointer(e);
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    lastInput = performance.now();
    if (seg(pSmooth, P_FORM) < 0.5) {
      const k = 0.0065;
      avx = dx * k; avy = (e.pointerType === 'mouse' ? dy : 0) * k;
      turnFree(avx, avy);
    } else {
      const k = (PW * SC) / cardPx();
      sOffset -= dx * k;
      vel = -dx * k;
    }
  });
  window.addEventListener('pointerup', e => {
    if (!dragging) return;
    dragging = false;
    lastInput = performance.now();
    if (moved < 7 && e.target === el) {
      setPointer(e);
      const pn = pick();
      if (pn) openPanel(pn);
    }
  });
  el.addEventListener('pointerleave', () => { pointerIn = false; px = py = 0; pointer.set(9, 9); });
  el.addEventListener('pointercancel', () => { dragging = false; });

  function visibleList() { return visible.map(pn => pn.photo); }
  function openPanel(pn) {
    const i = visible.indexOf(pn);
    if (i >= 0) onOpen(i, visibleList());
    else onOpen(0, [pn.photo]);
  }
  function pick() {
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    const pn = hit && hit.object.userData.panel;
    return pn && pn.g.visible && pn.g.scale.x > 0.2 ? pn : null;
  }

  /* ---------- loop ---------- */
  const qTmp = new THREE.Quaternion(), vTmp = new THREE.Vector3(), cTmp = new THREE.Vector3(), qC = new THREE.Quaternion();
  let running = false, last = 0, t = 0;

  function frame(now) {
    if (!running) return;
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
    last = now; t += dt;
    const k = 1 - Math.exp(-dt * 6);

    pSmooth += (progress - pSmooth) * (reduce ? 1 : k);
    spinSmooth += (spinP - spinSmooth) * (reduce ? 1 : k);
    const uE = seg(pSmooth, P_EXPLODE);
    const uC = seg(pSmooth, P_FORM);

    if (!dragging) {
      const damp = Math.exp(-dt * 3.5);
      avx *= damp; avy *= damp;
      if (Math.abs(avx) + Math.abs(avy) > 1e-5) turnFree(avx, avy);
      if (!reduce && uE < 0.5 && now - lastInput > 1200) turnFree(dt * 0.12 * (hovered ? 0.15 : 1), 0);
      // carousel: inertia, then settle on the nearest card
      vel *= Math.exp(-dt * 4);
      sOffset += vel;
      if (uC > 0.98 && Math.abs(vel) < 0.002 && now - lastInput > 180 && visible.length) {
        const sNow = currentS();
        let near = visible[0];
        visible.forEach(pn => { if (Math.abs(dmod(pn.s, sNow)) < Math.abs(dmod(near.s, sNow))) near = pn; });
        sOffset += dmod(near.s, sNow) * (reduce ? 1 : 1 - Math.exp(-dt * 7));
      }
    }
    const sNow = currentS();
    const yaw = sNow / RC;
    qy.setFromAxisAngle(AY, -yaw);
    rig.quaternion.copy(freeQ).slerp(qy, uC);

    spx += (px - spx) * k; spy += (py - spy) * k;
    tilt.rotation.x = spy * -0.06 * (1 - uC);
    tilt.rotation.y = spx * 0.08 * (1 - uC);
    if (!reduce) tilt.position.y = Math.sin(t * 0.7) * 0.04 * (1 - uC);

    extras.forEach(x => {
      x.obj.position.copy(x.home).addScaledVector(x.dir, uE);
      x.obj.visible = uE < 0.98;
    });
    edgeMat.opacity = 0.4 * (1 - uE);
    glassMat.opacity = 0.16 * (1 - uE);
    shadow.material.opacity = 1 - uE;

    const hit = (pointerIn && !dragging) ? pick() : null;
    if (hit !== hovered) {
      hovered = hit;
      el.style.cursor = hit ? 'pointer' : 'grab';
      if (hit) report(hit);
      else if (stage !== 2) onHover(null);
      else frontPn = null;
    }

    let front = null, best = 1e9;
    const lk = reduce ? 1 : 1 - Math.exp(-dt * 5);
    panels.forEach(pn => {
      pn.ang += (pn.angT - pn.ang) * lk;          // smooth re-layout when the filter changes
      pn.vis += (pn.visT - pn.vis) * lk;
      const e = pn.sculpt ? clamp(uE * 1.3 - pn.delay, 0, 1) : 0;
      const ee = ease(e);
      cTmp.set(Math.sin(pn.ang) * RC, 0, Math.cos(pn.ang) * RC);
      vTmp.copy(pn.A).lerp(pn.E, ee).lerp(cTmp, uC);
      pn.g.position.copy(vTmp);
      qC.setFromAxisAngle(AY, pn.ang);
      qTmp.copy(pn.qA).slerp(pn.qE, ee).slerp(qC, uC);
      pn.g.quaternion.copy(qTmp);
      const sc = (pn.sA + (SC - pn.sA) * uC) * (1 - uC + uC * pn.vis);
      pn.g.scale.setScalar(Math.max(sc, 0.0001));
      pn.g.visible = sc > 0.002;
      pn.curve.value = (SC / RC) * uC;

      pn.hover += ((pn === hovered ? 1 : 0) - pn.hover) * (reduce ? 1 : 1 - Math.exp(-dt * 10));
      pn.holder.position.z = pn.hover * 0.12;
      pn.rimMat.emissive.copy(ACCENT).multiplyScalar(pn.hover * 1.3);
      if (pn.fade !== undefined && pn.fade < 1) pn.fade = Math.min(1, pn.fade + dt * 1.5);
      // fade in after loading; faces in the sculpture are a touch dimmer so it still reads as an object
      if (pn.photoMat.map) pn.photoMat.color.setScalar((0.35 + 0.65 * (pn.fade ?? 1)) * (0.86 + 0.14 * Math.max(uC, pn.hover)));

      if (pn.visT && Math.abs(dmod(pn.s, sNow)) < best) { best = Math.abs(dmod(pn.s, sNow)); front = pn; }
    });

    pageTimer -= dt;
    if (pageTimer <= 0) { pageTimer = 0.25; pageTextures(uC > 0.3, sNow); }

    vTmp.copy(camA).multiplyScalar(1 + uE * (camera.aspect < 1 ? 0.5 : 0.35) * (1 - uC)).lerp(camC, uC);
    camera.position.copy(vTmp);
    camera.lookAt(0, 0, 0);

    const s = uC > 0.9 ? 2 : uE > 0.08 ? 1 : 0;
    if (s !== stage) { stage = s; onStage(s); }
    if (s === 2 && !hovered && front && front !== frontPn) { frontPn = front; report(front); }
    if (s !== 2) frontPn = null;

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  function report(pn) {
    const i = visible.indexOf(pn);
    onHover(pn.photo, i, visible.length);
  }

  function start() { if (!running) { running = true; last = 0; requestAnimationFrame(frame); } }
  function stop() { running = false; }
  const io = new IntersectionObserver(en => { en[0].isIntersecting ? start() : stop(); });
  io.observe(container);
  document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start(); });
  resize();
  layout(null);
  panels.forEach(pn => { pn.ang = pn.angT; pn.vis = pn.visT; });

  return {
    total: all.length,
    count: all.length,
    // intro: 0..1 over the explode + form; spin: 0..1 = one full turn of the carousel
    setProgress(intro, spin) { progress = clamp(intro, 0, 1); spinP = clamp(spin || 0, 0, 1); },
    stage() { return stage; },
    openFront() { if (frontPn) openPanel(frontPn); },
    step(d) {
      if (!visible.length) return;
      const sNow = currentS();
      let i = 0, best = 1e9;
      visible.forEach((pn, j) => { const dd = Math.abs(dmod(pn.s, sNow)); if (dd < best) { best = dd; i = j; } });
      const n = visible.length;
      const target = visible[((i + d) % n + n) % n].s;
      vel = 0; sOffset += dmod(target, sNow); lastInput = performance.now() - 1000;
    },
    destroy() { stop(); io.disconnect(); renderer.dispose(); el.remove(); }
  };
}
