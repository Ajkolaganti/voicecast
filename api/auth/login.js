/**
 * POST /api/auth/login
 * Body: { email, password }
 * Returns: { token, user }
 */

import { FieldValue }                             from 'firebase-admin/firestore';
import { getDb, COLLECTIONS }                    from '../../lib/firebase.js';
import { verifyPassword, signToken, setCors }    from '../../lib/auth.js';

export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  setCors(res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed.' });

  const { email, password } = req.body || {};
  if (!email?.trim() || !password)
    return res.status(400).json({ error: 'Email and password are required.' });

  const emailClean = email.toLowerCase().trim();

  let db;
  try { db = getDb(); } catch (err) {
    return res.status(503).json({ error: 'Firebase is not configured. Check Vercel environment variables.' });
  }

  // Resolve uid from email index
  const emailKey  = emailClean.replace(/\./g, ',');
  const emailSnap = await db.collection('emailIndex').doc(emailKey).get();
  if (!emailSnap.exists)
    return res.status(401).json({ error: 'Incorrect email or password.' });

  const { uid } = emailSnap.data();
  const userSnap = await db.collection(COLLECTIONS.USERS).doc(uid).get();
  if (!userSnap.exists)
    return res.status(401).json({ error: 'Incorrect email or password.' });

  const user  = userSnap.data();
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Incorrect email or password.' });

  // Fire-and-forget lastLoginAt update
  db.collection(COLLECTIONS.USERS).doc(uid)
    .update({ lastLoginAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
    .catch(err => console.error('[login] lastLoginAt update:', err.message));

  const token = signToken({ sub: uid, email: emailClean, name: user.firstName });
  return res.status(200).json({
    token,
    user: { id: uid, email: user.email, firstName: user.firstName, lastName: user.lastName, promoConsent: user.promoConsent, createdAt: user.createdAt?.toDate?.()?.toISOString() ?? null },
  });
}