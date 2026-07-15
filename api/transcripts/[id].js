/**
 * GET    /api/transcripts/:id  — fetch full transcript text
 * DELETE /api/transcripts/:id  — delete (owner only)
 */

import { getDb, COLLECTIONS }   from '../../lib/firebase.js';
import { requireAuth, setCors } from '../../lib/auth.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  setCors(res, 'GET, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const payload = requireAuth(req, res);
  if (!payload) return;

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing transcript ID.' });

  let db;
  try { db = getDb(); } catch { return res.status(503).json({ error: 'Firebase is not configured.' }); }

  const docRef = db.collection(COLLECTIONS.TRANSCRIPTS).doc(id);
  const snap   = await docRef.get();

  if (!snap.exists) return res.status(404).json({ error: 'Transcript not found.' });

  const data = snap.data();
  if (data.userId !== payload.sub) return res.status(403).json({ error: 'Access denied.' });

  if (req.method === 'GET') {
    return res.status(200).json({
      id: snap.id, fileName: data.fileName, fileSize: data.fileSize, text: data.text,
      wordCount: data.wordCount, language: data.language, model: data.model,
      duration: data.duration, createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
    });
  }

  if (req.method === 'DELETE') {
    await docRef.delete();
    return res.status(200).json({ deleted: true, id });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}