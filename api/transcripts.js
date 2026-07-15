/**
 * GET  /api/transcripts  — list user's transcripts (paginated, filterable)
 * POST /api/transcripts  — save a new transcript
 *
 * Firestore path: transcripts/{docId}
 * Keyword search: searchTokens array-contains query
 * GET params: ?page=1&limit=20&language=en&model=base&search=keyword
 */

import { FieldValue }              from 'firebase-admin/firestore';
import { getDb, COLLECTIONS }     from '../lib/firebase.js';
import { requireAuth, setCors }   from '../lib/auth.js';

export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  setCors(res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const payload = requireAuth(req, res);
  if (!payload) return;

  let db;
  try { db = getDb(); } catch { return res.status(503).json({ error: 'Firebase is not configured.' }); }

  const col = db.collection(COLLECTIONS.TRANSCRIPTS);
  const uid = payload.sub;

  if (req.method === 'GET') {
    const { page = '1', limit = '20', language = '', model = '', search = '' } = req.query;
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const pageNum  = Math.max(1, parseInt(page, 10) || 1);
    const offset   = (pageNum - 1) * limitNum;

    let query = col.where('userId', '==', uid);
    if (language) query = query.where('language', '==', language);
    if (model)    query = query.where('model',    '==', model);
    if (search.trim()) query = query.where('searchTokens', 'array-contains', search.trim().toLowerCase());
    query = query.orderBy('createdAt', 'desc');

    const [snap, countSnap] = await Promise.all([
      query.offset(offset).limit(limitNum).get(),
      col.where('userId', '==', uid).count().get(),
    ]);
    const total = countSnap.data().count;

    return res.status(200).json({
      results: snap.docs.map(d => {
        const data = d.data();
        return { id: d.id, fileName: data.fileName, fileSize: data.fileSize, preview: data.preview ?? '',
          wordCount: data.wordCount, language: data.language, model: data.model,
          duration: data.duration, createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null };
      }),
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  }

  if (req.method === 'POST') {
    const { fileName, fileSize, text, language, model, duration } = req.body || {};
    if (!text?.trim())     return res.status(400).json({ error: 'text is required.' });
    if (!fileName?.trim()) return res.status(400).json({ error: 'fileName is required.' });

    const words   = text.trim().split(/\s+/).filter(Boolean).length;
    const preview = text.slice(0, 200).trimEnd() + (text.length > 200 ? '\u2026' : '');
    const searchTokens = [...new Set(
      text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2).slice(0, 500)
    )];

    const docRef = col.doc();
    await docRef.set({
      userId: uid, fileName: fileName.trim(), fileSize: Number(fileSize) || 0,
      text: text.trim(), preview, wordCount: words,
      language: language || 'auto', model: model || 'default',
      duration: Number(duration) || 0, searchTokens,
      createdAt: FieldValue.serverTimestamp(),
    });

    return res.status(201).json({ id: docRef.id, wordCount: words, preview });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}