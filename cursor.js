/* =========================================================
   Pointer companions — desktop only, never in the way of a click.
   Look page: a small wireframe cube that turns with your motion and
   leaves fading echoes. Read page (and its project pages): a thin
   full-screen crosshair whose lines ripple when you reach something
   clickable (after the Codrops crosshair distortion idea).
   The system cursor stays as it is. Off on touch screens and when
   reduced motion is requested.
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
  function isLook() { return document.body.getAttribute('data-mode') === 'look' && !document.body.classList.contains('modal-open'); }
  new MutationObserver(function () { alphaT = isLook() && mx > 0 ? 1 : 0; if (!running) { running = true; requestAnimationFrame(frame); } })
    .observe(document.body, { attributes: true, attributeFilter: ['data-mode', 'class'] });

  addEventListener('pointermove', function (e) {
    mx = e.clientX + OFFSET; my = e.clientY + OFFSET;
    if (alpha === 0) { x = mx; y = my; }
    alphaT = isLook() ? 1 : 0; idle = 0;
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

  /* ---------------- crosshair (Read) ---------------- */
  var NS = 'http://www.w3.org/2000/svg';
  var wrap = document.createElement('div');
  wrap.className = 'xhair'; wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML =
    '<svg class="xhair__defs" width="0" height="0"><filter id="xhairWarp" filterUnits="userSpaceOnUse" x="-60" y="-60" width="1120" height="1120">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.01 0.02" numOctaves="1" seed="3" result="n"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="n" scale="0" xChannelSelector="R" yChannelSelector="G"/></filter></svg>' +
    '<svg class="xhair__h" viewBox="0 0 1000 40" preserveAspectRatio="none"><line x1="0" y1="20" x2="1000" y2="20"/></svg>' +
    '<svg class="xhair__v" viewBox="0 0 40 1000" preserveAspectRatio="none"><line x1="20" y1="0" x2="20" y2="1000"/></svg>';
  document.body.appendChild(wrap);
  var hEl = wrap.querySelector('.xhair__h'), vEl = wrap.querySelector('.xhair__v');
  var turb = wrap.querySelector('feTurbulence'), disp = wrap.querySelector('feDisplacementMap');
  var cx = -100, cy = -100, tx = -100, ty = -100, warp = 0, warpT = 0, xOn = 0, xLast = 0, xRun = false;
  function xActive() { return document.body.getAttribute('data-mode') === 'read'; }
  addEventListener('pointermove', function (e) {
    tx = e.clientX; ty = e.clientY;
    if (cx < 0) { cx = tx; cy = ty; }
    var t = e.target;
    var hot = !!(t && t.closest && t.closest('a, button, [role="tab"], .ix__row, .jtoc__btn, label, input, textarea'));
    if (hot && warpT === 0) warp = 0;              // restart the ripple on each new target
    warpT = hot ? 1 : 0;
    if (!xRun) { xRun = true; requestAnimationFrame(xFrame); }
  }, { passive: true });
  document.addEventListener('pointerleave', function () { tx = -100; });
  function xFrame(now) {
    var dt = Math.min(0.05, (now - (xLast || now)) / 1000); xLast = now;
    var on = xActive() && tx >= 0 ? 1 : 0;
    xOn += (on - xOn) * (1 - Math.exp(-dt * 10));
    var k = 1 - Math.exp(-dt * 18);
    cx += (tx - cx) * k; cy += (ty - cy) * k;
    hEl.style.transform = 'translate3d(0,' + (cy - 20) + 'px,0)';
    vEl.style.transform = 'translate3d(' + (cx - 20) + 'px,0,0)';
    wrap.style.opacity = xOn.toFixed(3);
    // ripple: rises fast, then eases out while hovering, and dies away when leaving
    warp += ((warpT ? 1 : 0) - warp) * (1 - Math.exp(-dt * (warpT ? 9 : 5)));
    var ripple = warpT ? Math.sin(Math.min(warp, 1) * Math.PI) : warp;   // a swell, then settles back to straight
    disp.setAttribute('scale', (ripple * 60).toFixed(1));
    turb.setAttribute('baseFrequency', (0.004 + ripple * 0.02).toFixed(4) + ' ' + (0.02 + ripple * 0.06).toFixed(4));
    if (xOn < 0.005 && !on) { xRun = false; xLast = 0; return; }
    requestAnimationFrame(xFrame);
  }
})();
