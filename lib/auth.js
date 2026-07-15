/**
 * lib/auth.js
 *
 * Authentication utilities:
 *  - bcryptjs  — password hashing (10 rounds)
 *  - jsonwebtoken — 30-day signed session tokens
 *  - requireAuth  — middleware for protected Vercel API routes
 *  - setCors      — standard CORS headers
 */

import bcrypt from 'bcryptjs';
import jwt    from 'jsonwebtoken';

const JWT_SECRET  = process.env.JWT_SECRET;
const JWT_EXPIRES = '30d';

if (!JWT_SECRET) {
  console.warn(
    '[voicecast] WARNING: JWT_SECRET is not set. ' +
    'Add it in Vercel → Project Settings → Environment Variables.'
  );
}

const SECRET = JWT_SECRET || 'voicecast-insecure-fallback-CHANGE-ME';

export async function hashPassword(plain) { return bcrypt.hash(plain, 10); }
export async function verifyPassword(plain, hash) { return bcrypt.compare(plain, hash); }

export function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: JWT_EXPIRES });
}

export function verifyToken(token) {
  try { return jwt.verify(token, SECRET); }
  catch { return null; }
}

export function requireAuth(req, res) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    res.status(401).json({ error: 'Authentication required. Please log in.' });
    return null;
  }
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Your session has expired. Please log in again.' });
    return null;
  }
  return payload;
}

export function setCors(res, methods = 'GET, POST, OPTIONS') {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}