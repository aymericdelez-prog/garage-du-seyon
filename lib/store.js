// Stockage des annonces et des photos.
// En ligne : Vercel Blob (variable BLOB_READ_WRITE_TOKEN). Chaque enregistrement
// écrit un nouveau fichier data/cars-<horodatage>.json (adresse unique, donc
// jamais servi depuis un cache périmé) puis supprime les anciennes versions.
// En local : dossier .data/ à la racine du site.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL = path.join(ROOT, '.data');
const useBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;
const blob = () => import('@vercel/blob');

async function seed() {
  return JSON.parse(await fs.readFile(path.join(ROOT, 'data', 'seed.json'), 'utf8')).cars;
}

export async function readCars() {
  if (useBlob()) {
    const { list } = await blob();
    const { blobs } = await list({ prefix: 'data/cars-' });
    if (!blobs.length) return seed();
    blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    const r = await fetch(blobs[0].url, { cache: 'no-store' });
    if (!r.ok) throw new Error('lecture des annonces impossible');
    return (await r.json()).cars;
  }
  try { return JSON.parse(await fs.readFile(path.join(LOCAL, 'cars.json'), 'utf8')).cars; }
  catch { return seed(); }
}

export async function writeCars(cars) {
  const body = JSON.stringify({ cars, savedAt: new Date().toISOString() });
  if (useBlob()) {
    const { put, list, del } = await blob();
    const { blobs: old } = await list({ prefix: 'data/cars-' });
    await put(`data/cars-${Date.now()}.json`, body, { access: 'public', contentType: 'application/json', addRandomSuffix: true, cacheControlMaxAge: 60 });
    if (old.length) await del(old.map((b) => b.url));
    return;
  }
  await fs.mkdir(LOCAL, { recursive: true });
  await fs.writeFile(path.join(LOCAL, 'cars.json'), body);
}

export async function savePhoto(buffer, type) {
  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  const name = `photos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  if (useBlob()) {
    const { put } = await blob();
    const r = await put(name, buffer, { access: 'public', contentType: type, cacheControlMaxAge: 31536000 });
    return r.url;
  }
  const file = path.join(LOCAL, name);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, buffer);
  return '/.data/' + name;
}

// Supprime les photos hébergées chez nous (les liens externes, AutoScout par ex., sont ignorés).
export async function deletePhotos(urls) {
  const own = urls.filter((u) => /\.blob\.vercel-storage\.com\//.test(u) || u.startsWith('/.data/'));
  if (!own.length) return;
  if (useBlob()) {
    const { del } = await blob();
    await del(own.filter((u) => u.startsWith('http')));
    return;
  }
  await Promise.all(own.map((u) => fs.rm(path.join(ROOT, u), { force: true })));
}
