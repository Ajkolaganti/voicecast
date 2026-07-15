// api/auth/me.js — verify JWT and return user profile
import { createHash } from 'crypto';

const KV_URL     = process.env.KV_REST_API_URL;
const KV_TOKEN   = process.env.KV_REST_API_TOKEN;
const JWT_SECRET = process.env.JWT_SECRET || 'voicecast-dev-secret-change-in-prod';

async function kvGet(key) {
  const res = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  const json = await res.json();
  return json.result ?? null;
}

function verifyJwt(token) {
  try {
    const [header, body, sig] = token.split('.');
    const expected = btoa(createHash('sha256').update(`${header}.${body}${JWT_SECRET}`).digest('hex')).replace(/=/g,'');
    if (sig !== expected) return null;
    const payload = JSON.parse(atob(body));
    if (payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch { return null; }
}

export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer /, '').trim();
  if (!token) return res.status(401).json({ error: 'No token provided.' });

  const payload = verifyJwt(token);
  if (!payload) return res.status(401).json({ error: 'Invalid or expired token.' });

  if (!KV_URL || !KV_TOKEN) {
    return res.status(200).json({ id: payload.sub, email: payload.email, name: payload.name });
  }

  const userJson = await kvGet(`user:id:${payload.sub}`);
  if (!userJson) return res.status(401).json({ error: 'User not found.' });

  const user = JSON.parse(userJson);
  return res.status(200).json({
    id: user.id, email: user.email,
    firstName: user.firstName, lastName: user.lastName,
    promoConsent: user.promoConsent, createdAt: user.createdAt,
  });
}