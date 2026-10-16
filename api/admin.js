// Back-office (un seul compte). Actions par ?action= :
//   POST login {password} · POST logout · GET me
//   GET list · POST save {car} · POST remove {id} · POST photo (corps = image)
import { readCars, writeCars, savePhoto, deletePhotos } from '../lib/store.js';
import { send, jsonBody, rawBody, checkPassword, openSession, closeSession, isAdmin } from '../lib/http.js';

const CATS = ['sport', 'family', 'other'];
const str = (v, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v) => { const n = Number(String(v ?? '').replace(/[^\d.]/g, '')); return Number.isFinite(n) ? Math.round(n) : 0; };
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'voiture';

function clean(input) {
  const photos = (Array.isArray(input.photos) ? input.photos : [])
    .filter((u) => typeof u === 'string' && (/^https:\/\//.test(u) || u.startsWith('/.data/')))
    .slice(0, 30);
  const car = {
    brand: str(input.brand, 60), model: str(input.model, 80),
    year: num(input.year), km: num(input.km), ps: num(input.ps), price: num(input.price),
    gear: str(input.gear, 40), fuel: str(input.fuel, 40), color: str(input.color, 60),
    cat: CATS.includes(input.cat) ? input.cat : 'sport',
    badge: str(input.badge, 30), description: str(input.description, 4000),
    url: /^https:\/\//.test(str(input.url, 400)) ? str(input.url, 400) : '',
    photos,
  };
  const errors = [];
  if (!car.brand) errors.push('la marque');
  if (!car.model) errors.push('le modèle');
  if (!car.price) errors.push('le prix');
  if (!car.photos.length) errors.push('au moins une photo');
  return { car, errors };
}

export default async function handler(req, res) {
  const action = new URL(req.url, 'http://x').searchParams.get('action');
  try {
    if (action === 'login' && req.method === 'POST') {
      const { password } = await jsonBody(req);
      await new Promise((r) => setTimeout(r, 400)); // freine les essais en série
      if (!checkPassword(password)) return send(res, 401, { error: 'Mot de passe incorrect' });
      openSession(res);
      return send(res, 200, { ok: true });
    }
    if (action === 'logout') { closeSession(res); return send(res, 200, { ok: true }); }
    if (action === 'me') return send(res, 200, { admin: isAdmin(req) });

    if (!isAdmin(req)) return send(res, 401, { error: 'Session expirée, reconnectez-vous' });

    if (action === 'list' && req.method === 'GET') return send(res, 200, { cars: await readCars() });

    if (action === 'photo' && req.method === 'POST') {
      const type = String(req.headers['x-type'] || 'image/jpeg');
      if (!/^image\/(jpeg|png|webp)$/.test(type)) return send(res, 415, { error: 'Format d’image non pris en charge' });
      const buf = await rawBody(req);
      if (!buf.length) return send(res, 400, { error: 'Image vide' });
      return send(res, 200, { url: await savePhoto(buf, type) });
    }

    if (action === 'save' && req.method === 'POST') {
      const input = (await jsonBody(req)).car || {};
      const { car, errors } = clean(input);
      if (errors.length) return send(res, 400, { error: `Il manque ${errors.join(', ')}.` });
      const cars = await readCars();
      const i = input.id ? cars.findIndex((c) => c.id === input.id) : -1;
      if (i >= 0) {
        const removed = cars[i].photos.filter((u) => !car.photos.includes(u));
        cars[i] = { ...cars[i], ...car, updatedAt: new Date().toISOString() };
        await writeCars(cars);
        await deletePhotos(removed).catch(() => {});
        return send(res, 200, { car: cars[i] });
      }
      let id = slug(`${car.brand} ${car.model} ${car.year || ''}`), n = 2;
      while (cars.some((c) => c.id === id)) id = `${slug(`${car.brand} ${car.model} ${car.year || ''}`)}-${n++}`;
      const created = { id, ...car, createdAt: new Date().toISOString() };
      cars.unshift(created);
      await writeCars(cars);
      return send(res, 200, { car: created });
    }

    if (action === 'remove' && req.method === 'POST') {
      const { id } = await jsonBody(req);
      const cars = await readCars();
      const car = cars.find((c) => c.id === id);
      if (!car) return send(res, 404, { error: 'Annonce introuvable' });
      await writeCars(cars.filter((c) => c.id !== id));
      await deletePhotos(car.photos).catch(() => {});
      return send(res, 200, { ok: true });
    }

    return send(res, 404, { error: 'Action inconnue' });
  } catch (e) {
    console.error(e);
    return send(res, e.status || 500, { error: e.status ? e.message : 'Erreur du serveur, réessayez.' });
  }
}
