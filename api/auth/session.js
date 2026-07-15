import { createSessionCookie, getRequestToken, setCors, verifyToken } from '../../lib/auth.js';

export default function handler(req, res) {
  setCors(res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const token = getRequestToken(req);
  const payload = token ? verifyToken(token) : null;
  if (!payload) return res.status(401).json({ error: 'Authentication required. Please log in.' });

  res.setHeader('Set-Cookie', createSessionCookie(token, req));
  return res.status(200).json({
    ok: true,
    user: { id: payload.sub, email: payload.email, firstName: payload.name },
  });
}
