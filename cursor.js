/* =========================================================
   Cube cursor — a small wireframe cube that follows the pointer,
   turning with its motion and leaving fading echoes behind it.
   One fixed canvas, pointer-events: none, so it never gets in the
   way of a click. The system cursor stays as it is. Off on touch
   screens and when reduced motion is requested.
   ========================================================= */
(function () {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var cv = document.createElement('canvas');
  cv.className = 'cube-cursor';
  cv.setAttribute('aria-hidden', 'true');
  document.body.appendChild(cv);
  var ctx = cv.getContext('2d');
  var dpr = 1, W = 0, H = 0;
  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  size(); addEventListener('resize', size);

  // unit cube
  var V = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
  var E = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];

  var mx = -100, my = -100, x = -100, y = -100, vx = 0, vy = 0;
  var rx = 0.6, ry = 0.8, rz = 0, s = 9, sT = 9, alpha = 0, alphaT = 0;
  var trail = [], tick = 0, last = 0, idle = 0;
  var OFFSET = 22;                              // sits just off the pointer tip

  addEventListener('pointermove', function (e) {
    mx = e.clientX + OFFSET; my = e.clientY + OFFSET;
    if (alpha === 0) { x = mx; y = my; }
    alphaT = 1; idle = 0;
    var t = e.target;
    sT = t && t.closest && t.closest('a, button, [role="tab"], .ix__row, .cell, canvas') ? 14 : 9;
    if (!running) { running = true; requestAnimationFrame(frame); }
  }, { passive: true });
  document.addEventListener('pointerleave', function () { alphaT = 0; });
  addEventListener('blur', function () { alphaT = 0; });

  function draw(px, py, sc, ax, ay, az, a) {
    var cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay), cz = Math.cos(az), sz = Math.sin(az);
    var P = V.map(function (v) {
      var X = v[0], Y = v[1], Z = v[2], t;
      t = Y * cx - Z * sx; Z = Y * sx + Z * cx; Y = t;           // x
      t = X * cy + Z * sy; Z = -X * sy + Z * cy; X = t;          // y
      t = X * cz - Y * sz; Y = X * sz + Y * cz; X = t;           // z
      var p = 4 / (4 + Z * 0.5);                                 // light perspective
      return [px + X * sc * p, py + Y * sc * p];
    });
    ctx.globalAlpha = a;
    ctx.beginPath();
    E.forEach(function (e) { ctx.moveTo(P[e[0]][0], P[e[0]][1]); ctx.lineTo(P[e[1]][0], P[e[1]][1]); });
    ctx.stroke();
  }

  var running = false;
  function frame(now) {
    var dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    var k = 1 - Math.exp(-dt * 14);
    var nx = x + (mx - x) * k, ny = y + (my - y) * k;
    vx = (nx - x) / Math.max(dt, 1e-3); vy = (ny - y) / Math.max(dt, 1e-3);
    x = nx; y = ny;
    // it rolls with the motion, and keeps a slow drift of its own
    ry += (vx * 0.00045 + 0.25) * dt * 4;
    rx += (-vy * 0.00045 + 0.18) * dt * 4;
    rz += 0.08 * dt;
    s += (sT - s) * (1 - Math.exp(-dt * 10));
    alpha += (alphaT - alpha) * (1 - Math.exp(-dt * 8));

    // drop an echo every few frames while moving
    var speed = Math.hypot(vx, vy);
    if (speed > 40 && (tick++ % 3 === 0)) trail.push({ x: x, y: y, rx: rx, ry: ry, rz: rz, s: s, life: 1 });
    if (trail.length > 14) trail.shift();

    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.lineJoin = 'round';
    for (var i = trail.length - 1; i >= 0; i--) {
      var t = trail[i];
      t.life -= dt * 2.4;
      if (t.life <= 0) { trail.splice(i, 1); continue; }
      draw(t.x, t.y, t.s * (0.7 + 0.3 * t.life), t.rx, t.ry, t.rz, 0.35 * t.life * t.life * alpha);
    }
    draw(x, y, s, rx, ry, rz, 0.95 * alpha);

    idle += dt;
    if (alpha < 0.01 && alphaT === 0 && !trail.length) { ctx.clearRect(0, 0, W, H); running = false; last = 0; return; }
    requestAnimationFrame(frame);
  }
})();
