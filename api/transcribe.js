const UPSTREAM = 'https://web-production-0f5d1.up.railway.app';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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