/**
 * GET /api/auth/me
 * Authorization: Bearer <token>
 * Returns user profile from Firestore (never returns passwordHash).
 */

import { getDb, COLLECTIONS }   from '../../lib/firebase.js';
import { requireAuth, setCors } from '../../lib/auth.js';
import { getTranscriptionUsage } from '../../lib/usage.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  setCors(res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed.' });

  const payload = requireAuth(req, res);
  if (!payload) return;

  let db;
  try { db = getDb(); } catch { return res.status(503).json({ error: 'Firebase is not configured.' }); }

  const snap = await db.collection(COLLECTIONS.USERS).doc(payload.sub).get();
  if (!snap.exists) return res.status(404).json({ error: 'User not found.' });

  const u = snap.data();
  const usage = await getTranscriptionUsage(db, payload.sub);

  return res.status(200).json({
    id:          snap.id,
    email:       u.email,
    firstName:   u.firstName,
    lastName:    u.lastName,
    promoConsent: u.promoConsent,
    createdAt:   u.createdAt?.toDate?.()?.toISOString()  ?? null,
    lastLoginAt: u.lastLoginAt?.toDate?.()?.toISOString() ?? null,
    usage,
  });
}
