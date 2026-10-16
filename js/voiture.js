/* Garage du Seyon — fiche détaillée d'un véhicule (/voiture/<id>).
   Les données viennent du back-office via /api/cars?id=… */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const nf = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  const id = decodeURIComponent((location.pathname.match(/\/voiture\/([^/]+)/) || [])[1] || new URLSearchParams(location.search).get('id') || '');

  // menu mobile
  const nav = $('#nav'), burger = $('#burger'), menu = $('#menu');
  burger.addEventListener('click', () => {
    const open = !nav.classList.contains('is-open');
    nav.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', open);
    if (open) menu.hidden = false; else setTimeout(() => { if (!nav.classList.contains('is-open')) menu.hidden = true; }, 350);
  });

  const gone = () => {
    document.title = 'Véhicule vendu — Garage du Seyon';
    $('#vf').classList.add('is-gone');
    $('#vf-gone').hidden = false;
    $('#vf').removeAttribute('aria-busy');
  };

  const load = id
    ? fetch('/api/cars?id=' + encodeURIComponent(id))
        .then((r) => (r.status === 404 ? null : r.ok ? r.json().then((d) => d.car) : Promise.reject()))
        .catch(() => fetch('/data/seed.json').then((r) => r.json()).then((d) => d.cars.find((c) => c.id === id) || null))
    : Promise.resolve(null);

  load.then((car) => (car ? render(car) : gone())).catch(gone);

  function render(c) {
    const name = `${c.brand} ${c.model}`;
    document.title = `${name}${c.year ? ' (' + c.year + ')' : ''} — Garage du Seyon`;
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.content = `${name}${c.year ? ', ' + c.year : ''} · CHF ${nf(c.price)}.– · en vente au Garage du Seyon, Dombresson.`;

    $('#vf-brand').textContent = c.brand;
    $('#vf-model').textContent = c.model;
    $('#vf-sub').textContent = [c.year, c.km || c.km === 0 ? `${nf(c.km)} km` : '', c.ps ? `${c.ps} ch` : ''].filter(Boolean).join(' · ');
    if (c.badge) { $('#vf-badge').textContent = c.badge; $('#vf-badge').hidden = false; }
    $('#vf-price').textContent = `CHF ${nf(c.price)}.–`;
    const want = '/?voiture=' + encodeURIComponent(`${name}${c.year ? ' (' + c.year + ')' : ''}, CHF ${nf(c.price)}.–`) + '#contact';
    $('#vf-want').href = want;
    $('#vf-want-2').href = want;
    if (c.url) { $('#vf-as').href = c.url; $('#vf-as').hidden = false; }

    const SPECS = [
      ['Année', c.year],
      ['Kilométrage', c.km || c.km === 0 ? `${nf(c.km)} km` : ''],
      ['Puissance', c.ps ? `${c.ps} ch` : ''],
      ['Boîte', c.gear], ['Carburant', c.fuel], ['Couleur', c.color],
    ].filter(([, v]) => v !== '' && v != null && v !== 0);
    $('#vf-specs').innerHTML = SPECS.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
    if (c.description) { $('#vf-desc').textContent = c.description; $('#vf-desc-wrap').hidden = false; }

    gallery(c.photos || [], name);
    $('#vf').removeAttribute('aria-busy');
    requestAnimationFrame(() => $('#vf').classList.add('is-in'));
  }

  // ------------------------------------------------------------- galerie
  function gallery(photos, name) {
    let i = 0;
    const img = $('#gal-img'), thumbs = $('#gal-thumbs'), many = photos.length > 1;
    const lb = $('#lb'), lbImg = $('#lb-img');
    $('#gal').classList.toggle('is-single', !many);
    lb.classList.toggle('is-single', !many);
    thumbs.innerHTML = photos.map((p, k) => `<button type="button" role="tab" aria-label="Photo ${k + 1}"><img src="${esc(p)}" alt="" loading="lazy" decoding="async"></button>`).join('');
    const tbtns = [...thumbs.children];

    const lbShow = () => { lbImg.src = photos[i]; lbImg.alt = img.alt; $('#lb-count').textContent = many ? `${i + 1} / ${photos.length}` : ''; };
    const show = (k, init) => {
      i = (k + photos.length) % photos.length;
      img.classList.remove('is-loaded');
      img.onload = () => img.classList.add('is-loaded');
      img.src = photos[i];
      img.alt = `${name}, photo ${i + 1} sur ${photos.length}`;
      if (img.complete && img.naturalWidth) img.classList.add('is-loaded');
      $('#gal-count').textContent = many ? `${i + 1} / ${photos.length}` : '';
      tbtns.forEach((b, k2) => b.setAttribute('aria-selected', String(k2 === i)));
      if (tbtns[i] && !init) thumbs.scrollTo({ left: tbtns[i].offsetLeft - thumbs.clientWidth / 2 + tbtns[i].clientWidth / 2, behavior: 'smooth' });
      if (lb.open) lbShow();
    };

    tbtns.forEach((b, k) => b.addEventListener('click', () => show(k)));
    $('#gal-prev').addEventListener('click', () => show(i - 1));
    $('#gal-next').addEventListener('click', () => show(i + 1));
    const moved = swipe($('#gal-main'), (d) => show(i + d));
    $('#gal-main').addEventListener('click', () => { if (!moved()) { lbShow(); lb.showModal(); } });
    $('#lb-close').addEventListener('click', () => lb.close());
    $('#lb-prev').addEventListener('click', () => show(i - 1));
    $('#lb-next').addEventListener('click', () => show(i + 1));
    lb.addEventListener('click', (e) => { if (e.target === lb) lb.close(); });
    swipe(lb, (d) => show(i + d));
    document.addEventListener('keydown', (e) => {
      if (!many) return;
      if (e.key === 'ArrowLeft') show(i - 1);
      if (e.key === 'ArrowRight') show(i + 1);
    });
    show(0, true);
  }

  // glisser du doigt pour changer de photo ; renvoie « vient-on de glisser ? »
  function swipe(el, go) {
    let x0 = null, y0 = 0, last = 0;
    el.addEventListener('pointerdown', (e) => { x0 = e.clientX; y0 = e.clientY; });
    el.addEventListener('pointerup', (e) => {
      if (x0 == null) return;
      const dx = e.clientX - x0, dy = e.clientY - y0;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { last = Date.now(); go(dx < 0 ? 1 : -1); }
      x0 = null;
    });
    return () => Date.now() - last < 300;
  }
})();
