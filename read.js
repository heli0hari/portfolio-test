/* =========================================================
   Read homepage — index interactions
   - a small preview follows the cursor over the project index (desktop)
   - keyboard focus shows the same preview beside the focused row
   - "Elsewhere" links switch to Look and land on that section
   - footer "Write a message" opens the existing contact modal
   Rows are plain #project/<id> links, so the existing hash router opens
   the project modal on click — nothing here is needed for that to work.
   ========================================================= */
(function () {
  var list = document.querySelector('.ix__list');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------- preview ---------- */
  if (list && fine) {
    var pv = document.createElement('div');
    pv.className = 'ix-preview';
    pv.setAttribute('aria-hidden', 'true');
    document.body.appendChild(pv);

    var imgs = {};                                   // one <img> per project, crossfaded
    function imgFor(src) {
      if (!imgs[src]) {
        var im = new Image();
        im.src = src; im.alt = ''; im.decoding = 'async';
        pv.appendChild(im);
        imgs[src] = im;
      }
      return imgs[src];
    }
    // warm the cache once the index is close, so the first hover is instant
    if ('IntersectionObserver' in window) {
      var warm = new IntersectionObserver(function (en) {
        if (!en[0].isIntersecting) return;
        warm.disconnect();
        list.querySelectorAll('.ix__row').forEach(function (r) { imgFor(r.dataset.preview); });
      }, { rootMargin: '600px 0px' });
      warm.observe(list);
    }

    var x = 0, y = 0, tx = 0, ty = 0, raf = 0, active = null, byKey = false;
    function show(row) {
      if (active === row) return;
      active = row;
      var cur = imgFor(row.dataset.preview);
      Object.keys(imgs).forEach(function (k) { imgs[k].classList.toggle('is-current', imgs[k] === cur); });
      pv.classList.add('is-on');
    }
    function hide() { active = null; pv.classList.remove('is-on'); }

    function place() {
      // follow with a little lag; stay inside the viewport (flip left near the right edge)
      var w = pv.offsetWidth, h = pv.offsetHeight;
      var gx = byKey ? tx : tx + 28, gy = ty - h * 0.5;
      if (!byKey && gx + w > innerWidth - 16) gx = tx - w - 28;
      gy = Math.max(16, Math.min(innerHeight - h - 16, gy));
      if (reduce) { x = gx; y = gy; } else { x += (gx - x) * 0.18; y += (gy - y) * 0.18; }
      pv.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
      if (active && (Math.abs(gx - x) > 0.3 || Math.abs(gy - y) > 0.3)) raf = requestAnimationFrame(place);
      else raf = 0;
    }
    function kick() { if (!raf) raf = requestAnimationFrame(place); }

    list.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      var row = e.target.closest('.ix__row');
      if (!row) return;
      if (!active) { x = e.clientX + 28; y = e.clientY - 150; }   // first appearance: no swoop in
      byKey = false;
      tx = e.clientX; ty = e.clientY;
      show(row); kick();
    });
    list.addEventListener('pointerleave', hide);
    window.addEventListener('scroll', function () { if (active && !byKey && !list.matches(':hover')) hide(); }, { passive: true });

    // keyboard: preview sits beside the focused row
    list.addEventListener('focusin', function (e) {
      var row = e.target.closest('.ix__row');
      if (!row || !row.matches(':focus-visible')) return;
      var r = row.getBoundingClientRect();
      tx = r.right - pv.offsetWidth;               // over the right-hand columns, clear of the title
      ty = r.top + r.height / 2;
      x = tx; y = ty - pv.offsetHeight / 2;
      byKey = true;
      show(row); kick();
    });
    window.addEventListener('scroll', function () {
      if (!byKey || !active) return;
      var r = active.getBoundingClientRect();
      ty = r.top + r.height / 2; kick();
    }, { passive: true });
    list.addEventListener('focusout', function (e) {
      if (!list.contains(e.relatedTarget)) hide();
    });
    // the modal opening covers everything; drop the preview with it
    list.addEventListener('click', hide);
  }

  /* ---------- Elsewhere → Look, landing on the right section ---------- */
  document.querySelectorAll('[data-look-target]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var lookBtn = document.querySelector('[data-mode-btn="look"]');
      if (!lookBtn) return;                           // no switch: let the #look link do its thing
      e.preventDefault();
      lookBtn.click();
      var sel = a.getAttribute('data-look-target');
      // wait for the mode switch to show the Look panels, then scroll there
      setTimeout(function () {
        var t = document.querySelector(sel);
        if (t) t.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      }, 120);
    });
  });

  /* ---------- footer links ---------- */
  document.querySelectorAll('[data-open-contact]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var cta = document.querySelector('.cta__primary');   // the hero button already opens the contact modal
      if (!cta) return;
      e.preventDefault();
      cta.click();
    });
  });
  document.querySelectorAll('.colophon a[href="#look"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var lookBtn = document.querySelector('[data-mode-btn="look"]');
      if (!lookBtn) return;
      e.preventDefault();
      lookBtn.click();
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    });
  });
})();
