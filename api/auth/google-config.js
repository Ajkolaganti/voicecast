import { setCors } from '../../lib/auth.js';

export default function handler(req, res) {
  setCors(res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

  return res.status(200).json({
    clientId: process.env.GOOGLE_CLIENT_ID || '',
  });
}
