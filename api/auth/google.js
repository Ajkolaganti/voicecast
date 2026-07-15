/**
 * POST /api/auth/google
 * Body: { credential, promoConsent? }
 *
 * Verifies a Google Identity Services ID token, creates or links the user by
 * email, then issues the same VoiceCast JWT session used by password auth.
 */

import { OAuth2Client } from 'google-auth-library';
import { FieldValue } from 'firebase-admin/firestore';

import { getDb, COLLECTIONS } from '../../lib/firebase.js';
import { createSessionCookie, setCors, signToken } from '../../lib/auth.js';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

export const config = { api: { bodyParser: true } };

function emailToKey(email) {
  return email.replace(/\./g, ',');
}

function splitName(payload) {
  const given = (payload.given_name || '').trim();
  const family = (payload.family_name || '').trim();
  if (given) return { firstName: given, lastName: family };

  const parts = (payload.name || '').trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || 'Google',
    lastName: parts.slice(1).join(' '),
  };
}

function publicUser(uid, user) {
  return {
    id: uid,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName || '',
    promoConsent: Boolean(user.promoConsent),
    authProviders: user.authProviders || ['google'],
  };
}

export default async function handler(req, res) {
  setCors(res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  if (!googleClient || !GOOGLE_CLIENT_ID) {
    return res.status(503).json({ error: 'Google Sign-In is not configured.' });
  }

  const { credential, promoConsent = false } = req.body || {};
  if (!credential) return res.status(400).json({ error: 'Missing Google credential.' });

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (err) {
    console.error('[google auth] token verification failed:', err.message);
    return res.status(401).json({ error: 'Google sign-in could not be verified.' });
  }

  if (!payload?.email || !payload.email_verified) {
    return res.status(401).json({ error: 'Google account email must be verified.' });
  }

  const emailClean = payload.email.toLowerCase().trim();
  const { firstName, lastName } = splitName(payload);

  let db;
  try { db = getDb(); } catch (err) {
    return res.status(503).json({ error: 'Firebase is not configured. Check Vercel environment variables.' });
  }

  const users = db.collection(COLLECTIONS.USERS);
  const emailRef = db.collection('emailIndex').doc(emailToKey(emailClean));
  const now = FieldValue.serverTimestamp();
  let uid;
  let userForResponse;

  try {
    await db.runTransaction(async (tx) => {
      const emailSnap = await tx.get(emailRef);

      if (emailSnap.exists) {
        uid = emailSnap.data().uid;
        const userRef = users.doc(uid);
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists) throw new Error('USER_INDEX_BROKEN');

        const existing = userSnap.data();
        const updates = {
          googleId: payload.sub,
          googlePicture: payload.picture || null,
          emailVerified: true,
          authProviders: FieldValue.arrayUnion('google'),
          lastLoginAt: now,
          updatedAt: now,
        };

        if (!existing.firstName) updates.firstName = firstName;
        if (!existing.lastName && lastName) updates.lastName = lastName;

        tx.update(userRef, updates);
        userForResponse = {
          ...existing,
          ...updates,
          firstName: existing.firstName || firstName,
          lastName: existing.lastName || lastName,
          authProviders: Array.from(new Set([...(existing.authProviders || []), 'google'])),
        };
        return;
      }

      const userRef = users.doc();
      uid = userRef.id;
      const createdUser = {
        firstName,
        lastName,
        email: emailClean,
        promoConsent: Boolean(promoConsent),
        googleId: payload.sub,
        googlePicture: payload.picture || null,
        emailVerified: true,
        authProviders: ['google'],
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
      };

      tx.set(emailRef, { uid });
      tx.set(userRef, createdUser);
      userForResponse = createdUser;
    });
  } catch (err) {
    console.error('[google auth] user transaction failed:', err.message);
    return res.status(500).json({ error: 'Failed to sign in with Google. Please try again.' });
  }

  const token = signToken({ sub: uid, email: emailClean, name: userForResponse.firstName });
  res.setHeader('Set-Cookie', createSessionCookie(token, req));

  return res.status(200).json({
    token,
    user: publicUser(uid, userForResponse),
  });
}
