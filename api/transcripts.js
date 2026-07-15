/**
 * GET  /api/transcripts  — list/search the user's transcripts (paginated)
 * POST /api/transcripts  — save a new transcript
 *
 * GET query params: ?page=1&limit=20&search=keyword&language=en&model=base
 */

import { ObjectId }             from 'mongodb';
import { getDb }                from '../lib/mongodb.js';
import { requireAuth, setCors } from '../lib/auth.js';

export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  setCors(res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const payload = requireAuth(req, res);
  if (!payload) return;

  let db;
  try {
    db = await getDb();
  } catch {
    return res.status(503).json({ error: 'Database unavailable.' });
  }

  const col    = db.collection('transcripts');
  const userId = new ObjectId(payload.sub);

  if (req.method === 'GET') {
    const { page = '1', limit = '20', search = '', language = '', model = '' } = req.query;
    const pageNum  = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip     = (pageNum - 1) * limitNum;

    const filter = { userId };
    if (language) filter.language = language;
    if (model)    filter.model    = model;
    if (search.trim()) filter.$text = { $search: search.trim() };

    const [docs, total] = await Promise.all([
      col
        .find(filter, { projection: { text: 0 } })
        .sort(search ? { score: { $meta: 'textScore' } } : { createdAt: -1 })
        .skip(skip).limit(limitNum).toArray(),
      col.countDocuments(filter),
    ]);

    return res.status(200).json({
      results: docs.map(d => ({
        id: d._id.toString(), fileName: d.fileName, fileSize: d.fileSize,
        preview: d.preview ?? '', wordCount: d.wordCount, language: d.language,
        model: d.model, duration: d.duration, createdAt: d.createdAt?.toISOString(),
      })),
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  }

  if (req.method === 'POST') {
    const { fileName, fileSize, text, language, model, duration } = req.body || {};
    if (!text?.trim())     return res.status(400).json({ error: 'text is required.' });
    if (!fileName?.trim()) return res.status(400).json({ error: 'fileName is required.' });

    const words   = text.trim().split(/\s+/).filter(Boolean).length;
    const preview = text.slice(0, 200).trimEnd() + (text.length > 200 ? '\u2026' : '');
    const doc = {
      userId, fileName: fileName.trim(), fileSize: Number(fileSize) || 0,
      text: text.trim(), preview, wordCount: words,
      language: language || 'auto', model: model || 'default',
      duration: Number(duration) || 0, createdAt: new Date(),
    };

    const result = await col.insertOne(doc);
    return res.status(201).json({ id: result.insertedId.toString(), wordCount: words, preview, createdAt: doc.createdAt.toISOString() });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}