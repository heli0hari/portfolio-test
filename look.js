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

/* Back to top — a thin rail on the right edge of the Look page; it fills as you scroll. */
(function () {
  var btn = document.getElementById('toTop');
  var fill = document.getElementById('toTopFill');
  if (!btn) return;
  btn.hidden = false;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var ticking = false;
  function update() {
    ticking = false;
    var look = document.body.getAttribute('data-mode') === 'look';
    var max = document.documentElement.scrollHeight - window.innerHeight;
    var show = look && window.scrollY > window.innerHeight;
    btn.classList.toggle('is-shown', show);
    btn.tabIndex = show ? 0 : -1;
    if (fill && max > 0) fill.style.transform = 'scaleY(' + Math.min(1, window.scrollY / max) + ')';
  }
  window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  window.addEventListener('resize', update);
  new MutationObserver(update).observe(document.body, { attributes: true, attributeFilter: ['data-mode'] });
  btn.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: reduce.matches ? 'auto' : 'smooth' });
    var first = document.querySelector('.switch__btn');
    if (first) first.focus({ preventScroll: true });
  });
  update();
})();

/* Read / Look switch — the underline sits under whichever word is active. */
(function () {
  var track = document.querySelector('.switch__track');
  if (!track) return;
  function place() {
    var on = track.querySelector('.switch__btn[aria-selected="true"]');
    if (!on) return;
    track.style.setProperty('--sx', on.offsetLeft + 'px');
    track.style.setProperty('--sw', on.offsetWidth + 'px');
  }
  new MutationObserver(place).observe(track, { attributes: true, subtree: true, attributeFilter: ['aria-selected'] });
  window.addEventListener('resize', place);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(place);
  place();
})();
