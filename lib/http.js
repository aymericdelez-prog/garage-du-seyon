// Petits utilitaires communs aux fonctions /api (format Node pur, compatible Vercel et serveur local).
import crypto from 'node:crypto';

export function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

export async function rawBody(req, limit = 4.4e6) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  if (req.body && typeof req.body === 'object') return Buffer.from(JSON.stringify(req.body));
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > limit) throw Object.assign(new Error('fichier trop lourd'), { status: 413 }); chunks.push(c); }
  return Buffer.concat(chunks);
}

export async function jsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const b = await rawBody(req, 1e6);
  return b.length ? JSON.parse(b.toString('utf8')) : {};
}

// ------------------------------------------------------------------ session
// Un seul compte : mot de passe dans ADMIN_PASSWORD ; jeton signé (HMAC) dans un cookie HttpOnly.
const SECRET = () => process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || 'dev-local';
const sign = (v) => crypto.createHmac('sha256', SECRET()).update(v).digest('base64url');
const COOKIE = 'gds_admin';
const DAYS = 30;

export function checkPassword(pw) {
  const expected = process.env.ADMIN_PASSWORD || (process.env.VERCEL ? '' : 'garage');
  if (!expected || typeof pw !== 'string') return false;
  const a = Buffer.from(sign(pw)), b = Buffer.from(sign(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function openSession(res) {
  const exp = Date.now() + DAYS * 864e5;
  const v = `${exp}.${sign(String(exp))}`;
  const secure = process.env.VERCEL ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${v}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${DAYS * 86400}${secure}`);
}

export function closeSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
}

export function isAdmin(req) {
  const m = (req.headers.cookie || '').match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!m) return false;
  const [exp, sig] = m[1].split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const a = Buffer.from(sig), b = Buffer.from(sign(exp));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
