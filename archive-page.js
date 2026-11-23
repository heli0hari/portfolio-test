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
if (!webglAvailable()) {
  document.getElementById('archiveFallback').hidden = false;
  document.getElementById('archiveHint').hidden = true;
} else {
  fetch('photos.json')
    .then(r => r.json())
    .then(data => {
      let done = 0;
      const api = mountArchive(stage, data.photos || [], {
        onOpen: open,
        onHover: (p, i, n) => { nowEl.textContent = p ? pad(i + 1) + ' / ' + pad(n) + '  —  ' + label(p) : ' '; },
        onReady: () => document.body.classList.add('is-ready'),
      });
      // loading line: rough progress from texture count
      const n = api.list.length;
      const poll = setInterval(() => {
        done = Math.min(n, done + 1);
        if (document.body.classList.contains('is-ready')) { loadingBar.style.transform = 'scaleX(1)'; clearInterval(poll); }
      }, 120);
      nowEl.textContent = n + ' photographs';
    })
    .catch(err => console.warn('Archive: could not load photos.json', err));
}
