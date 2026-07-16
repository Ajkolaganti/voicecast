const UPSTREAM = 'https://web-production-0f5d1.up.railway.app';

import { requireAuth, setCors } from '../lib/auth.js';
import { getDb } from '../lib/firebase.js';
import {
  isTranscriptionLimitError,
  releaseTranscriptionUsage,
  reserveTranscriptionUsage,
} from '../lib/usage.js';

export const config = { api: { bodyParser: false } };

function cleanTranscriptLine(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function formatSegments(segments) {
  const blocks = [];
  let paragraph = [];

  for (const segment of segments) {
    const text = cleanTranscriptLine(segment?.text);
    if (!text) continue;

    if (/^step\s+\d+\.?$/i.test(text)) {
      if (paragraph.length) blocks.push(paragraph.join(' '));
      blocks.push(text.endsWith('.') ? text : `${text}.`);
      paragraph = [];
      continue;
    }

    paragraph.push(text);
  }

  if (paragraph.length) blocks.push(paragraph.join(' '));
  return blocks.join('\n\n');
}

function formatTranscriptPayload(data) {
  if (typeof data === 'string') return data.trim();
  if (!data || typeof data !== 'object' || Array.isArray(data)) return '';

  for (const key of ['text', 'transcription', 'result', 'transcript']) {
    if (typeof data[key] === 'string' && data[key].trim()) return data[key].trim();
  }

  if (Array.isArray(data.segments)) return formatSegments(data.segments);
  return '';
}

export default async function handler(req, res) {
  setCors(res, 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const payload = requireAuth(req, res);
  if (!payload) return;

  let db;
  try {
    db = getDb();
  } catch (err) {
    return res.status(503).json({ error: 'Firebase is not configured. Check Vercel environment variables.' });
  }

  let usageReservation;
  try {
    usageReservation = await reserveTranscriptionUsage(db, payload.sub);
  } catch (err) {
    if (isTranscriptionLimitError(err)) {
      return res.status(err.statusCode).json(err.payload);
    }
    console.error('[transcribe] usage reservation failed:', err.message);
    return res.status(500).json({ error: 'Unable to verify transcription usage limits.' });
  }

  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const contentType = req.headers['content-type'] || '';

    const upstreamRes = await fetch(`${UPSTREAM}/transcribe`, {
      method: 'POST',
      headers: { 'content-type': contentType },
      body,
    });

    const raw = await upstreamRes.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = upstreamRes.ok ? { text: raw } : { error: raw || 'Upstream transcription failed.' };
    }

    if (!upstreamRes.ok) {
      await releaseTranscriptionUsage(db, usageReservation);
      return res.status(upstreamRes.status).json(data);
    }

    const formattedText = formatTranscriptPayload(data);
    const response = data && typeof data === 'object' && !Array.isArray(data)
      ? { ...data, text: formattedText || '', usage: usageReservation.usage }
      : { text: formattedText || String(data ?? ''), usage: usageReservation.usage };

    return res.status(upstreamRes.status).json(response);
  } catch (err) {
    await releaseTranscriptionUsage(db, usageReservation);
    console.error('Proxy error:', err);
    return res.status(502).json({ error: 'Upstream error: ' + err.message });
  }
}
