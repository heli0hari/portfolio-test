import { mountArchive, webglAvailable } from './archive.js?v=1795407710';

const stage = document.getElementById('archiveStage');
const nowEl = document.getElementById('archiveNow');
const loadingBar = document.querySelector('#archiveLoading i');

function label(p) {
  return (p.tags && p.tags.length) ? p.tags.slice(0, 2).join(' · ') : 'photograph';
}
function pad(n) { return String(n).padStart(2, '0'); }

/* ---------- viewer ---------- */
const viewer = document.getElementById('viewer');
const vImg = document.getElementById('viewerImg');
const vCap = document.getElementById('viewerCap');
const vCount = document.getElementById('viewerCount');
let vList = [], vPos = 0, lastFocus = null;

let api = null;                               // set once the sculpture mounts
let animating = false;
const EASE = 'cubic-bezier(0.65, 0, 0.35, 1)';

function show() {
  const p = vList[vPos];
  vImg.classList.remove('is-sharp');
  vImg.src = p.thumb || p.src;                 // instant preview (already cached from the wall)
  vImg.alt = p.alt || ('Photograph, ' + label(p));
  const full = new Image();                    // then swap in the original
  full.onload = () => { if (vList[vPos] === p) { vImg.src = p.src; vImg.classList.add('is-sharp'); } };
  full.src = p.src;
  vCap.textContent = label(p);
  vCount.textContent = pad(vPos + 1) + ' / ' + pad(vList.length);
  if (api) api.lift(p);                        // the card on the wall is "in" the viewer
}

/* Final on-screen box of the image, from the photo's aspect and the CSS limits. */
function finalBox(p) {
  const maxW = Math.min(innerWidth * (innerWidth < 700 ? 0.94 : 0.88), 1600);
  const maxH = innerHeight * 0.8;
  const a = p.w / p.h;
  let w = maxW, h = w / a;
  if (h > maxH) { h = maxH; w = h * a; }
  return { w, h };
}

/* FLIP: the image starts exactly over the card on the wall and grows into place. */
function flipFrom(rect, reverse, done) {
  const box = vImg.getBoundingClientRect();
  const sx = rect.width / box.width, sy = rect.height / box.height;
  const dx = rect.left - box.left, dy = rect.top - box.top;
  const start = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
  const anim = vImg.animate(
    reverse ? [{ transform: 'none' }, { transform: start }] : [{ transform: start }, { transform: 'none' }],
    { duration: 620, easing: EASE, fill: 'forwards' }
  );
  anim.onfinish = () => { anim.cancel(); done && done(); };
}

function open(i, list, rect) {
  if (animating) return;
  vList = list; vPos = i; lastFocus = document.activeElement;
  show();
  const { w, h } = finalBox(vList[vPos]);
  vImg.style.width = w + 'px'; vImg.style.height = h + 'px';
  viewer.classList.add('is-open');
  viewer.setAttribute('aria-hidden', 'false');
  document.documentElement.style.overflow = 'hidden';
  if (rect && !reduceMotion) {
    animating = true;
    viewer.classList.add('is-flipping');
    flipFrom(rect, false, () => { animating = false; viewer.classList.remove('is-flipping'); });
  }
  document.getElementById('viewerClose').focus({ preventScroll: true });
}
function close() {
  if (animating || !viewer.classList.contains('is-open')) return;
  const rect = api && !reduceMotion ? api.rectFor(vList[vPos]) : null;
  const finish = () => {
    viewer.classList.remove('is-open', 'is-closing', 'is-flipping');
    viewer.setAttribute('aria-hidden', 'true');
    document.documentElement.style.overflow = '';
    if (api) api.release();
    animating = false;
    if (lastFocus) lastFocus.focus({ preventScroll: true });
  };
  if (rect) {
    // shrink back into its card on the wall
    animating = true;
    viewer.classList.add('is-closing', 'is-flipping');
    flipFrom(rect, true, finish);
  } else {
    if (api) api.release();
    viewer.classList.remove('is-open');
    viewer.setAttribute('aria-hidden', 'true');
    document.documentElement.style.overflow = '';
    if (lastFocus) lastFocus.focus({ preventScroll: true });
  }
}
function step(d) {
  if (animating) return;
  vPos = (vPos + d + vList.length) % vList.length;
  vImg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: EASE });
  show();
  const { w, h } = finalBox(vList[vPos]);
  vImg.style.width = w + 'px'; vImg.style.height = h + 'px';
}
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

