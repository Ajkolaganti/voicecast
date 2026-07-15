/**
 * lib/firebase.js
 *
 * Initialises the Firebase Admin SDK exactly once per Lambda container.
 * Vercel preserves the Node.js module cache between warm invocations.
 *
 * Required Vercel env vars:
 *   FIREBASE_PROJECT_ID    — e.g. voicecast-abc12
 *   FIREBASE_CLIENT_EMAIL  — service account email
 *   FIREBASE_PRIVATE_KEY   — service account private key (paste full PEM block;
 *                             Vercel stores \n as literal \\n so we unescape below)
 *
 * Get these from:
 *   Firebase Console → Project Settings → Service Accounts
 *   → Generate New Private Key → download JSON
 *   Copy project_id, client_email, private_key into Vercel env vars.
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore }                  from 'firebase-admin/firestore';

function initFirebase() {
  if (getApps().length > 0) return; // already initialised

  const projectId   = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey  = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Missing Firebase env vars. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, ' +
      'and FIREBASE_PRIVATE_KEY in your Vercel project settings.\n' +
      'Get them: Firebase Console → Project Settings → Service Accounts → Generate New Private Key'
    );
  }

  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

/** Returns a Firestore instance. Idempotent — safe to call on every request. */
export function getDb() {
  initFirebase();
  return getFirestore();
}

export const COLLECTIONS = {
  USERS:       'users',
  TRANSCRIPTS: 'transcripts',
};