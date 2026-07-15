/**
 * GET /api/auth/me
 * Authorization: Bearer <token>
 * Returns user profile (never returns passwordHash)
 */

import { ObjectId }             from 'mongodb';
import { getDb }                from '../../lib/mongodb.js';
import { requireAuth, setCors } from '../../lib/auth.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  setCors(res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed.' });

  const payload = requireAuth(req, res);
  if (!payload) return;

  let db;
  try {
    db = await getDb();
  } catch {
    return res.status(503).json({ error: 'Database unavailable.' });
  }

  const user = await db.collection('users').findOne(
    { _id: new ObjectId(payload.sub) },
    { projection: { passwordHash: 0 } }
  );

  if (!user) return res.status(404).json({ error: 'User not found.' });

  return res.status(200).json({
    id:          user._id.toString(),
    email:       user.email,
    firstName:   user.firstName,
    lastName:    user.lastName,
    promoConsent: user.promoConsent,
    createdAt:   user.createdAt?.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  });
}