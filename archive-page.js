import { mountArchive, webglAvailable } from './archive.js';

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

function show() {
  const p = vList[vPos];
  vImg.classList.remove('is-sharp');
  vImg.src = p.thumb || p.src;                 // instant preview
  vImg.alt = p.alt || ('Photograph, ' + label(p));
  const full = new Image();                    // then swap in the original
  full.onload = () => { if (vList[vPos] === p) { vImg.src = p.src; vImg.classList.add('is-sharp'); } };
  full.src = p.src;
  vCap.textContent = label(p);
  vCount.textContent = pad(vPos + 1) + ' / ' + pad(vList.length);
}
function open(i, list) {
  vList = list; vPos = i; lastFocus = document.activeElement;
  show();
  viewer.classList.add('is-open');
  viewer.setAttribute('aria-hidden', 'false');
  document.documentElement.style.overflow = 'hidden';
  document.getElementById('viewerClose').focus();
}
function close() {
  viewer.classList.remove('is-open');
  viewer.setAttribute('aria-hidden', 'true');
  document.documentElement.style.overflow = '';
  if (lastFocus) lastFocus.focus();
}
function step(d) { vPos = (vPos + d + vList.length) % vList.length; show(); }

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
const HINTS = ['Drag to turn · Scroll to open', 'Keep scrolling', 'Drag or scroll to browse · Tap to view'];

if (!webglAvailable()) {
  document.getElementById('archiveFallback').hidden = false;
  hint.hidden = true;
  section.style.height = 'auto';
} else {
  fetch('photos.json')
    .then(r => r.json())
    .then(data => {
      const api = mountArchive(stage, data.photos || [], {
        onOpen: open,
        onHover: (p, i, n) => { nowEl.textContent = p ? pad(i + 1) + ' / ' + pad(n) + '  —  ' + label(p) : '\u00a0'; },
        onStage: s => {
          hint.textContent = HINTS[s];
          document.body.classList.toggle('is-open', s > 0);
          if (s === 0) nowEl.textContent = api.list.length + ' photographs';
        },
        onLoad: (d, n) => {
          loadingBar.style.transform = 'scaleX(' + (d / n) + ')';
          if (d === n) document.body.classList.add('is-ready');
        },
      });
      nowEl.textContent = api.list.length + ' photographs';

      function progress() {
        const r = section.getBoundingClientRect();
        const total = section.offsetHeight - window.innerHeight;
        return total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0;
      }
      function onScroll() {
        const p = progress();
        api.setProgress(p);
        rail.style.transform = 'scaleY(' + p.toFixed(4) + ')';
      }
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll);
      onScroll();

      // arrow keys step through the carousel when it's on screen
      document.addEventListener('keydown', e => {
        if (viewer.classList.contains('is-open') || api.stage() !== 2) return;
        if (e.key === 'ArrowRight') { api.step(1); e.preventDefault(); }
        else if (e.key === 'ArrowLeft') { api.step(-1); e.preventDefault(); }
        else if (e.key === 'Enter' && api.front() >= 0) open(api.front(), api.list);
      });
    })
    .catch(err => console.warn('Archive: could not load photos.json', err));
}