document.getElementById('viewerClose').addEventListener('click', close);
document.getElementById('viewerPrev').addEventListener('click', () => step(-1));
document.getElementById('viewerNext').addEventListener('click', () => step(1));
viewer.addEventListener('click', e => { if (e.target === viewer) close(); });
document.addEventListener('keydown', e => {
  if (!viewer.classList.contains('is-open')) return;
  if (e.key === 'Escape') close();
  else if (e.key === 'ArrowRight') step(1);
  else if (e.key === 'ArrowLeft') step(-1);
});
let touchX = null;
viewer.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
viewer.addEventListener('touchend', e => {
  if (touchX == null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
  touchX = null;
});

/* ---------- sculpture ---------- */
const section = document.getElementById('archive');
const hint = document.getElementById('archiveHint');
const rail = document.getElementById('archiveRail');
const HINTS = ['Drag to turn · Scroll to open', 'Keep scrolling', 'Scroll or drag to browse · Click a photo to view'];

if (!webglAvailable()) {
  document.getElementById('archiveFallback').hidden = false;
  hint.hidden = true;
  section.style.height = 'auto';
} else {
  fetch('photos.json')
    .then(r => r.json())
    .then(data => {
      api = mountArchive(stage, data.photos || [], {
        onOpen: open,
        onHover: (p, i, n) => { nowEl.textContent = p ? pad(i + 1) + ' / ' + pad(n) + '  —  ' + label(p) : api.total + ' photographs'; },
        onStage: s => {
          hint.textContent = HINTS[s];
          document.body.classList.toggle('is-open', s > 0);
          document.body.classList.toggle('is-carousel', s === 2);
          if (s === 0) nowEl.textContent = api.total + ' photographs';
        },
        onLoad: (d, n) => {
          loadingBar.style.transform = 'scaleX(' + (d / n) + ')';
          if (d === n) document.body.classList.add('is-ready');
        },
      });
      nowEl.textContent = api.total + ' photographs';
      setTimeout(() => document.body.classList.add('is-ready'), 6000);   // slow network: show it anyway

      // Scroll length: two screens for the explode + form, then enough to turn
      // the carousel once through every photo (~7% of a screen per photo).
      const INTRO = 2;
      function sizeSection() { section.style.height = ((1 + INTRO + api.spinScreens()) * 100) + 'vh'; }
      sizeSection();
      function onScroll() {
        const vh = window.innerHeight;
        const y = -section.getBoundingClientRect().top;
        const total = Math.max(1, section.offsetHeight - vh);
        const intro = Math.min(1, Math.max(0, y / (INTRO * vh)));
        const spin = Math.min(1, Math.max(0, (y - INTRO * vh) / Math.max(1, total - INTRO * vh)));
        api.setProgress(intro, spin);
        rail.style.transform = 'scaleY(' + Math.min(1, Math.max(0, y / total)).toFixed(4) + ')';
      }
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', () => { sizeSection(); onScroll(); });
      onScroll();

      // arrow keys step through the carousel when it's on screen
      document.addEventListener('keydown', e => {
        if (viewer.classList.contains('is-open') || api.stage() !== 2) return;
        if (e.key === 'ArrowRight') { api.step(1); e.preventDefault(); }
        else if (e.key === 'ArrowLeft') { api.step(-1); e.preventDefault(); }
      });
    })
    .catch(err => console.warn('Archive: could not load photos.json', err));
}
