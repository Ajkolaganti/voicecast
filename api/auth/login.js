// api/auth/login.js
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

function hashPassword(password, salt) {
  return createHash('sha256').update(salt + password + JWT_SECRET).digest('hex');
}

function makeJwt(payload) {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g,'');
  const body   = btoa(JSON.stringify({ ...payload, iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000) + 60*60*24*30 })).replace(/=/g,'');
  const sig    = btoa(createHash('sha256').update(`${header}.${body}${JWT_SECRET}`).digest('hex')).replace(/=/g,'');
  return `${header}.${body}.${sig}`;
}

export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password } = req.body || {};
  if (!email?.trim() || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  if (!KV_URL || !KV_TOKEN) {
    return res.status(503).json({ error: 'Database not configured. Please connect a Vercel KV store in the Vercel dashboard under Storage.' });
  }

  const emailKey = `user:email:${email.toLowerCase().trim()}`;
  const userId   = await kvGet(emailKey);
  if (!userId) return res.status(401).json({ error: 'No account found with that email address.' });

  const userJson = await kvGet(`user:id:${userId}`);
  if (!userJson) return res.status(401).json({ error: 'Account not found.' });

  const user     = JSON.parse(userJson);
  const incoming = hashPassword(password, user.salt);
  if (incoming !== user.pwHash) return res.status(401).json({ error: 'Incorrect password.' });

  const token = makeJwt({ sub: user.id, email: user.email, name: user.firstName });
  return res.status(200).json({
    token,
    user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
  });
}