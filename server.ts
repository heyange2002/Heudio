import { companionChat, companionConfig } from './cloudflare/companion.mjs';
import { speechConfig, synthesizeSpeech } from './cloudflare/speech.mjs';
import express from 'express';
import https from 'node:https';
import fs from 'node:fs';
import { createSecurity } from './security.mjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);
const production = process.env.NODE_ENV === 'production';
const security = createSecurity({ key: process.env.APP_ACCESS_KEY, production });
if (process.env.TRUST_LOOPBACK_PROXY === 'true') app.set('trust proxy', 'loopback');

app.use((req, res, next) => {
  if (production && !req.secure) return res.status(426).send('请通过 HTTPS 访问');
  next();
});
app.use(express.json({ limit: '64kb' }));
app.use('/api', security);

app.get('/api/voice/config', (_req, res) => res.json(speechConfig(process.env)));
app.post('/api/voice/synthesize', async (req, res) => {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  res.on('close', cancel);
  try {
    const result = await synthesizeSpeech(req.body, process.env, fetch, controller.signal);
    if (res.destroyed) return;
    result.headers.forEach((value, name) => res.setHeader(name, value));
    res.status(result.status).send(Buffer.from(await result.arrayBuffer()));
  } finally { res.off('close', cancel); }
});

app.get('/api/agent/config', (_req, res) => res.json(companionConfig(process.env)));
app.post('/api/agent/chat', async (req, res) => {
  if (typeof req.body?.message !== 'string' || !req.body.message.trim() || req.body.message.length > 8000) {
    return res.status(400).json({ error: '消息长度应为 1～8000 字符' });
  }
  const controller = new AbortController();
  const cancel = () => controller.abort();
  res.on('close', cancel);
  try {
    const result = await companionChat(req.body, process.env, fetch, controller.signal);
    if (!res.destroyed) res.json(result);
  } finally { res.off('close', cancel); }
});

// Start dev or production server
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  const host = process.env.HOST || '127.0.0.1';
  const cert = process.env.TLS_CERT_PATH, key = process.env.TLS_KEY_PATH;
  if (!!cert !== !!key) throw Error('TLS_CERT_PATH and TLS_KEY_PATH must be configured together');
  if (production && !cert && process.env.TRUST_LOOPBACK_PROXY !== 'true') throw Error('Production requires HTTPS certificates or a trusted loopback TLS proxy');
  const server = cert ? https.createServer({ cert: fs.readFileSync(cert), key: fs.readFileSync(key!), minVersion: 'TLSv1.2' }, app) : app;
  server.listen(PORT, host, () => console.log(`SoundIsle: ${cert ? 'https' : 'http'}://${host}:${PORT}`));
}

startServer();
