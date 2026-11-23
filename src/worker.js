// Catálogo Rose Boutique Colombia — Cloudflare Worker
// Sirve /catalog.json, las fotos subidas (/u/*) y la API del panel (/api/*).
// Lo demás (catálogo, panel, fotos iniciales) son archivos estáticos de /public.
import seed from './seed.json';

const enc = new TextEncoder();
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const rand = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));

async function pbkdf2(password, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 100000 }, key, 256));
}
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}
function safeEq(a, b) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function getAuth(env) { return env.DB.get('auth', 'json'); }
async function setPassword(env, password) {
  const salt = rand(16), secret = rand(32);
  await env.DB.put('auth', JSON.stringify({ salt, hash: await pbkdf2(password, salt), secret }));
  return secret;
}
async function sessionCookie(secret) {
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 14; // 14 días
  const tok = `${exp}.${await hmac(secret, String(exp))}`;
  return `rs=${tok}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${60 * 60 * 24 * 14}`;
}
async function isLogged(req, env) {
  const auth = await getAuth(env); if (!auth) return false;
  const m = (req.headers.get('cookie') || '').match(/(?:^|;\s*)rs=(\d+)\.([a-f0-9]{64})/);
  if (!m || Number(m[1]) < Date.now()) return false;
  return safeEq(m[2], await hmac(auth.secret, m[1]));
}
async function loadCatalog(env, fresh) {
  const c = await env.DB.get('catalog', fresh ? { type: 'json' } : { type: 'json', cacheTtl: 60 });
  return c || seed;
}

const str = (v, max) => (typeof v === 'string' || typeof v === 'number' ? String(v).replace(/<[^>]*>/g, '').trim().slice(0, max) : '');
const num = (v) => Math.max(0, parseInt(String(v ?? '').replace(/\D/g, ''), 10) || 0);
const IMG_RE = /^(uploads|u)\/[A-Za-z0-9._-]+\.(jpe?g|png|webp)$/;

