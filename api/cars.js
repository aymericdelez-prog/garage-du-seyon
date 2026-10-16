// GET /api/cars          → toutes les annonces publiées
// GET /api/cars?id=slug  → une annonce (fiche détaillée)
import { readCars } from '../lib/store.js';
import { send } from '../lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Méthode non autorisée' });
  try {
    const url = new URL(req.url, 'http://x');
    const id = url.searchParams.get('id');
    const cars = await readCars();
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=10, stale-while-revalidate=60');
    if (id) {
      const car = cars.find((c) => c.id === id);
      return car ? send(res, 200, { car }) : send(res, 404, { error: 'Annonce introuvable' });
    }
    return send(res, 200, { cars });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: 'Annonces indisponibles' });
  }
}
