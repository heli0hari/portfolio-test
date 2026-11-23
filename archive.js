/* =========================================================
   Fragmented Archive — kinetic photo totem
   assembled totem  ->  exploded view  ->  photo carousel
   Progress (0..1) comes from the page scroll; drag spins it.
   mountArchive(container, photos, opts) -> { list, setProgress, step, destroy }
   ========================================================= */
import * as THREE from 'three';
import { RoomEnvironment } from './vendor/three/RoomEnvironment.js';

const DEG = Math.PI / 180;
const ACCENT = new THREE.Color('#FF8A3D');

/* ---------- layout constants ---------- */
const TIERS = 5, PER_TIER = 6, COUNT = TIERS * PER_TIER;
const RA = 0.92;                       // totem radius
const PW = 2 * Math.PI * RA / PER_TIER * 0.93;   // panel width (arc)
const PH = PW / 1.5;                   // 3:2 panels
const TIER_H = PH + 0.1;
const SC = 1.65;                       // panel scale in the carousel
const GAP = 1.1;                       // carousel spacing factor
const RC = COUNT * PW * SC * GAP / (2 * Math.PI);   // carousel radius
const STEP = 2 * Math.PI / COUNT;

/* phase timing on the 0..1 progress */
const P_EXPLODE = [0.05, 0.32];
const P_FORM = [0.34, 0.54];
const P_SPIN = [0.56, 1.0];

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

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) { return false; }
}

