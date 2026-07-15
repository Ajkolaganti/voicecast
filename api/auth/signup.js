/**
 * POST /api/auth/signup
 * Body: { firstName, lastName?, email, password, promoConsent? }
 * Returns: { token, user }
 *
 * Email uniqueness enforced via emailIndex/{encodedEmail} collection
 * inside a Firestore transaction (atomic check-and-write).
 */

import { FieldValue }                       from 'firebase-admin/firestore';
import { getDb, COLLECTIONS }              from '../../lib/firebase.js';
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
  try { db = getDb(); } catch (err) {
    console.error('[signup] Firebase init failed:', err.message);
    return res.status(503).json({
      error: 'Firebase is not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in Vercel project settings.',
    });
  }

  // Email uniqueness: encode dots (not allowed in Firestore doc IDs)
  const emailKey = emailClean.replace(/\./g, ',');
  const emailRef = db.collection('emailIndex').doc(emailKey);
  const newUser  = db.collection(COLLECTIONS.USERS).doc(); // auto-ID = uid
  const uid      = newUser.id;

  const passwordHash = await hashPassword(password);
  const now          = FieldValue.serverTimestamp();

  try {
    await db.runTransaction(async (tx) => {
      const emailCheck = await tx.get(emailRef);
      if (emailCheck.exists) throw { code: 'DUPLICATE_EMAIL' };
      tx.set(emailRef, { uid });
      tx.set(newUser, {
        firstName: firstName.trim(), lastName: lastName.trim(),
        email: emailClean, passwordHash,
        promoConsent: Boolean(promoConsent),
        createdAt: now, updatedAt: now, lastLoginAt: null,
      });
    });
  } catch (err) {
    if (err.code === 'DUPLICATE_EMAIL')
      return res.status(409).json({ error: 'An account with this email already exists.' });
    console.error('[signup] transaction failed:', err.message);
    return res.status(500).json({ error: 'Failed to create account. Please try again.' });
  }

  const token = signToken({ sub: uid, email: emailClean, name: firstName.trim() });
  return res.status(201).json({
    token,
    user: { id: uid, email: emailClean, firstName: firstName.trim(), lastName: lastName.trim(), promoConsent: Boolean(promoConsent) },
  });
}