// api/auth/signup.js
// Stores users in Vercel KV (Redis). Requires KV env vars:
//   KV_REST_API_URL, KV_REST_API_TOKEN (auto-set when you link a KV store in Vercel dashboard)
// Password hashed with SHA-256 + salt

import { createHash, randomBytes } from 'crypto';

const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const JWT_SECRET = process.env.JWT_SECRET || 'voicecast-dev-secret-change-in-prod';

async function kvGet(key) {
  const res = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  const json = await res.json();
  return json.result ?? null;
}

async function kvSet(key, value) {
  await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
}

function hashPassword(password, salt) {
  return createHash('sha256').update(salt + password + JWT_SECRET).digest('hex');
}

function makeJwt(payload) {
  const header  = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g,'');
  const body    = btoa(JSON.stringify({ ...payload, iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000) + 60*60*24*30 })).replace(/=/g,'');
  const sig     = btoa(createHash('sha256').update(`${header}.${body}${JWT_SECRET}`).digest('hex')).replace(/=/g,'');
  return `${header}.${body}.${sig}`;
}

export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { firstName, lastName = '', email, password, promoConsent = false } = req.body || {};

  if (!firstName?.trim()) return res.status(400).json({ error: 'First name is required.' });
  if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  if (!KV_URL || !KV_TOKEN) {
    return res.status(503).json({ error: 'Database not configured. Please connect a Vercel KV store in the Vercel dashboard under Storage.' });
  }

  const emailKey = `user:email:${email.toLowerCase().trim()}`;
  const existing = await kvGet(emailKey);
  if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });

  const salt   = randomBytes(16).toString('hex');
  const pwHash = hashPassword(password, salt);
  const userId = randomBytes(12).toString('hex');
  const now    = new Date().toISOString();

  const user = {
    id: userId, firstName: firstName.trim(), lastName: lastName.trim(),
    email: email.toLowerCase().trim(), pwHash, salt,
    promoConsent: Boolean(promoConsent), createdAt: now, updatedAt: now,
  };

  await kvSet(`user:id:${userId}`, JSON.stringify(user));
  await kvSet(emailKey, userId);

  const token = makeJwt({ sub: userId, email: user.email, name: user.firstName });
  return res.status(201).json({
    token,
    user: { id: userId, email: user.email, firstName: user.firstName, lastName: user.lastName },
  });
}