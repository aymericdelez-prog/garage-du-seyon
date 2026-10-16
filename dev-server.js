// Serveur local : site statique + fonctions /api (comme sur Vercel).
//   node dev-server.js 5179   → http://localhost:5179  (back-office : /admin, mot de passe local « garage »)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cars from './api/cars.js';
import admin from './api/admin.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] || process.env.PORT) || 5179;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/api/cars') return cars(req, res);
  if (p === '/api/admin') return admin(req, res);
  // mêmes réécritures que vercel.json
  let file = p === '/' ? '/index.html' : /^\/voiture\/[^/]+\/?$/.test(p) ? '/voiture.html' : p === '/admin' ? '/admin.html' : p;
  if (!path.extname(file)) file += '.html';
  const abs = path.join(ROOT, file);
  if (!abs.startsWith(ROOT) || /node_modules|[\/]lib[\/]|[\/]api[\/]/.test(abs)) { res.statusCode = 404; return res.end(); }
  fs.readFile(abs, (err, data) => {
    if (err) { res.statusCode = 404; return res.end('404'); }
    res.setHeader('Content-Type', TYPES[path.extname(abs).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(data);
  });
}).listen(PORT, () => console.log(`Garage du Seyon → http://localhost:${PORT}  (back-office : /admin)`));
