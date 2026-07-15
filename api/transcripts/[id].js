/**
 * GET    /api/transcripts/:id  — fetch full transcript text
 * DELETE /api/transcripts/:id  — delete (owner only)
 */

import { ObjectId }             from 'mongodb';
import { getDb }                from '../../lib/mongodb.js';
import { requireAuth, setCors } from '../../lib/auth.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  setCors(res, 'GET, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const payload = requireAuth(req, res);
  if (!payload) return;

  const { id } = req.query;
  if (!id || !ObjectId.isValid(id))
    return res.status(400).json({ error: 'Invalid transcript ID.' });

  let db;
  try {
    db = await getDb();
  } catch {
    return res.status(503).json({ error: 'Database unavailable.' });
  }

  const col    = db.collection('transcripts');
  const userId = new ObjectId(payload.sub);
  const docId  = new ObjectId(id);

  if (req.method === 'GET') {
    const doc = await col.findOne({ _id: docId, userId });
    if (!doc) return res.status(404).json({ error: 'Transcript not found.' });
    return res.status(200).json({
      id: doc._id.toString(), fileName: doc.fileName, fileSize: doc.fileSize,
      text: doc.text, wordCount: doc.wordCount, language: doc.language,
      model: doc.model, duration: doc.duration, createdAt: doc.createdAt?.toISOString(),
    });
  }

  if (req.method === 'DELETE') {
    const result = await col.deleteOne({ _id: docId, userId });
    if (result.deletedCount === 0)
      return res.status(404).json({ error: 'Transcript not found or already deleted.' });
    return res.status(200).json({ deleted: true, id });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}