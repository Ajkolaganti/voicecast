/**
 * GET /api/auth/firebase-token
 *
 * Bridges the existing VoiceCast session to Firebase Auth so the browser can
 * read/write its own Firestore transcript history directly.
 */

import { getAuth } from 'firebase-admin/auth';
import { getDb } from '../../lib/firebase.js';
import { requireAuth, setCors } from '../../lib/auth.js';

export const config = { api: { bodyParser: false } };

function getFirebaseWebConfig() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const apiKey = process.env.FIREBASE_WEB_API_KEY || process.env.FIREBASE_API_KEY;
  const authDomain = process.env.FIREBASE_AUTH_DOMAIN || (projectId ? `${projectId}.firebaseapp.com` : '');
  const appId = process.env.FIREBASE_WEB_APP_ID || process.env.FIREBASE_APP_ID || '';

  if (!projectId || !apiKey || !authDomain) {
    throw new Error('Missing Firebase web config. Set FIREBASE_WEB_API_KEY and FIREBASE_AUTH_DOMAIN in Vercel.');
  }

  return {
    apiKey,
    authDomain,
    projectId,
    ...(appId ? { appId } : {}),
  };
}

export default async function handler(req, res) {
  setCors(res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

  const payload = requireAuth(req, res);
  if (!payload) return;

  try {
    getDb();
    const firebaseConfig = getFirebaseWebConfig();
    const token = await getAuth().createCustomToken(payload.sub);

    return res.status(200).json({
      token,
      uid: payload.sub,
      firebaseConfig,
    });
  } catch (err) {
    console.error('[firebase-token] failed:', err.message);
    return res.status(503).json({ error: err.message || 'Firebase client auth is not configured.' });
  }
}
