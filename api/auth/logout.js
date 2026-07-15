import { clearSessionCookie, setCors } from '../../lib/auth.js';

export default function handler(req, res) {
  setCors(res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  res.setHeader('Set-Cookie', clearSessionCookie(req));
  return res.status(200).json({ ok: true });
}
