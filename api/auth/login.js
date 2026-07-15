/**
 * POST /api/auth/login
 * Body: { email, password }
 * Returns: { token, user }
 */

import { ObjectId }                                from 'mongodb';
import { getDb }                                   from '../../lib/mongodb.js';
import { verifyPassword, signToken, setCors }      from '../../lib/auth.js';

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
  try {
    db = await getDb();
  } catch (err) {
    console.error('[login] DB connection failed:', err.message);
    return res.status(503).json({ error: 'Database unavailable. Please check MONGODB_URI in Vercel project settings.' });
  }

  const user = await db.collection('users').findOne({ email: emailClean });
  if (!user) return res.status(401).json({ error: 'Incorrect email or password.' });

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid)  return res.status(401).json({ error: 'Incorrect email or password.' });

  // Fire-and-forget lastLoginAt update
  db.collection('users').updateOne(
    { _id: user._id },
    { $set: { lastLoginAt: new Date(), updatedAt: new Date() } }
  ).catch(err => console.error('[login] lastLoginAt update:', err.message));

  const userId = user._id.toString();
  const token  = signToken({ sub: userId, email: user.email, name: user.firstName });

  return res.status(200).json({
    token,
    user: { id: userId, email: user.email, firstName: user.firstName, lastName: user.lastName, promoConsent: user.promoConsent, createdAt: user.createdAt?.toISOString() },
  });
}