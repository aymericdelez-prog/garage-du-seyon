/* Garage du Seyon — back-office des annonces.
   Connexion → liste des voitures → ajouter / modifier / retirer (vendue).
   Les photos sont réduites dans le navigateur (2000 px max) avant l'envoi. */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const nf = (n) => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  const views = { login: $('#v-login'), list: $('#v-list'), edit: $('#v-edit') };
  let cars = [];
  let editing = null; // id de la voiture modifiée (null = nouvelle)
  let photos = [];    // [{ url, local?, loading? }]
  let dirty = false;

  // ---------------------------------------------------------------- outils
  async function api(action, opts = {}) {
    const r = await fetch('/api/admin?action=' + action, { credentials: 'same-origin', ...opts });
    const data = await r.json().catch(() => ({}));
    if (r.status === 401 && action !== 'login') { show('login'); throw new Error(data.error || 'Session expirée'); }
    if (!r.ok) throw new Error(data.error || 'Erreur, réessayez.');
    return data;
  }
  const post = (action, body) => api(action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

  let toastT;
  function toast(html, ms = 3200) {
    const t = $('#toast');
    t.innerHTML = html;
    t.classList.add('is-on');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('is-on'), ms);
  }

  function show(v) {
    Object.entries(views).forEach(([k, el]) => { el.hidden = k !== v; });
    $('#bar-end').hidden = v === 'login';
    window.scrollTo(0, 0);
  }

  // -------------------------------------------------------------- connexion
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button', e.target), err = $('#login-err');
    btn.disabled = true; err.textContent = '';
    try {
      await post('login', { password: e.target.password.value });
      e.target.reset();
      await loadList();
    } catch (x) { err.textContent = x.message; }
    btn.disabled = false;
  });
  $('#logout').addEventListener('click', async () => { await post('logout').catch(() => {}); show('login'); });

  // ------------------------------------------------------------------ liste
  async function loadList() {
    cars = (await api('list')).cars;
    renderList();
    show('list');
  }

  function renderList() {
    cars.sort((a, b) => b.price - a.price);
    $('#count').textContent = cars.length ? `${cars.length} voiture${cars.length > 1 ? 's' : ''} en ligne sur le site` : 'Aucune voiture en ligne';
    $('#list').innerHTML = cars.length ? cars.map((c) => `
      <li class="row" data-id="${esc(c.id)}">
        <img class="row__img" src="${esc(c.photos[0] || '')}" alt="" loading="lazy">
        <div class="row__txt">
          <div class="row__brand">${esc(c.brand)}</div>
          <div class="row__name">${esc(c.model)}</div>
          <div class="row__meta"><span class="row__price">CHF ${nf(c.price)}.–</span>${c.year ? ' · ' + esc(c.year) : ''}${c.km || c.km === 0 ? ' · ' + nf(c.km) + ' km' : ''}</div>
        </div>
        <div class="row__act">
          <button class="btn" type="button" data-edit>Modifier</button>
          <button class="btn btn--sold" type="button" data-sold>Vendue</button>
        </div>
      </li>`).join('') : '<li class="list__empty">Aucune voiture pour le moment. Cliquez sur « Ajouter une voiture » pour commencer.</li>';
  }

  $('#list').addEventListener('click', (e) => {
    const row = e.target.closest('.row'); if (!row) return;
    const car = cars.find((c) => c.id === row.dataset.id);
    if (e.target.closest('[data-edit]')) openEditor(car);
    if (e.target.closest('[data-sold]')) askRemove(car);
  });
  $('#add').addEventListener('click', () => openEditor(null));

  // ---------------------------------------------------- retrait (vendue)
  const dlg = $('#confirm');
  let toRemove = null;
  function askRemove(car) {
    toRemove = car;
    $('#confirm-title').textContent = `Retirer la ${car.brand} ${car.model} du site ?`;
    dlg.showModal();
  }
  $('#confirm-no').addEventListener('click', () => dlg.close());
  $('#confirm-ok').addEventListener('click', async () => {
    const btn = $('#confirm-ok'); btn.disabled = true;
    try {
      await post('remove', { id: toRemove.id });
      cars = cars.filter((c) => c.id !== toRemove.id);
      renderList();
      dlg.close();
      toast(`La ${esc(toRemove.brand)} ${esc(toRemove.model)} a été retirée du site.`);
    } catch (x) { toast(esc(x.message)); }
    btn.disabled = false;
  });

  // ------------------------------------------------------------ formulaire
  const form = $('#ed');
  function openEditor(car) {
    editing = car ? car.id : null;
    form.reset();
    $('#ed-msg').textContent = '';
    $('#edit-title').textContent = car ? `${car.brand} ${car.model}` : 'Nouvelle voiture';
    $('#save').textContent = car ? 'Enregistrer les modifications' : 'Publier sur le site';
    if (car) {
      ['brand', 'model', 'year', 'km', 'ps', 'color', 'gear', 'fuel', 'price', 'badge', 'description', 'url'].forEach((k) => {
        const el = form.elements[k]; if (!el) return;
        let v = car[k] ?? '';
        if ((k === 'km' || k === 'price') && v !== '') v = nf(v);
        if (k === 'year' || k === 'ps') v = v || '';
        if (el.tagName === 'SELECT' && v && ![...el.options].some((o) => o.value === v)) el.add(new Option(v, v));
        el.value = v;
      });
      const r = form.querySelector(`input[name="cat"][value="${car.cat}"]`); if (r) r.checked = true;
    }
    photos = car ? car.photos.map((url) => ({ url })) : [];
    renderPhotos();
    dirty = false;
    show('edit');
  }

  form.addEventListener('input', () => { dirty = true; });
  // milliers lisibles pendant la saisie : 129900 → 129'900
  ['km', 'price'].forEach((k) => form.elements[k].addEventListener('input', (e) => {
    const digits = e.target.value.replace(/\D/g, '');
    e.target.value = digits ? nf(Number(digits)) : '';
  }));

  const leave = () => {
    if (dirty && !confirm('Quitter sans enregistrer vos modifications ?')) return;
    dirty = false;
    show('list');
  };
  $('#back').addEventListener('click', leave);
  $('#cancel').addEventListener('click', leave);
  window.addEventListener('beforeunload', (e) => { if (dirty && !views.edit.hidden) { e.preventDefault(); e.returnValue = ''; } });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#ed-msg');
    if (photos.some((p) => p.loading)) { msg.textContent = 'Patientez, les photos sont encore en cours d’envoi.'; return; }
    const f = form.elements;
    const missing = [];
    [['brand', 'la marque'], ['model', 'le modèle'], ['price', 'le prix']].forEach(([k, label]) => {
      const bad = !f[k].value.trim();
      f[k].closest('.field').classList.toggle('is-bad', bad);
      if (bad) missing.push(label);
    });
    if (!photos.length) missing.push('au moins une photo');
    if (missing.length) { msg.textContent = `Il manque ${missing.join(', ')}.`; return; }
    msg.textContent = '';
    const car = {
      id: editing || undefined,
      brand: f.brand.value, model: f.model.value, year: f.year.value, km: f.km.value, ps: f.ps.value,
      color: f.color.value, gear: f.gear.value, fuel: f.fuel.value, cat: form.querySelector('input[name="cat"]:checked').value,
      price: f.price.value, badge: f.badge.value, description: f.description.value, url: f.url.value,
      photos: photos.map((p) => p.url),
    };
    const btn = $('#save'); btn.disabled = true; btn.textContent = 'Enregistrement…';
    try {
      const { car: saved } = await post('save', { car });
      const i = cars.findIndex((c) => c.id === saved.id);
      if (i >= 0) cars[i] = saved; else cars.push(saved);
      dirty = false;
      renderList();
      show('list');
      toast(`${editing ? 'Modifications enregistrées' : 'Voiture publiée sur le site'}.<a href="/voiture/${encodeURIComponent(saved.id)}" target="_blank" rel="noopener">Voir la fiche</a>`, 5000);
    } catch (x) { msg.textContent = x.message; }
    btn.disabled = false;
    btn.textContent = editing ? 'Enregistrer les modifications' : 'Publier sur le site';
  });

  // ----------------------------------------------------------------- photos
  const box = $('#photos');
  function renderPhotos() {
    box.innerHTML = photos.map((p, i) => `
      <div class="ph${p.loading ? ' is-loading' : ''}" draggable="${p.loading ? 'false' : 'true'}" data-i="${i}">
        <img src="${esc(p.local || p.url)}" alt="">
        ${i === 0 ? '<span class="ph__main">Photo principale</span>' : ''}
        <button class="ph__x" type="button" data-x aria-label="Supprimer cette photo"><svg><use href="#i-x"/></svg></button>
        <div class="ph__mv">
          <button type="button" data-mv="-1" aria-label="Avancer" ${i === 0 ? 'disabled' : ''}><svg><use href="#i-back"/></svg></button>
          <button type="button" data-mv="1" aria-label="Reculer" ${i === photos.length - 1 ? 'disabled' : ''}><svg><use href="#i-arrow"/></svg></button>
        </div>
      </div>`).join('');
  }
  const move = (from, to) => { if (to < 0 || to >= photos.length) return; const [p] = photos.splice(from, 1); photos.splice(to, 0, p); dirty = true; renderPhotos(); };

  box.addEventListener('click', (e) => {
    const ph = e.target.closest('.ph'); if (!ph) return;
    const i = Number(ph.dataset.i);
    if (e.target.closest('[data-x]')) { photos.splice(i, 1); dirty = true; renderPhotos(); }
    const mv = e.target.closest('[data-mv]'); if (mv) move(i, i + Number(mv.dataset.mv));
  });
  // glisser-déposer pour réordonner
  let dragI = null;
  box.addEventListener('dragstart', (e) => { const ph = e.target.closest('.ph'); if (!ph) return; dragI = Number(ph.dataset.i); ph.classList.add('is-drag'); e.dataTransfer.effectAllowed = 'move'; });
  box.addEventListener('dragend', () => { dragI = null; box.querySelectorAll('.ph').forEach((p) => p.classList.remove('is-drag', 'is-over')); });
  box.addEventListener('dragover', (e) => { if (dragI == null) return; e.preventDefault(); const ph = e.target.closest('.ph'); box.querySelectorAll('.ph').forEach((p) => p.classList.toggle('is-over', p === ph)); });
  box.addEventListener('drop', (e) => { if (dragI == null) return; e.preventDefault(); const ph = e.target.closest('.ph'); if (ph) move(dragI, Number(ph.dataset.i)); });

  // ajout de photos
  const drop = $('#drop'), input = $('#files');
  input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { if (dragI != null) return; e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, () => drop.classList.remove('is-over')));
  drop.addEventListener('drop', (e) => { if (dragI != null) return; e.preventDefault(); addFiles(e.dataTransfer.files); });

  function addFiles(list) {
    const files = [...list].filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic)$/i.test(f.name));
    if (!files.length) return;
    if (photos.length + files.length > 30) { toast('30 photos maximum par voiture.'); return; }
    dirty = true;
    files.forEach((file) => {
      const p = { url: '', local: URL.createObjectURL(file), loading: true };
      photos.push(p);
      renderPhotos();
      shrink(file)
        .then((blob) => api('photo', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Type': 'image/jpeg' }, body: blob }))
        .then(({ url }) => { p.url = url; p.loading = false; renderPhotos(); })
        .catch((x) => {
          photos.splice(photos.indexOf(p), 1);
          renderPhotos();
          toast(/heic|décoder/i.test(x.message) ? `« ${esc(file.name)} » : format non lu par ce navigateur. Exportez la photo en JPEG.` : `Photo « ${esc(file.name)} » non envoyée : ${esc(x.message)}`, 5000);
        });
    });
  }

  // réduit la photo à 2000 px de large maximum, en JPEG de bonne qualité
  function shrink(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const max = 2000, k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error('conversion impossible'))), 'image/jpeg', 0.86);
      };
      img.onerror = () => reject(new Error('Impossible de décoder cette image'));
      img.src = URL.createObjectURL(file);
    });
  }

  // ---------------------------------------------------------------- départ
  api('me').then((d) => (d.admin ? loadList() : show('login'))).catch(() => show('login'));
})();
