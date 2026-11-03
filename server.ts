import { musicRoute, createMusicClient } from './cloudflare/music.mjs';
import { getWeather } from './cloudflare/context.mjs';
import { randomBytes } from 'node:crypto';
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

const dataDir = path.join(__dirname, '.data');
fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const stateFile = path.join(dataDir, 'music-state.json');
let musicState = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {};
const persistMusic = () => { fs.writeFileSync(stateFile + '.tmp', JSON.stringify(musicState), { mode: 0o600 }); fs.renameSync(stateFile + '.tmp', stateFile); };
if (!musicState['qq:secret']) { musicState['qq:secret'] = randomBytes(32).toString('hex'); persistMusic(); }
const musicEnv = { ...process.env, QQ_SESSION_SECRET: process.env.QQ_SESSION_SECRET || musicState['qq:secret'] };
const musicStore = { get: async (key: string) => musicState[key], put: async (key: string, value: unknown) => { musicState[key] = value; persistMusic(); }, delete: async (key: string) => { delete musicState[key]; persistMusic(); } };
const webRequest = (req: express.Request) => new Request(`${req.protocol}://${req.get('host')}${req.originalUrl}`, { method: req.method, headers: { Cookie: req.headers.cookie || '', 'Content-Type': 'application/json' }, ...(['POST','PUT'].includes(req.method) ? { body: JSON.stringify(req.body) } : {}) });
app.use('/api/music', async (req, res) => {
  const result = await musicRoute(webRequest(req), musicEnv, musicStore);
  result.headers.forEach((value, key) => res.setHeader(key, value));
  res.status(result.status).send(Buffer.from(await result.arrayBuffer()));
});
app.get('/api/context/weather', async (req, res) => res.json(await getWeather(req.query.city)));

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
    const music = req.body.musicSource === 'qq-music' ? await createMusicClient(webRequest(req), musicEnv, musicStore) : undefined;
    const weather = await getWeather(req.body.profile?.city);
    const result = await companionChat({ ...req.body, weather: weather.summary }, process.env, fetch, controller.signal, music);
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
