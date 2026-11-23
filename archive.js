/* =========================================================
   Fragmented Archive
   fragmented sculpture (drag to turn freely)
     -> scroll: photo faces break out of the prisms
     -> they re-form into a photo carousel (scroll / drag / keys)
   mountArchive(container, photos, opts) -> { list, setProgress, stage, front, step, destroy }
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
const P_EXPLODE = [0.04, 0.28];
const P_FORM = [0.3, 0.5];
const P_SPIN = [0.52, 1.0];

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
          transformed.x = sin(bendA) * (r + position.z);
          transformed.z = cos(bendA) * (r + position.z) - r;
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

  /* ---------- photos: landscape, spread across the hue order ---------- */
  const land = photos.filter(p => p.w / p.h > 1.3 && p.w / p.h < 1.85);
  const N = Math.min(slots.length, land.length);
  const list = [];
  for (let i = 0; i < N; i++) list.push(land[Math.floor(i * land.length / N)]);

  /* ---------- carousel geometry ---------- */
  const SC = 1.0;
  const RC = N * PW * SC * 1.12 / (2 * Math.PI);
  const STEP = 2 * Math.PI / N;

  /* ---------- panels ---------- */
  const geo = new THREE.PlaneGeometry(PW, PH, 24, 1);
  const rimGeo = new THREE.PlaneGeometry(PW + 0.05, PH + 0.05, 24, 1);
  const panels = [];
  const pickables = [];
  // shuffle which slot each photo takes so hue neighbours spread around the sculpture
  const order = slots.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }

  for (let i = 0; i < N; i++) {
    const p = list[i];
    const slot = slots[order[i]];
    const curve = { value: 0 };
    const photoMat = bendable(new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL((p.hue || 0) / 360, p.bw ? 0 : 0.2, 0.18),
      roughness: 0.5, metalness: 0, envMapIntensity: 0.35, emissive: 0xffffff, emissiveIntensity: 0,
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

    // explode outward from the centre, with a tumble
    const dir = slot.pos.clone().add(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.6)).normalize();
    const E = slot.pos.clone().add(dir.multiplyScalar(1.5 + rand() * 1.3));
    const qE = slot.q.clone().multiply(eulerQ([(rand() - 0.5) * 45, (rand() - 0.5) * 45, (rand() - 0.5) * 35]));
    const aC = i * STEP;

    const panel = {
      photo: p, index: i, g, holder, photoMat, rimMat, curve, hover: 0,
      A: slot.pos.clone(), qA: slot.q.clone(), sA: slot.scale,
      E, qE,
      C: new THREE.Vector3(Math.sin(aC) * RC, 0, Math.cos(aC) * RC), qC: eulerQ([0, aC / DEG, 0]),
      kC: SC / RC,
      delay: rand() * 0.3,
    };
    photo.userData.panel = panel;
    panels.push(panel);
    pickables.push(photo, back);
  }

  /* ---------- textures: cover-crop to 3:2, never stretched ---------- */
  const loader = new THREE.TextureLoader();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  let active = 0, next = 0, done = 0;
  (function pump() {
    while (active < 6 && next < panels.length) {
      const pn = panels[next++];
      active++;
      loader.load(pn.photo.thumb || pn.photo.src, tex => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = aniso;
        const a = tex.image.width / tex.image.height, want = PW / PH;
        if (a > want) { tex.repeat.set(want / a, 1); tex.offset.set((1 - want / a) / 2, 0); }
        else { tex.repeat.set(1, a / want); tex.offset.set(0, (1 - a / want) / 2); }
        pn.photoMat.map = tex; pn.photoMat.emissiveMap = tex;
        pn.photoMat.color.set(0xffffff);
        pn.photoMat.needsUpdate = true;
        pn.fade = 0;
        active--; done++; pump();
        if (opts.onLoad) opts.onLoad(done, panels.length);
      }, undefined, () => { active--; done++; pump(); });
    }
  })();

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
    const frac = camera.aspect < 1 ? 0.8 : 0.4;          // front card's share of the width
    const dC = (PW * SC / frac) / 2 / tan / camera.aspect;
    camC.set(0, 0.45, RC + Math.max(dC, PH * SC / 0.55 / 2 / tan));
  }
  new ResizeObserver(resize).observe(container);

  /* ---------- interaction ---------- */
  const pointer = new THREE.Vector2(9, 9);
  const ray = new THREE.Raycaster();
  let px = 0, py = 0, spx = 0, spy = 0;
  let dragging = false, lastX = 0, lastY = 0, downY = 0, moved = 0, lastInput = 0;
  let avx = 0, avy = 0;                                 // free-rotation velocity (rad/frame)
  let spin = 0, vel = 0;                                // carousel yaw
  let pointerIn = false, hovered = null, progress = 0, pSmooth = 0, frontIdx = -1, stage = -1;
  const freeQ = eulerQ([12, -20, 0]);                   // opening view of the sculpture
  const el = renderer.domElement;
  el.style.touchAction = 'pan-y';

  const qx = new THREE.Quaternion(), qy = new THREE.Quaternion();
  const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0);
  function turnFree(dx, dy) {
    qy.setFromAxisAngle(AY, dx); qx.setFromAxisAngle(AX, dy);
    freeQ.premultiply(qy).premultiply(qx);
  }

  function setPointer(e) {
    const r = el.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    px = pointer.x; py = pointer.y;
  }
  el.addEventListener('pointerdown', e => {
    dragging = true; moved = 0; lastX = e.clientX; lastY = downY = e.clientY;
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
    const uC = seg(pSmooth, P_FORM);
    if (uC < 0.5) {
      // sculpture: turn freely in any direction (vertical only with a mouse; touch keeps page scroll)
      const k = 0.0065;
      avx = dx * k; avy = (e.pointerType === 'mouse' ? dy : 0) * k;
      turnFree(avx, avy);
    } else {
      const k = STEP / (vw * (camera.aspect < 1 ? 0.8 : 0.4));
      spin -= dx * k; vel = -dx * k;
    }
  });
  window.addEventListener('pointerup', e => {
    if (!dragging) return;
    dragging = false;
    lastInput = performance.now();
    if (moved < 7 && e.target === el) {
      setPointer(e);
      const pn = pick();
      if (pn) onOpen(pn.index, list);
    }
  });
  el.addEventListener('pointerleave', () => { pointerIn = false; px = py = 0; pointer.set(9, 9); });
  el.addEventListener('pointercancel', () => { dragging = false; });

  function pick() {
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    return hit && hit.object.userData.panel ? hit.object.userData.panel : null;
  }

  /* ---------- loop ---------- */
  const qTmp = new THREE.Quaternion(), vTmp = new THREE.Vector3(), yawQ = new THREE.Quaternion();
  let running = false, last = 0, t = 0;

  function frame(now) {
    if (!running) return;
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
    last = now; t += dt;
    const k = 1 - Math.exp(-dt * 6);

    pSmooth += (progress - pSmooth) * (reduce ? 1 : k);
    const uE = seg(pSmooth, P_EXPLODE);
    const uC = seg(pSmooth, P_FORM);
    const uS = clamp((pSmooth - P_SPIN[0]) / (P_SPIN[1] - P_SPIN[0]), 0, 1);

    if (!dragging) {
      // sculpture: inertia, then a slow idle turn
      const damp = Math.exp(-dt * 3.5);
      avx *= damp; avy *= damp;
      if (Math.abs(avx) + Math.abs(avy) > 1e-5) turnFree(avx, avy);
      if (!reduce && uE < 0.5 && now - lastInput > 1200) turnFree(dt * 0.12 * (hovered ? 0.15 : 1), 0);
      // carousel: inertia + snap to a card
      vel *= Math.exp(-dt * 4);
      spin += vel;
      if (uC > 0.98 && Math.abs(vel) < 0.002 && now - lastInput > 180) {
        const total = spin + uS * 2 * Math.PI;
        const snap = Math.round(total / STEP) * STEP;
        spin += (snap - total) * (reduce ? 1 : 1 - Math.exp(-dt * 7));
      }
    }
    const yaw = spin + uS * 2 * Math.PI;
    yawQ.setFromAxisAngle(AY, -yaw);
    rig.quaternion.copy(freeQ).slerp(yawQ, uC);

    spx += (px - spx) * k; spy += (py - spy) * k;
    // pointer tilt only on the sculpture: the carousel ring is ~8 units out,
    // so even a tiny tilt about the centre swings the front card off screen
    tilt.rotation.x = spy * -0.06 * (1 - uC);
    tilt.rotation.y = spx * 0.08 * (1 - uC);
    if (!reduce) tilt.position.y = Math.sin(t * 0.7) * 0.04 * (1 - uC);

    // glass + outlines scatter and fade
    extras.forEach(x => {
      x.obj.position.copy(x.home).addScaledVector(x.dir, uE);
      x.obj.visible = uE < 0.98;
    });
    edgeMat.opacity = 0.4 * (1 - uE);
    glassMat.opacity = 0.16 * (1 - uE);
    shadow.material.opacity = 1 - uE;

    // hover
    const hit = (pointerIn && !dragging) ? pick() : null;
    if (hit !== hovered) {
      hovered = hit;
      el.style.cursor = hit ? 'pointer' : 'grab';
      if (hit || stage !== 2) onHover(hit ? hit.photo : null, hit ? hit.index : -1, N);
      else frontIdx = -1;
    }

    let best = 1e9, bestI = 0;
    panels.forEach(pn => {
      const e = clamp(uE * 1.3 - pn.delay, 0, 1);
      vTmp.copy(pn.A).lerp(pn.E, ease(e)).lerp(pn.C, uC);
      pn.g.position.copy(vTmp);
      qTmp.copy(pn.qA).slerp(pn.qE, ease(e)).slerp(pn.qC, uC);
      pn.g.quaternion.copy(qTmp);
      pn.g.scale.setScalar(pn.sA + (SC - pn.sA) * uC);
      pn.curve.value = pn.kC * uC;

      pn.hover += ((pn === hovered ? 1 : 0) - pn.hover) * (reduce ? 1 : 1 - Math.exp(-dt * 10));
      pn.holder.position.z = pn.hover * 0.12;
      pn.rimMat.emissive.copy(ACCENT).multiplyScalar(pn.hover * 1.3);
      if (pn.fade !== undefined && pn.fade < 1) pn.fade = Math.min(1, pn.fade + dt * 1.5);
      pn.photoMat.emissiveIntensity = pn.photoMat.map ? (0.26 + pn.hover * 0.12) * (pn.fade ?? 1) : 0;

      const a = ((pn.index * STEP - yaw) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
      if (Math.abs(a) < best) { best = Math.abs(a); bestI = pn.index; }
    });

    // camera: pulls back for the explosion, then moves out to the carousel
    vTmp.copy(camA).multiplyScalar(1 + uE * (camera.aspect < 1 ? 0.5 : 0.35) * (1 - uC)).lerp(camC, uC);
    camera.position.copy(vTmp);
    camera.lookAt(0, 0.06 * uC, 0);

    const s = uC > 0.9 ? 2 : uE > 0.08 ? 1 : 0;
    if (s !== stage) { stage = s; onStage(s); }
    if (s === 2 && !hovered && bestI !== frontIdx) { frontIdx = bestI; onHover(list[bestI], bestI, N); }
    if (s !== 2) frontIdx = -1;

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
    setProgress(p) { progress = clamp(p, 0, 1); },
    stage() { return stage; },
    front() { return frontIdx; },
    step(d) { vel = 0; spin += d * STEP; lastInput = performance.now() - 1000; },
    destroy() { stop(); io.disconnect(); renderer.dispose(); el.remove(); }
  };
}