function sanitize(input) {
  const s = input.settings || {};
  const cats = [...new Set((Array.isArray(s.categories) ? s.categories : []).map((c) => str(c, 40)).filter(Boolean))].slice(0, 30);
  const settings = {
    brand: str(s.brand, 40) || 'Rose Boutique', eyebrow: str(s.eyebrow, 80), tagline: str(s.tagline, 140), intro: str(s.intro, 400),
    whatsapp: String(s.whatsapp ?? '').replace(/\D/g, '').slice(0, 15), instagram: String(s.instagram ?? '').replace(/[^A-Za-z0-9._]/g, '').slice(0, 40),
    mayor_min: Math.min(99, Math.max(1, num(s.mayor_min) || 3)), categories: cats,
  };
  const seen = new Set(), products = [];
  for (const p of (Array.isArray(input.products) ? input.products : []).slice(0, 500)) {
    if (!p || typeof p !== 'object') continue;
    let id = String(p.id ?? '').replace(/[^a-z0-9]/gi, '') || 'p' + rand(4);
    if (seen.has(id)) id = 'p' + rand(4); seen.add(id);
    const colors = (Array.isArray(p.colors) ? p.colors : []).slice(0, 20)
      .filter((c) => c && IMG_RE.test(String(c.img || '')))
      .map((c) => ({ name: str(c.name, 30) || 'Único', img: String(c.img) }));
    products.push({
      id, ref: str(p.ref, 20), visible: !!p.visible, cat: str(p.cat, 40), name: str(p.name, 90) || 'Producto sin nombre',
      desc: str(p.desc, 400), detalle: num(p.detalle), mayor: num(p.mayor),
      sizes: String(p.sizes ?? '').replace(/[^0-9A-Za-z.,;/ ]/g, '').slice(0, 80), colors,
    });
  }
  return { settings, products };
}
function imgType(bytes) {
  const b = new Uint8Array(bytes.slice(0, 12));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return ['image/jpeg', 'jpg'];
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return ['image/png', 'png'];
  if (String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return ['image/webp', 'webp'];
  return null;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), path = url.pathname;

    if (path === '/catalog.json' && req.method === 'GET') {
      const data = await loadCatalog(env, url.searchParams.has('t'));
      return json(data, 200, { 'cache-control': 'public, max-age=30' });
    }

    if (path.startsWith('/u/') && req.method === 'GET') {
      const name = path.slice(3);
      if (!/^[A-Za-z0-9._-]+$/.test(name)) return new Response('No encontrado', { status: 404 });
      const { value, metadata } = await env.DB.getWithMetadata('img:' + name, { type: 'arrayBuffer', cacheTtl: 86400 });
      if (!value) return new Response('No encontrado', { status: 404 });
      return new Response(value, { headers: { 'content-type': metadata?.type || 'image/webp', 'cache-control': 'public, max-age=31536000, immutable' } });
    }

    if (path.startsWith('/api/')) {
      if (req.method !== 'GET') { // protección CSRF: solo desde el mismo sitio
        const origin = req.headers.get('origin');
        if (origin && origin !== url.origin) return json({ ok: false, error: 'Origen no permitido.' }, 403);
      }
      const auth = await getAuth(env);

      if (path === '/api/me') return json({ setup: !!auth, logged: await isLogged(req, env) });

      if (path === '/api/setup' && req.method === 'POST') {
        if (auth) return json({ ok: false, error: 'La contraseña ya fue creada.' }, 400);
        const { password } = await req.json().catch(() => ({}));
        if (typeof password !== 'string' || password.length < 8) return json({ ok: false, error: 'La contraseña debe tener al menos 8 caracteres.' }, 400);
        const secret = await setPassword(env, password);
        return json({ ok: true }, 200, { 'set-cookie': await sessionCookie(secret) });
      }

      if (path === '/api/login' && req.method === 'POST') {
        await new Promise((r) => setTimeout(r, 500));
        const { password } = await req.json().catch(() => ({}));
        if (!auth || typeof password !== 'string' || !safeEq(await pbkdf2(password, auth.salt), auth.hash))
          return json({ ok: false, error: 'Contraseña incorrecta.' }, 401);
        return json({ ok: true }, 200, { 'set-cookie': await sessionCookie(auth.secret) });
      }

      if (path === '/api/logout' && req.method === 'POST')
        return json({ ok: true }, 200, { 'set-cookie': 'rs=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0' });

      if (!(await isLogged(req, env))) return json({ ok: false, error: 'Tu sesión expiró. Recarga la página y vuelve a entrar.' }, 401);

      if (path === '/api/catalog') return json({ ok: true, data: await loadCatalog(env, true) });

      if (path === '/api/password' && req.method === 'POST') {
        const { password } = await req.json().catch(() => ({}));
        if (typeof password !== 'string' || password.length < 8) return json({ ok: false, error: 'La nueva contraseña debe tener al menos 8 caracteres.' }, 400);
        const secret = await setPassword(env, password);
        return json({ ok: true }, 200, { 'set-cookie': await sessionCookie(secret) });
      }

      if (path === '/api/upload' && req.method === 'POST') {
        const form = await req.formData().catch(() => null);
        const f = form?.get('foto');
        if (!f || typeof f === 'string') return json({ ok: false, error: 'No llegó la foto. Intenta de nuevo.' }, 400);
        if (f.size > 8 * 1024 * 1024) return json({ ok: false, error: 'La foto pesa más de 8 MB.' }, 400);
        const bytes = await f.arrayBuffer(); const t = imgType(bytes);
        if (!t) return json({ ok: false, error: 'Formato no válido. Usa JPG, PNG o WebP.' }, 400);
        const name = `${Date.now().toString(36)}${rand(4)}.${t[1]}`;
        await env.DB.put('img:' + name, bytes, { metadata: { type: t[0] } });
        return json({ ok: true, img: 'u/' + name });
      }

      if (path === '/api/save' && req.method === 'POST') {
        const input = await req.json().catch(() => null);
        if (!input || !Array.isArray(input.products)) return json({ ok: false, error: 'Datos inválidos.' }, 400);
        const clean = sanitize(input);
        const prev = await env.DB.get('catalog');
        if (prev) await env.DB.put('bk:' + new Date().toISOString(), prev, { expirationTtl: 60 * 60 * 24 * 30 }); // respaldo 30 días
        await env.DB.put('catalog', JSON.stringify(clean));
        return json({ ok: true, data: clean });
      }
      return json({ ok: false, error: 'No encontrado.' }, 404);
    }

    return env.ASSETS.fetch(req);
  },
};