/* Curved panels: a flat plane bent around a cylinder in the vertex shader,
   so the same panel can be a tight totem segment or a near-flat carousel card. */
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
          transformed.z = (cos(bendA) * (r + position.z)) - r;
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

  /* ---------- pick photos: landscape-ish, spread across the hue order ---------- */
  const land = photos.filter(p => p.w / p.h > 1.3 && p.w / p.h < 1.85);
  const list = [];
  for (let i = 0; i < COUNT && land.length; i++) list.push(land[Math.floor(i * land.length / COUNT)]);
  const N = list.length;

  /* ---------- renderer ---------- */
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.75 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.className = 'archive__canvas';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.6;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);

  scene.add(new THREE.HemisphereLight(0xf2e8dc, 0x131110, 0.4));
  const key = new THREE.DirectionalLight(0xffeedd, 1.5);
  key.position.set(-5, 6, 7);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbcc8d6, 0.5);
  rim.position.set(6, 1, -6);
  scene.add(rim);
  const core = new THREE.PointLight(0xff8a3d, 6, 5, 1.6);   // warm light inside the spine
  scene.add(core);

  /* ---------- materials ---------- */
  const satin = new THREE.MeshStandardMaterial({ color: 0x6b6b6b, metalness: 1, roughness: 0.34, envMapIntensity: 1.1 });
  const matte = new THREE.MeshStandardMaterial({ color: 0x2b2825, metalness: 0.6, roughness: 0.5 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xff8a3d });

  /* ---------- groups ---------- */
  const spinGroup = new THREE.Group();     // yaw (idle / drag / scroll)
  const tiltGroup = new THREE.Group();     // pointer tilt
  tiltGroup.add(spinGroup);
  scene.add(tiltGroup);

  /* ---------- central structure: spine, light slot, tier rings, arms, cap, base ---------- */
  const structure = [];
  const structGroup = new THREE.Group();   // shrinks away once the carousel forms
  spinGroup.add(structGroup);
  function part(mesh, y, explodeY) {
    mesh.position.y = y;
    structGroup.add(mesh);
    structure.push({ mesh, y, ey: explodeY });
    return mesh;
  }
  const totemH = TIERS * TIER_H;
  part(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, totemH + 1.4, 32), satin), 0, 0);
  part(new THREE.Mesh(new THREE.BoxGeometry(0.035, totemH + 0.6, 0.035), glow), 0, 0).position.z = 0.115;
  for (let k = 0; k <= TIERS; k++) {
    const y = (k - TIERS / 2) * TIER_H;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(RA * 0.86, RA * 0.86, 0.035, 48), k % 2 ? satin : matte);
    part(ring, y, y * 1.9);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(RA * 1.9, 0.05, 0.12), satin);
    arm.rotation.y = k * 37 * DEG;
    part(arm, y + 0.03, y * 1.9 + 0.03);
  }
  part(new THREE.Mesh(new THREE.CylinderGeometry(RA * 0.62, RA * 0.75, 0.16, 48), satin), totemH / 2 + 0.22, totemH / 2 + 1.35);
  part(new THREE.Mesh(new THREE.CylinderGeometry(RA * 0.85, RA * 0.95, 0.22, 48), matte), -totemH / 2 - 0.25, -totemH / 2 - 1.35);
  const ringGlow = part(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 8, 48), glow), -totemH / 2 - 0.08, -totemH / 2 - 0.9);
  ringGlow.rotation.x = Math.PI / 2;

  /* ---------- panels ---------- */
  const geo = new THREE.PlaneGeometry(PW, PH, 24, 1);
  const rimGeo = new THREE.PlaneGeometry(PW + 0.07, PH + 0.07, 24, 1);
  const rand = rng(42);
  const panels = [];
  const pickables = [];

  for (let i = 0; i < N; i++) {
    const p = list[i];
    // carousel order = hue order; totem position is shuffled so colours mix
    const tier = i % TIERS;
    const col = Math.floor(i / TIERS);
    const aA = (col / PER_TIER) * 2 * Math.PI + tier * 23 * DEG;
    const rA = RA + (tier % 2 ? 0.07 : 0);
    const yA = (tier - (TIERS - 1) / 2) * TIER_H;

    const curve = { value: 1 / rA };
    const photoMat = bendable(new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL((p.hue || 0) / 360, p.bw ? 0 : 0.2, 0.18),
      roughness: 0.5, metalness: 0, envMapIntensity: 0.4,
      emissive: 0xffffff, emissiveIntensity: 0,
    }), curve);
    const backMat = bendable(new THREE.MeshStandardMaterial({ color: 0x24211e, metalness: 0.8, roughness: 0.4, side: THREE.BackSide }), curve);
    const rimMat = bendable(new THREE.MeshPhysicalMaterial({
      color: 0x8a8a8a, metalness: 0.2, roughness: 0.12, transparent: true, opacity: 0.32,
      envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false, emissive: 0x000000,
    }), curve);

    const holder = new THREE.Group();
    const rimMesh = new THREE.Mesh(rimGeo, rimMat); rimMesh.position.z = -0.03; rimMesh.renderOrder = 2;
    const photo = new THREE.Mesh(geo, photoMat);
    const back = new THREE.Mesh(geo, backMat); back.position.z = -0.012;
    holder.add(rimMesh, back, photo);
    const g = new THREE.Group();
    g.add(holder);
    spinGroup.add(g);

    // exploded: pushed out, spread vertically, tilted
    const aE = aA + (rand() - 0.5) * 0.5;
    const rE = RA + 1.5 + rand() * 1.3;
    const yE = yA * 1.9 + (rand() - 0.5) * 0.5;
    const qA = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, aA, 0));
    const qE = new THREE.Quaternion().setFromEuler(new THREE.Euler((rand() - 0.5) * 36 * DEG, aE + (rand() - 0.5) * 24 * DEG, (rand() - 0.5) * 30 * DEG, 'YXZ'));
    const aC = i * STEP;
    const qC = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, aC, 0));

    const panel = {
      photo: p, index: i, g, holder, photoMat, rimMat, curve, hover: 0,
      A: new THREE.Vector3(Math.sin(aA) * rA, yA, Math.cos(aA) * rA), qA, kA: 1 / rA,
      E: new THREE.Vector3(Math.sin(aE) * rE, yE, Math.cos(aE) * rE), qE,
      C: new THREE.Vector3(Math.sin(aC) * RC, 0, Math.cos(aC) * RC), qC, kC: SC / RC,
      delay: rand() * 0.25,
    };
    photo.userData.panel = panel;
    panels.push(panel);
    pickables.push(photo, back);
  }
  structure.forEach(s => pickables.push(s.mesh));

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

  /* ---------- floor: contact shadow + warm pool ---------- */
  function radial(stops) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d'), g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    stops.forEach(s => g.addColorStop(s[0], s[1]));
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }
  const floorY = -totemH / 2 - 0.42;
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshBasicMaterial({
    map: radial([[0, 'rgba(0,0,0,0.6)'], [0.55, 'rgba(0,0,0,0.2)'], [1, 'rgba(0,0,0,0)']]), transparent: true, depthWrite: false }));
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({
    map: radial([[0, 'rgba(255,138,61,0.32)'], [0.4, 'rgba(255,138,61,0.08)'], [1, 'rgba(255,138,61,0)']]),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  [shadow, pool].forEach(m => { m.rotation.x = -Math.PI / 2; m.position.y = floorY; scene.add(m); });
  pool.position.y += 0.005;

  /* ---------- camera framing ---------- */
  let vw = 1, vh = 1;
  const camA = new THREE.Vector3(), camC = new THREE.Vector3();
  function resize() {
    vw = container.clientWidth; vh = container.clientHeight;
    if (!vw || !vh) return;
    renderer.setSize(vw, vh, false);
    camera.aspect = vw / vh;
    camera.updateProjectionMatrix();
    const tan = Math.tan(camera.fov * DEG / 2);
    // assembled: fit the whole totem with a little air
    const needH = totemH + 1.3, needW = RA * 2 + 1.6;
    const dA = Math.max(needH / 2 / tan, needW / 2 / tan / camera.aspect);
    camA.set(0, 0.3, dA * 1.05);
    // carousel: front card fills ~40% of width on desktop, ~80% on phones
    const frac = camera.aspect < 1 ? 0.8 : 0.4;
    const dC = (PW * SC / frac) / 2 / tan / camera.aspect;
    camC.set(0, 0.5, RC + Math.max(dC, PH * SC / 0.55 / 2 / tan));
  }
  new ResizeObserver(resize).observe(container);

  /* ---------- interaction ---------- */
  const pointer = new THREE.Vector2(9, 9);
  const ray = new THREE.Raycaster();
  let px = 0, py = 0, spx = 0, spy = 0;
  let spin = 0, vel = 0, dragging = false, lastX = 0, downY = 0, moved = 0, lastInput = 0;
  let pointerIn = false, hovered = null, progress = 0, pSmooth = 0, frontIdx = -1, stage = -1;
  const el = renderer.domElement;
  el.style.touchAction = 'pan-y';

  function setPointer(e) {
    const r = el.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    px = pointer.x; py = pointer.y;
  }
  el.addEventListener('pointerdown', e => {
    dragging = true; moved = 0; lastX = e.clientX; downY = e.clientY; vel = 0;
    setPointer(e);
  });
  el.addEventListener('pointermove', e => {
    pointerIn = e.pointerType === 'mouse';
    setPointer(e);
    if (!dragging) return;
    const dx = e.clientX - lastX; lastX = e.clientX;
    moved += Math.abs(dx);
    const k = dragScale();
    spin -= dx * k; vel = -dx * k; lastInput = performance.now();
  });
  window.addEventListener('pointerup', e => {
    if (!dragging) return;
    dragging = false;
    lastInput = performance.now();
    if (moved < 6 && Math.abs(e.clientY - downY) < 8 && e.target === el) {
      setPointer(e);
      const pn = pick();
      if (pn) onOpen(pn.index, list);
    }
  });
  el.addEventListener('pointerleave', () => { pointerIn = false; px = py = 0; pointer.set(9, 9); });
  el.addEventListener('pointercancel', () => { dragging = false; });

  // in the carousel, one card width of drag = one step
  function dragScale() {
    const u = seg(pSmooth, P_FORM);
    const cardPx = vw * (camera.aspect < 1 ? 0.8 : 0.4);
    return (1 - u) * 0.008 + u * (STEP / cardPx);
  }

  function pick() {
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    return hit && hit.object.userData.panel ? hit.object.userData.panel : null;
  }

  /* ---------- loop ---------- */
  const qTmp = new THREE.Quaternion(), vTmp = new THREE.Vector3(), lookTmp = new THREE.Vector3();
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

    // spin: idle drift on the totem, inertia after a drag, snap to a card in the carousel
    if (!dragging) {
      vel *= Math.exp(-dt * 4);
      spin += vel;
      if (!reduce) spin += dt * 0.22 * (1 - uC) * (hovered ? 0.2 : 1);
      if (uC > 0.98 && Math.abs(vel) < 0.002 && now - lastInput > 180) {
        const total = spin + uS * 2 * Math.PI;
        const snap = Math.round(total / STEP) * STEP;
        spin += (snap - total) * (reduce ? 1 : 1 - Math.exp(-dt * 7));
      }
    }
    const yaw = spin + uS * 2 * Math.PI;
    spinGroup.rotation.y = -yaw;

    spx += (px - spx) * k; spy += (py - spy) * k;
    tiltGroup.rotation.x = (-0.05 + spy * -0.08) * (1 - uC * 0.6);
    tiltGroup.rotation.z = spx * -0.03;
    if (!reduce) tiltGroup.position.y = Math.sin(t * 0.7) * 0.035 * (1 - uC);

    // structure explodes vertically, then recedes behind the carousel
    structure.forEach(s => { s.mesh.position.y = s.y + (s.ey - s.y) * uE * (1 - uC * 0.4); });
    const sg = Math.max(0.001, 1 - uC);
    structGroup.scale.set(sg, sg, sg);
    structGroup.visible = uC < 0.995;
    core.intensity = 6 * (1 - uC);
    shadow.material.opacity = 1 - uC;
    pool.material.opacity = (1 - uE * 0.5) * (1 - uC);

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
      // staggered explode so panels peel off one after another
      const e = clamp(uE * 1.25 - pn.delay, 0, 1);
      vTmp.copy(pn.A).lerp(pn.E, e).lerp(pn.C, uC);
      pn.g.position.copy(vTmp);
      qTmp.copy(pn.qA).slerp(pn.qE, e).slerp(pn.qC, uC);
      pn.g.quaternion.copy(qTmp);
      pn.g.scale.setScalar(1 + (SC - 1) * uC);
      pn.curve.value = pn.kA + (pn.kC - pn.kA) * uC - pn.kA * 0.55 * e * (1 - uC);

      pn.hover += ((pn === hovered ? 1 : 0) - pn.hover) * (reduce ? 1 : 1 - Math.exp(-dt * 10));
      pn.holder.position.z = pn.hover * 0.14;
      pn.rimMat.emissive.copy(ACCENT).multiplyScalar(pn.hover * 1.2);
      pn.rimMat.opacity = 0.32 + pn.hover * 0.4;
      if (pn.fade !== undefined && pn.fade < 1) pn.fade = Math.min(1, pn.fade + dt * 1.5);
      pn.photoMat.emissiveIntensity = pn.photoMat.map ? (0.32 + pn.hover * 0.15 + uC * 0.08) * (pn.fade ?? 1) : 0;

      const a = ((pn.index * STEP - yaw) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
      if (Math.abs(a) < best) { best = Math.abs(a); bestI = pn.index; }
    });

    // camera pulls back for the explosion, then moves out to the carousel
    vTmp.copy(camA).multiplyScalar(1 + uE * (camera.aspect < 1 ? 0.55 : 0.15) * (1 - uC)).lerp(camC, uC);
    camera.position.copy(vTmp);
    lookTmp.set(0, -0.05 * (1 - uC) + 0.08 * uC, 0);
    camera.lookAt(lookTmp);

    const s = uC > 0.9 ? 2 : uE > 0.1 ? 1 : 0;
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
