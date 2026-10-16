/* Garage du Seyon — interface : défilement fluide, vitrine en photos de
   studio pilotées par le scroll, vitrine des occasions, horaires en direct,
   formulaire. */
(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const params = new URLSearchParams(location.search);
  const DEBUG = params.has('debug');
  const hasGsap = !!(window.gsap && window.ScrollTrigger);
  if (hasGsap) gsap.registerPlugin(ScrollTrigger);

  // ================================================================ DONNÉES
  // Horaires (minutes depuis minuit) — atelier : site du garage ; vente : AutoScout24.
  const H = (a, b) => [a[0] * 60 + a[1], b[0] * 60 + b[1]];
  const SCHED = {
    atelier: { 1: [H([7, 30], [12, 0]), H([13, 30], [18, 0])], 2: [H([7, 30], [12, 0]), H([13, 30], [18, 0])], 3: [H([7, 30], [12, 0]), H([13, 30], [18, 0])], 4: [H([7, 30], [12, 0]), H([13, 30], [18, 0])], 5: [H([7, 30], [12, 0]), H([13, 30], [17, 0])] },
    vente: { 1: [H([8, 30], [12, 0]), H([14, 0], [18, 0])], 2: [H([8, 30], [12, 0]), H([14, 0], [18, 0])], 3: [H([8, 30], [12, 0]), H([14, 0], [18, 0])], 4: [H([8, 30], [12, 0]), H([14, 0], [18, 0])], 5: [H([8, 30], [12, 0]), H([14, 0], [17, 0])], 6: [H([9, 0], [12, 0]), H([14, 30], [17, 0])] },
  };
  const ROWS = {
    atelier: [
      { label: 'Lun – jeu', days: [1, 2, 3, 4], text: '7:30 – 12:00<br>13:30 – 18:00' },
      { label: 'Vendredi', days: [5], text: '7:30 – 12:00<br>13:30 – 17:00' },
      { label: 'Sam – dim', days: [6, 0], text: 'Fermé', closed: true },
    ],
    vente: [
      { label: 'Lun – jeu', days: [1, 2, 3, 4], text: '8:30 – 12:00<br>14:00 – 18:00' },
      { label: 'Vendredi', days: [5], text: '8:30 – 12:00<br>14:00 – 17:00' },
      { label: 'Samedi*', days: [6], text: '9:00 – 12:00<br>14:30 – 17:00' },
      { label: 'Dimanche', days: [0], text: 'Fermé', closed: true },
    ],
  };
  // ============================================================= OUTILS
  const nf = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  const fr = (v, dec) => v.toFixed(dec).replace('.', ',');
  const fmtCount = (el, v) => {
    const dec = +(el.dataset.dec || 0);
    if (dec) el.textContent = fr(v, dec);
    else if (el.dataset.sep) el.textContent = String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    else el.textContent = Math.round(v);
  };

  // ======================================================= DÉFILEMENT FLUIDE
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);
  let lenis = null;
  if (window.Lenis) {
    lenis = new Lenis({ duration: 1.15, smoothWheel: true, wheelMultiplier: 0.95, touchMultiplier: 1.4 });
    if (hasGsap) {
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add((t) => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      const r = (t) => { lenis.raf(t); requestAnimationFrame(r); };
      requestAnimationFrame(r);
    }
  }
  const scrollToY = (y, opts) => { if (lenis) lenis.scrollTo(y, Object.assign({ duration: 1.6, force: true }, opts)); else window.scrollTo({ top: y, behavior: 'smooth' }); };
  // descend vers un élément ; si la page a bougé pendant le trajet (images, annonces chargées), corrige à l'arrivée
  const topOf = (el) => el.getBoundingClientRect().top + window.scrollY;
  const goTo = (el, opts) => scrollToY(topOf(el), Object.assign({}, opts, {
    onComplete: () => { if (Math.abs(topOf(el) - window.scrollY) > 4) scrollToY(topOf(el), { duration: 0.6 }); },
  }));

  // ================================================================ EN-TÊTE
  const nav = $('#nav');
  const burger = $('#burger'), menu = $('#menu');
  const setMenu = (open) => {
    nav.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    burger.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
    if (open) { menu.hidden = false; if (lenis) lenis.stop(); }
    else { setTimeout(() => { if (!nav.classList.contains('is-open')) menu.hidden = true; }, 350); if (lenis) lenis.start(); }
  };
  burger.addEventListener('click', () => setMenu(!nav.classList.contains('is-open')));
  const onScrollNav = () => nav.classList.toggle('is-scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScrollNav, { passive: true });
  onScrollNav();

  // ancres
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href');
    if (id.length < 2 && id !== '#') return;
    const t = id === '#top' || id === '#' ? document.body : $(id);
    if (!t) return;
    e.preventDefault();
    setMenu(false);
    if (id === '#top' || id === '#' || id === '#accueil') scrollToY(0); else goTo(t);
  });

  // lien actif
  const navLinks = $$('[data-nav]');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => {
      es.forEach((en) => {
        if (!en.isIntersecting) return;
        const id = en.target.id === 'showroom' ? 'atelier' : en.target.id;
        navLinks.forEach((l) => l.classList.toggle('is-active', l.dataset.nav === id));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    ['accueil', 'garage', 'occasions', 'atelier', 'showroom', 'contact'].forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
  }

  // ============================================================== VITRINE
  // Comme sur les pages produit d'Apple : pas de 3D, une image de studio que le
  // défilement pilote — la carte s'ouvre en plein cadre, puis la « caméra »
  // glisse et zoome vers les détails.
  if (hasGsap) {
    // ouverture
    gsap.timeline({ delay: 0.15 })
      .fromTo('.cx-hero__eyebrow', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 1, ease: 'expo.out' }, 0)
      .fromTo('[data-hero] .ln > span', { y: 0, yPercent: 110 }, { y: 0, yPercent: 0, duration: 1.3, ease: 'expo.out', stagger: 0.09 }, 0.08)
      .fromTo('.chap--hero .chap__frame', { y: 70, opacity: 0 }, { y: 0, opacity: 1, duration: 1.6, ease: 'expo.out', clearProps: 'transform' }, 0.3);

    const portrait = window.matchMedia('(max-aspect-ratio: 5/6)');
    $$('.chap').forEach((ch) => {
      const frame = $('.chap__frame', ch), head = $('.chap__head', ch), media = $('.chap__media', ch), img = $('.chap__img', ch);
      const copies = $$('.chap__copy', ch), dotsBox = $('.chap__dots', ch), dots = $$('.chap__dots i', ch);
      // au départ, l'image est réduite à la taille de la carte pour montrer la voiture entière
      const card = () => {
        const cs = getComputedStyle(frame), v = (k) => parseFloat(cs.getPropertyValue(k));
        return { s: v('--ps') || 0.88, y: v('--py') || 0 };
      };
      // plans de caméra (data-shots) : point visé u,v en fraction de l'image, puis zoom
      const SHOTS = (media.dataset.shots || '').split(';').filter(Boolean).map((s) => s.split(',').map(Number));
      const shot = (i) => {
        const [u, v, s] = SHOTS[i];
        const W = media.clientWidth, H = media.clientHeight, A = (img.naturalWidth || 16) / (img.naturalHeight || 9);
        const dw = Math.max(W, H * A), dh = Math.max(H, W / A); // taille affichée (object-fit: cover)
        const fx = (u * dw - (dw - W) / 2) / W, fy = (v * dh - (dh - H) / 2) / H;
        const gx = portrait.matches ? 0.5 : 0.6, gy = portrait.matches ? 0.5 : 0.44; // où le détail se pose à l'écran
        const lim = 50 * (s - 1); // l'image doit toujours couvrir le cadre
        return { s, x: clamp((gx - 0.5 - (fx - 0.5) * s) * 100, -lim, lim), y: clamp((gy - 0.5 - (fy - 0.5) * s) * 100, -lim, lim) };
      };
      const MOVE = [4.1, 6.9]; // départ de chaque mouvement de caméra
      const T = [2.2, 5.4, 8.2]; // entrée du texte de chaque vue

      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: ch, start: 'top top', end: 'bottom bottom', scrub: 0.6, invalidateOnRefresh: true,
          onUpdate: (st) => {
            const t = st.progress * tl.duration();
            const k = MOVE.reduce((n, m) => (t >= m + 0.6 ? n + 1 : n), 0);
            dots.forEach((d, i) => d.classList.toggle('is-on', i === k));
          },
        },
      });
      // la carte s'ouvre en plein cadre pendant que la voiture grandit
      tl.fromTo(frame, { '--k': 0 }, { '--k': 1, duration: 2.4, ease: 'power1.inOut' }, 0)
        .fromTo(img, { scale: () => card().s, xPercent: 0, yPercent: () => card().y }, { scale: 1, xPercent: 0, yPercent: 0, duration: 2.4, ease: 'power1.inOut' }, 0)
        .to(img, { scale: 1.04, duration: 1.7 }, 2.4)
        .to(head, { y: -60, opacity: 0, duration: 1.3 }, 0.4)
        .fromTo(dotsBox, { opacity: 0 }, { opacity: 1, duration: 0.6 }, 2.2);
      // mouvements de caméra vers les détails, chacun suivi d'une lente avancée
      SHOTS.forEach((_, i) => {
        tl.to(img, { scale: () => shot(i).s, xPercent: () => shot(i).x, yPercent: () => shot(i).y, duration: 1.7, ease: 'power2.inOut' }, MOVE[i])
          .to(img, { scale: () => shot(i).s * 1.04, duration: 1.1 }, MOVE[i] + 1.7);
      });
      // un texte par vue
      copies.forEach((c, i) => {
        tl.fromTo(c, { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.8, ease: 'power2.out' }, T[i]);
        if (i < copies.length - 1) tl.to(c, { autoAlpha: 0, y: -24, duration: 0.5, ease: 'power1.in' }, MOVE[i] - 0.1);
      });
      tl.to({}, { duration: 0.6 }, 9.4);
    });
  } else {
    document.documentElement.classList.remove('js');
  }

  // ========================================================== LE GARAGE
  const statement = $('#statement');
  if (statement) {
    const words = statement.textContent.trim().split(/\s+/);
    statement.innerHTML = words.map((w) => `<span class="w${/exception/.test(w) ? ' rd' : ''}">${w}</span>`).join(' ');
    const ws = $$('.w', statement);
    const light = (pr) => { const n = Math.round(pr * ws.length); ws.forEach((w, i) => w.classList.toggle('on', i < n)); };
    if (hasGsap) ScrollTrigger.create({ trigger: statement, start: 'top 82%', end: 'bottom 42%', onUpdate: (st) => light(st.progress) });
    else light(1);
  }
  const factStock = $('#fact-stock');

  // compteurs hors de la scène (une seule fois, à l'apparition)
  $$('.facts [data-count]').forEach((el) => {
    const to = +el.dataset.count;
    const run = () => {
      const t0 = performance.now();
      const f = (now) => { const k = clamp((now - t0) / 1400, 0, 1); fmtCount(el, to * easeOut(k)); if (k < 1) requestAnimationFrame(f); };
      requestAnimationFrame(f);
    };
    if (hasGsap) ScrollTrigger.create({ trigger: el, start: 'top 90%', once: true, onEnter: run }); else fmtCount(el, to);
  });

  // ============================================================ OCCASIONS
  // Annonces gérées depuis le back-office (/admin), servies par /api/cars.
  const grid = $('#stock-grid');
  const km = (v) => (v < 1000 ? v + ' km' : nf(v) + ' km');
  const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  const chips = $$('#chips .chip');
  function renderStock(list) {
    const cars = list.slice().sort((x, y) => y.price - x.price);
    grid.innerHTML = cars.length ? cars.map((c) => `
    <a class="car" href="/voiture/${encodeURIComponent(c.id)}" data-cat="${esc(c.cat)}">
      <div class="car__media"><img src="${esc(c.photos[0])}" alt="${esc(c.brand)} ${esc(c.model)}" loading="lazy" decoding="async">${c.badge ? `<span class="car__badge">${esc(c.badge)}</span>` : ''}</div>
      <div class="car__body">
        <span class="car__brand">${esc(c.brand)}</span>
        <h3 class="car__name">${esc(c.model)}</h3>
        <p class="car__meta">${[c.year, c.km || c.km === 0 ? km(c.km) : '', c.ps ? c.ps + ' ch' : '', c.gear].filter(Boolean).map((v) => `<span>${esc(v)}</span>`).join('')}</p>
        <div class="car__foot"><span class="car__price">CHF ${nf(c.price)}.–</span><span class="car__go">Voir la fiche <svg><use href="#i-arrow"/></svg></span></div>
      </div>
    </a>`).join('') : '<p class="stock__empty">Aucun véhicule en vitrine pour le moment. Appelez-nous au 032 853 28 40.</p>';
    $$('.car__media img', grid).forEach((img) => {
      const done = () => img.classList.add('is-loaded');
      if (img.complete && img.naturalWidth) done(); else { img.addEventListener('load', done); img.addEventListener('error', done); }
    });
    const counts = { all: cars.length, sport: 0, family: 0, other: 0 };
    cars.forEach((c) => { if (c.cat in counts) counts[c.cat]++; });
    chips.forEach((ch) => { ch.querySelector('span').textContent = counts[ch.dataset.f]; });
    if (factStock) { factStock.dataset.count = cars.length; factStock.textContent = cars.length; }
    if (hasGsap) {
      gsap.set('.car', { opacity: 0, y: 30 });
      ScrollTrigger.batch('.car', { start: 'top 92%', once: true, onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 1, ease: 'expo.out', stagger: 0.07 }) });
      ScrollTrigger.refresh();
    }
  }
  const stockReady = fetch('/api/cars').then((r) => (r.ok ? r.json() : Promise.reject()))
    .catch(() => fetch('/data/seed.json').then((r) => r.json()))
    .then((d) => renderStock(d.cars || []))
    .catch(() => renderStock([]));
  chips.forEach((ch) => ch.addEventListener('click', () => {
    const f = ch.dataset.f;
    chips.forEach((c) => { c.classList.toggle('is-on', c === ch); c.setAttribute('aria-selected', c === ch ? 'true' : 'false'); });
    const cards = $$('.car', grid);
    const show = cards.filter((c) => f === 'all' || c.dataset.cat === f);
    if (hasGsap) {
      gsap.to(cards, { opacity: 0, y: 12, duration: 0.25, ease: 'power2.in', onComplete: () => {
        cards.forEach((c) => c.classList.toggle('is-hidden', !show.includes(c)));
        gsap.fromTo(show, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.7, ease: 'expo.out', stagger: 0.045 });
        ScrollTrigger.refresh();
      } });
    } else cards.forEach((c) => c.classList.toggle('is-hidden', !show.includes(c)));
  }));

  // ============================================================== ATELIER
  $$('[data-spot]').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  });

  // fenêtre « Tarifs géométrie »
  $$('[data-open]').forEach((btn) => {
    const dlg = document.getElementById(btn.dataset.open);
    if (!dlg || !dlg.showModal) return;
    const close = () => {
      if (!dlg.open || dlg.classList.contains('is-closing')) return;
      dlg.classList.add('is-closing');
      setTimeout(() => { dlg.classList.remove('is-closing'); dlg.close(); }, 280);
    };
    btn.addEventListener('click', () => { dlg.showModal(); if (lenis) lenis.stop(); });
    dlg.addEventListener('close', () => { if (lenis) lenis.start(); });
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-close]')) close(); });
  });

  // ============================================================== SHOWROOM
  if (hasGsap) {
    const narrow = () => window.innerWidth < 600;
    const tl = gsap.timeline({ scrollTrigger: { trigger: '#showroom', start: 'top top', end: 'bottom bottom', scrub: 0.6, invalidateOnRefresh: true } });
    tl.fromTo('#showroom-frame', { clipPath: () => (narrow() ? 'inset(18% 6% 18% 6% round 22px)' : 'inset(14% 12% 14% 12% round 28px)') }, { clipPath: 'inset(0% 0% 0% 0% round 0px)', ease: 'none', duration: 0.65 }, 0)
      .fromTo('#showroom-frame img', { scale: 1.18 }, { scale: 1.0, ease: 'none', duration: 1 }, 0)
      .to('.showroom__text', { opacity: 1, y: 0, ease: 'power2.out', duration: 0.25 }, 0.6);
  }

  // =============================================================== HORAIRES
  function zurich() { return new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Zurich' })); }
  const hm = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
  const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  function renderHours() {
    const now = zurich(), d = now.getDay(), m = now.getHours() * 60 + now.getMinutes();
    for (const k of ['atelier', 'vente']) {
      const ul = document.getElementById('hours-' + k);
      if (!ul) continue;
      ul.innerHTML = ROWS[k].map((r) => `<li class="${r.days.includes(d) ? 'is-today' : ''}${r.closed ? ' is-closed' : ''}"><span>${r.label}</span><span>${r.text}</span></li>`).join('');
    }
    const openNow = (k) => (SCHED[k][d] || []).find(([a, b]) => m >= a && m < b);
    const st = $('#status');
    const a = openNow('atelier'), v = openNow('vente');
    let txt;
    if (a) txt = `Atelier ouvert · jusqu'à ${hm(a[1])}`;
    else if (v) txt = d === 6 ? `Vente sur rendez-vous · jusqu'à ${hm(v[1])}` : `Vente ouverte · jusqu'à ${hm(v[1])}`;
    else {
      // prochaine ouverture de l'atelier
      let found = null;
      for (let k = 0; k < 8 && !found; k++) {
        const dd = (d + k) % 7, sl = SCHED.atelier[dd] || [];
        for (const [o] of sl) if (k > 0 || o > m) { found = { k, dd, o }; break; }
      }
      txt = found ? `Fermé · ouvre ${found.k === 0 ? "aujourd'hui" : found.k === 1 ? 'demain' : DAYS[found.dd]} à ${hm(found.o)}` : 'Fermé';
    }
    st.classList.toggle('is-open', !!(a || v));
    st.lastElementChild.textContent = txt;
  }
  renderHours();
  setInterval(renderHours, 60000);

  // ============================================================= FORMULAIRE
  const form = $('#form'), fmsg = $('#form-msg');
  const wanted = new URLSearchParams(location.search).get('voiture');
  if (wanted) {
    form.elements.message.value = `Bonjour, je suis intéressé(e) par : ${wanted.slice(0, 160)}. Ce véhicule est-il toujours disponible ? `;
    const r = form.querySelector('input[name="sujet"][value^="Achat"]'); if (r) r.checked = true;
  }
  // arrivée depuis une fiche (/?voiture=…#contact) : descendre au formulaire
  if (location.hash.length > 1) {
    const t = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (t) {
      const loaded = document.readyState === 'complete' ? Promise.resolve() : new Promise((r) => window.addEventListener('load', r, { once: true }));
      Promise.all([loaded, stockReady.catch(() => {})]).then(() => setTimeout(() => {
        if (hasGsap) ScrollTrigger.refresh();
        goTo(t, { duration: 1.2 });
      }, 150));
    }
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    let ok = true;
    $$('.field', form).forEach((f) => {
      const inp = f.querySelector('input, textarea');
      const bad = inp.required && (!inp.value.trim() || (inp.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(inp.value.trim())));
      f.classList.toggle('is-bad', bad);
      if (bad) ok = false;
    });
    if (!ok) { fmsg.textContent = 'Merci de compléter votre nom, votre e-mail et votre message.'; return; }
    const fd = new FormData(form);
    const sujet = fd.get('sujet'), nom = fd.get('nom').trim(), mail = fd.get('email').trim(), tel = fd.get('tel').trim();
    const body = `${fd.get('message').trim()}\n\n${nom}\n${mail}${tel ? '\n' + tel : ''}`;
    location.href = `mailto:info@garageduseyon.ch?subject=${encodeURIComponent(`[Site] ${sujet} : ${nom}`)}&body=${encodeURIComponent(body)}`;
    fmsg.textContent = 'Votre messagerie s’ouvre avec le message prêt à partir.';
  });

  // ================================================================== PIED
  const word = $('.foot__word');
  if (word) word.innerHTML = word.textContent.split('').map((ch) => (ch === ' ' ? ' ' : `<span class="ch">${ch}</span>`)).join('');
  const y = $('#year'); if (y) y.textContent = new Date().getFullYear();

  // ============================================================ APPARITIONS
  if (hasGsap) {
    $$('.reveal').filter((el) => !el.closest('.grid')).forEach((el) => {
      ScrollTrigger.create({ trigger: el, start: 'top 90%', once: true, onEnter: () => gsap.to(el, { opacity: 1, y: 0, duration: 1.1, ease: 'expo.out' }) });
    });
    if (word) {
      gsap.set('.foot__word .ch', { yPercent: 60, opacity: 0 });
      ScrollTrigger.create({ trigger: word, start: 'top 95%', once: true, onEnter: () => gsap.to('.foot__word .ch', { yPercent: 0, opacity: 1, duration: 1.2, ease: 'expo.out', stagger: 0.03 }) });
    }
  } else {
    $$('.reveal').forEach((el) => { el.style.opacity = 1; el.style.transform = 'none'; });
  }
  window.addEventListener('load', () => hasGsap && ScrollTrigger.refresh());

  // ================================================================ DÉBOGAGE
  if (DEBUG) {
    window.__gds = {
      lenis,
      // __gds.chap('enzo', 0.5) : place le chapitre à 50 % de son défilement
      chap: (id, p) => { const c = document.getElementById(id); const yy = c.getBoundingClientRect().top + window.scrollY + p *(c.offsetHeight - window.innerHeight); if (lenis) lenis.scrollTo(yy, { immediate: true }); else window.scrollTo(0, yy); },
    };
  }
})();
