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

/* Read / Look switch — clicking the ball rolls it to the other side. */
(function () {
  var lane = document.querySelector('.switch__lane');
  if (!lane) return;
  lane.addEventListener('click', function () {
    var off = document.querySelector('.switch__btn[aria-selected="false"]');
    if (off) off.click();
  });
})();
