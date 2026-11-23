/* Look page: dim the lights while one of the dark 3D rooms fills the screen. */
(function () {
  var rooms = document.querySelectorAll('.look-room');
  if (!rooms.length || !('IntersectionObserver' in window)) return;
  var inside = new Set();
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) inside.add(e.target); else inside.delete(e.target); });
    document.body.classList.toggle('in-room', inside.size > 0);
  }, { rootMargin: '-45% 0px -45% 0px' });          // "in" once a room crosses the middle of the screen
  rooms.forEach(function (r) { io.observe(r); });
})();

/* Back to top — a quiet text button at the end of each Look room's caption bar. */
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('[data-totop]').forEach(function (b) {
    b.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduce.matches ? 'auto' : 'smooth' });
      var first = document.querySelector('.switch__btn');
      if (first) first.focus({ preventScroll: true });
    });
  });
})();

/* Read / Look switch — click the ball, or drag / swipe it across. */
(function () {
  var lane = document.querySelector('.switch__lane');
  if (!lane) return;
  var track = lane.parentNode;
  function toggle() {
    var off = document.querySelector('.switch__btn[aria-selected="false"]');
    if (off) off.click();
  }
  function goTo(mode) {
    if (document.body.getAttribute('data-mode') === mode) return;
    var b = document.querySelector('.switch__btn[data-mode-btn="' + mode + '"]');
    if (b) b.click();
  }
  var drag = null, suppressClick = false;
  // the whole switch (ball and words) can be swiped, not only the ball
  track.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    var roll = lane.getBoundingClientRect().width - lane.querySelector('.switch__face').getBoundingClientRect().width;
    drag = { x: e.clientX, y: e.clientY, roll: Math.max(roll, 1), from: document.body.getAttribute('data-mode') === 'look' ? 1 : 0, moved: false, id: e.pointerId, touch: e.pointerType !== 'mouse' };
  });
  track.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved) {
      if (Math.abs(dx) < 4) { if (drag.touch && Math.abs(dy) > 10) drag = null; return; }   // a clear vertical swipe is a page scroll
      if (drag.touch && Math.abs(dy) > Math.abs(dx) * 1.5) { drag = null; return; }
      drag.moved = true;
      try { track.setPointerCapture(e.pointerId); } catch (err) {}
      lane.classList.add('is-dragging');
    }
    var p = Math.min(1, Math.max(0, drag.from + dx / drag.roll));
    drag.p = p;
    track.style.setProperty('--p', p.toFixed(3));
  });
  function end(e) {
    if (!drag) return;
    var d = drag; drag = null;
    if (!d.moved) return;
    lane.classList.remove('is-dragging');
    track.style.removeProperty('--p');
    var p = d.p == null ? d.from : d.p;
    goTo(p > 0.5 ? 'look' : 'read');
    // set after switching: the switch itself is a (synthetic) click that must go through
    suppressClick = true; setTimeout(function () { suppressClick = false; }, 60);
  }
  track.addEventListener('pointerup', end);
  track.addEventListener('pointercancel', end);
  // a drag that ends over a word must not also count as a click on it
  track.addEventListener('click', function (e) { if (suppressClick) { e.stopPropagation(); e.preventDefault(); } }, true);
  lane.addEventListener('click', function () { if (!suppressClick) toggle(); });
})();

/* Contact — copy the address, and Escape closes the sheet. */
(function () {
  var modal = document.getElementById('contactModal');
  if (!modal) return;
  var copy = modal.querySelector('[data-copy]');
  if (copy) copy.addEventListener('click', function () {
    var done = function () { copy.textContent = 'Copied'; setTimeout(function () { copy.textContent = 'Copy'; }, 1600); };
    if (navigator.clipboard) navigator.clipboard.writeText(copy.dataset.copy).then(done, function () {});
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal.getAttribute('aria-hidden') === 'false') {
      var c = modal.querySelector('[data-modal-close]'); if (c) c.click();
    }
  });
})();
