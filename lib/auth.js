/**
 * lib/auth.js
 *
 * Authentication utilities:
 *  - bcryptjs for password hashing (10 rounds)
 *  - jsonwebtoken for 30-day signed tokens
 *  - requireAuth middleware for protected routes
 */

import bcrypt from 'bcryptjs';
import jwt    from 'jsonwebtoken';

const JWT_SECRET  = process.env.JWT_SECRET;
const JWT_EXPIRES = '30d';

if (!JWT_SECRET) {
  console.warn('[voicecast] WARNING: JWT_SECRET env var is not set. Set it in Vercel project settings.');
}

const SECRET = JWT_SECRET || 'voicecast-insecure-fallback-set-jwt-secret-in-vercel';

export async function hashPassword(plainText) {
  return bcrypt.hash(plainText, 10);
}

export async function verifyPassword(plainText, hash) {
  return bcrypt.compare(plainText, hash);
}

export function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: JWT_EXPIRES });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

export function requireAuth(req, res) {
  const header = req.headers.authorization || '';
  const token  = header.replace(/^Bearer\s+/i, '').trim();

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