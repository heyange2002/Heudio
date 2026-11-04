import { musicRoute, createMusicClient, refreshSavedMusicSessions } from './cloudflare/music.mjs';
import { getWeather } from './cloudflare/context.mjs';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { transcribeSpeech } from './cloudflare/transcribe.mjs';
import { MAX_VOICE_BYTES } from './shared/wav.mjs';
import { pipeline } from 'node:stream/promises';
import { companionChat, companionConfig } from './cloudflare/companion.mjs';
import { speechConfig, synthesizeSpeech } from './cloudflare/speech.mjs';
import express from 'express';
import https from 'node:https';
import fs from 'node:fs';
import { createSecurity } from './security.mjs';
import { createLocalProviderSettings } from './local-provider-settings.mjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: process.env.SOUNDISLE_ENV_FILE || '.env' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const desktop = process.env.SOUNDISLE_DESKTOP === 'true';
const PORT = Number(process.env.PORT || (desktop ? 0 : 3000));
const production = process.env.NODE_ENV === 'production';
const security = createSecurity({ key: process.env.APP_ACCESS_KEY, production: production && !desktop, desktop });
if (process.env.TRUST_LOOPBACK_PROXY === 'true') app.set('trust proxy', 'loopback');

app.use((req, res, next) => {
  if (production && !desktop && !req.secure) return res.status(426).send('请通过 HTTPS 访问');
  if (desktop && req.get('host') !== `127.0.0.1:${req.socket.localPort}`) return res.sendStatus(403);
  // Never allow development static serving to expose private local state.
  let pathname = req.path;
  try { for (let i=0;i<2;i++) pathname=decodeURIComponent(pathname); } catch { return res.sendStatus(400); }
  if (pathname.split('/').some(part => part.startsWith('.') && part !== '.well-known')) return res.sendStatus(404);
  next();
});
app.use(express.json({ limit: '64kb' }));
app.use('/api', security);

const dataDir = desktop ? process.env.SOUNDISLE_DATA_DIR! : path.join(__dirname, '.data');
fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const providerSettings = desktop ? createLocalProviderSettings(dataDir, process.env) : null;
const stateFile = path.join(dataDir, 'music-state.json');
let musicState = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {};
const persistMusic = () => { fs.writeFileSync(stateFile + '.tmp', JSON.stringify(musicState), { mode: 0o600 }); fs.renameSync(stateFile + '.tmp', stateFile); };
if (!musicState['qq:secret']) { musicState['qq:secret'] = randomBytes(32).toString('hex'); persistMusic(); }
const musicEnv = { ...process.env, QQ_SESSION_SECRET: process.env.QQ_SESSION_SECRET || musicState['qq:secret'] };
const musicStore = { keys: async (prefix: string) => Object.keys(musicState).filter(key => key.startsWith(prefix)), get: async (key: string) => musicState[key], put: async (key: string, value: unknown) => { musicState[key] = value; persistMusic(); }, delete: async (key: string) => { delete musicState[key]; persistMusic(); } };
let musicRefreshRunning = false;
const renewMusic = async () => {
  if (musicRefreshRunning) return;
  musicRefreshRunning = true;
  try { await refreshSavedMusicSessions(musicEnv, musicStore); }
  catch { console.warn('QQ session renewal deferred'); }
  finally { musicRefreshRunning = false; }
};
setInterval(renewMusic, 5 * 60000).unref();
void renewMusic();
const webRequest = (req: express.Request, signal?: AbortSignal) => new Request(`${req.protocol}://${req.get('host')}${req.originalUrl}`, { method: req.method, signal, headers: { Cookie: req.headers.cookie || '', 'Content-Type': 'application/json', ...(req.headers.range ? { Range: req.headers.range } : {}) }, ...(['POST','PUT'].includes(req.method) ? { body: JSON.stringify(req.body) } : {}) });
app.use('/api/music', async (req, res) => {
  const controller = new AbortController(); const cancel = () => controller.abort(); res.on('close', cancel);
  try {
    const result = await musicRoute(webRequest(req, controller.signal), musicEnv, musicStore);
    result.headers.forEach((value, key) => res.setHeader(key, value)); res.status(result.status);
    if (!result.body || req.method === 'HEAD') res.end();
    else await pipeline(Readable.fromWeb(result.body as any), res);
  } catch { if (!res.headersSent) res.status(502).json({ error: '音乐下载中断，请重试' }); else res.destroy(); }
  finally { res.off('close', cancel); }
});
app.get('/api/context/weather', async (req, res) => res.json(await getWeather(req.query.city)));

app.get('/api/voice/config', (_req, res) => res.json({ ...speechConfig(process.env), keyEditable: desktop }));
app.all('/api/settings/minimax', (req, res) => {
  if (!providerSettings) return res.status(403).json({ error: '请在 PC 应用中配置 MiniMax API Key' });
  try {
    if (req.method === 'PUT') providerSettings.save(req.body?.apiKey);
    else if (req.method === 'DELETE') providerSettings.clear();
    else return res.status(405).json({ error: '方法不支持' });
    return res.json({ configured: speechConfig(process.env).configured });
  } catch (error) {
    return res.status(error instanceof TypeError ? 400 : 500).json({ error: error instanceof TypeError ? error.message : '保存失败，请检查本机数据目录是否可写' });
  }
});
app.post('/api/voice/transcribe', express.raw({type:'audio/wav',limit:MAX_VOICE_BYTES}), async (req,res) => {
  const controller=new AbortController(); const cancel=()=>controller.abort(); res.on('close',cancel);
  try {
    const request=new Request(`${req.protocol}://${req.get('host')}${req.originalUrl}`,{method:'POST',headers:{'Content-Type':req.headers['content-type']||''},body:Buffer.isBuffer(req.body)?new Uint8Array(req.body).buffer:undefined,signal:controller.signal});
    const result=await transcribeSpeech(request,process.env);
    if(!res.destroyed){result.headers.forEach((value,key)=>res.setHeader(key,value));res.status(result.status).send(Buffer.from(await result.arrayBuffer()));}
  }finally{res.off('close',cancel);}
});
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
    const staticDir = desktop ? process.env.SOUNDISLE_STATIC_DIR! : path.join(__dirname, 'dist');
    app.use(express.static(staticDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  const host = desktop ? '127.0.0.1' : process.env.HOST || '127.0.0.1';
  const cert = desktop ? undefined : process.env.TLS_CERT_PATH, key = desktop ? undefined : process.env.TLS_KEY_PATH;
  if (!!cert !== !!key) throw Error('TLS_CERT_PATH and TLS_KEY_PATH must be configured together');
  if (production && !desktop && !cert && process.env.TRUST_LOOPBACK_PROXY !== 'true') throw Error('Production requires HTTPS certificates or a trusted loopback TLS proxy');
  const server = cert ? https.createServer({ cert: fs.readFileSync(cert), key: fs.readFileSync(key!), minVersion: 'TLSv1.2' }, app) : app;
  const listener = server.listen(PORT, host, () => {
    const address = listener.address();
    const port = typeof address === 'object' && address ? address.port : PORT;
    console.log(`SoundIsle: ${cert ? 'https' : 'http'}://${host}:${port}`);
    (process as any).parentPort?.postMessage({ type: 'ready', port });
  });
  listener.on('error', error => { console.error(error); process.exit(1); });
}

startServer().catch(error => { console.error(error); process.exit(1); });
