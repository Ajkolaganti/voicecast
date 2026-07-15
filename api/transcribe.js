const UPSTREAM = 'https://web-production-0f5d1.up.railway.app';

import { requireAuth, setCors } from '../lib/auth.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  setCors(res, 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const payload = requireAuth(req, res);
  if (!payload) return;

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

    const data = await upstreamRes.json();
    res.setHeader('Content-Type', 'application/json');
    return res.status(upstreamRes.status).json(data);
  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(502).json({ error: 'Upstream error: ' + err.message });
  }
}
