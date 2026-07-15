/**
 * POST /api/auth/signup
 * Body: { firstName, lastName?, email, password, promoConsent? }
 * Returns: { token, user }
 */

import { getDb }                           from '../../lib/mongodb.js';
import { hashPassword, signToken, setCors } from '../../lib/auth.js';

export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  setCors(res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed.' });

  const { firstName, lastName = '', email, password, promoConsent = false } = req.body || {};

  if (!firstName?.trim())
    return res.status(400).json({ error: 'First name is required.' });

  const emailClean = email?.toLowerCase().trim();
  if (!emailClean || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean))
    return res.status(400).json({ error: 'A valid email address is required.' });

  if (!password || password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  let db;
  try {
    db = await getDb();
  } catch (err) {
    console.error('[signup] DB connection failed:', err.message);
    return res.status(503).json({ error: 'Database unavailable. Please check MONGODB_URI in Vercel project settings.' });
  }

  const users = db.collection('users');
  const existing = await users.findOne({ email: emailClean }, { projection: { _id: 1 } });
  if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });

  const passwordHash = await hashPassword(password);
  const now = new Date();
  const doc = {
    firstName: firstName.trim(), lastName: lastName.trim(),
    email: emailClean, passwordHash,
    promoConsent: Boolean(promoConsent),
    createdAt: now, updatedAt: now, lastLoginAt: null,
  };

  let result;
  try {
    result = await users.insertOne(doc);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'An account with this email already exists.' });
    console.error('[signup] insertOne failed:', err.message);
    return res.status(500).json({ error: 'Failed to create account. Please try again.' });
  }

  const userId = result.insertedId.toString();
  const token  = signToken({ sub: userId, email: emailClean, name: doc.firstName });

  return res.status(201).json({
    token,
    user: { id: userId, email: emailClean, firstName: doc.firstName, lastName: doc.lastName, promoConsent: doc.promoConsent, createdAt: now.toISOString() },
  });
}