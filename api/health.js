const UPSTREAM = 'https://web-production-0f5d1.up.railway.app';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const r = await fetch(`${UPSTREAM}/health`);
    const data = await r.json();
    return res.status(r.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'Upstream unreachable' });
  }
}