import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { getRequestToken, verifyToken } from '../lib/auth.js';

const APP_HTML = join(process.cwd(), 'protected', 'app.html');

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const token = getRequestToken(req);
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    res.statusCode = 302;
    res.setHeader('Location', '/login.html?next=%2Fapp.html');
    return res.end();
  }

  try {
    const html = await readFile(APP_HTML, 'utf8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    if (req.method === 'HEAD') return res.end();
    return res.status(200).send(html);
  } catch (err) {
    console.error('[app] failed to read protected app:', err.message);
    return res.status(500).json({ error: 'Unable to load app.' });
  }
}
