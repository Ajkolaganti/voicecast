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
const SESSION_COOKIE = 'vc_token';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

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

export function getCookie(req, name) {
  const header = req.headers.cookie || '';
  const match = header
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(`${name}=`));

  if (!match) return '';
  return decodeURIComponent(match.slice(name.length + 1));
}

export function getRequestToken(req) {
  const authToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  return authToken || getCookie(req, SESSION_COOKIE);
}

function shouldUseSecureCookie(req) {
  const host = req.headers.host || '';
  const proto = req.headers['x-forwarded-proto'] || '';
  return proto === 'https' || (!host.startsWith('localhost') && !host.startsWith('127.0.0.1'));
}

export function createSessionCookie(token, req) {
  const secure = shouldUseSecureCookie(req) ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}; Path=/${secure}`;
}

export function clearSessionCookie(req) {
  const secure = shouldUseSecureCookie(req) ? '; Secure' : '';
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/${secure}`;
}

export function requireAuth(req, res) {
  const token = getRequestToken(req);
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
