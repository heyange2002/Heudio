import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import { ApiError, readConfig, required, integer } from './config.mjs';
import { qqClient, normalizeSong, mediaUrl, sessionToken } from './qq-client.mjs';
import { companion } from './companion.mjs';

const prefix = '/api/v1';
const qualities = new Set(['128', '320', 'flac', 'best', 'm4a', 'ape']);
const cookieName = 'heudio_session';

async function readBody(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw new ApiError(415, 'JSON_REQUIRED', '请使用 JSON 请求');
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 65536) throw new ApiError(413, 'BODY_TOO_LARGE', '请求内容过长');
    chunks.push(chunk);
  }
  try { const body = JSON.parse(Buffer.concat(chunks).toString()); if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error(); return body; }
  catch { throw new ApiError(400, 'INVALID_JSON', 'JSON 格式不正确'); }
}

export function createApp(config = readConfig(), transport = fetch) {
  const qq = qqClient(config, transport), sessions = new Map(), limits = new Map();
  function send(res, status, payload) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(payload));
  }
  function session(req, res) {
    const id = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
    let s = sessions.get(id);
    if (!s || s.expires < Date.now()) {
      if (id) sessions.delete(id);
      if (sessions.size >= 1000) throw new ApiError(503, 'SESSION_CAPACITY', '服务繁忙，请稍后重试');
      const fresh = randomBytes(32).toString('hex');
      s = { expires: Date.now() + config.sessionTtl, token: '', generation: 0, qr: new Map(), playback: new Map() };
      sessions.set(fresh, s);
      res.setHeader('Set-Cookie', `${cookieName}=${fresh}; HttpOnly; Path=/api; SameSite=${config.sameSite}; Max-Age=${Math.floor(config.sessionTtl / 1000)}${config.secure ? '; Secure' : ''}`);
    }
    return s;
  }
  function ownQr(s, key) {
    required(key, '二维码标识');
    if (!s.qr.has(key) || s.qr.get(key) < Date.now()) throw new ApiError(404, 'QR_EXPIRED', '二维码已失效，请重新生成');
  }
  function rateLimit(req, chat) {
    const key = req.socket.remoteAddress + (chat ? ':chat' : ':api');
    let r = limits.get(key);
    if (!r || r.until < Date.now()) { r = { count: 0, until: Date.now() + 60000 }; limits.set(key, r); }
    if (++r.count > (chat ? 15 : 180)) throw new ApiError(429, 'TOO_MANY_REQUESTS', '请求过于频繁，请稍后再试');
  }
  async function playback(s, id, quality) {
    const key = id + ':' + quality, cached = s.playback.get(key);
    if (cached?.expires > Date.now()) return cached;
    const generation = s.generation;
    const d = await qq('/getMusicPlay/' + encodeURIComponent(id), { quality, resType: 'play' }, s.token);
    if (generation !== s.generation) throw new ApiError(409, 'SESSION_CHANGED', '账号状态已变化，请重试');
    const entry = d.data?.playUrl?.[id];
    if (!entry?.url || entry.error) throw new ApiError(422, 'PLAYBACK_UNAVAILABLE', '本次未取得播放地址，可尝试登录或其他音质');
    const result = { url: mediaUrl(entry.url), preview: entry.preview === true, quality: entry.quality || quality, expires: Date.now() + 60000 };
    if (s.playback.size >= 30) s.playback.delete(s.playback.keys().next().value);
    s.playback.set(key, result); return result;
  }
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://heudio.internal'), path = url.pathname.slice(prefix.length), q = url.searchParams;
      const origin = req.headers.origin;
      if (origin && !config.origins.includes(origin)) throw new ApiError(403, 'ORIGIN_DENIED', '当前网页来源未被后端允许');
      if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Access-Control-Allow-Credentials', 'true'); res.setHeader('Vary', 'Origin'); }
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Heudio-Client, Range', 'Access-Control-Max-Age': '600' }); res.end(); return;
      }
      if (!url.pathname.startsWith(prefix + '/')) throw new ApiError(404, 'NOT_FOUND', '接口不存在');
      if (path === '/health' && req.method === 'GET') {
        send(res, 200, { data: { service: 'heudio-backend', version: '0.4.0', musicProvider: 'qq', companion: { enabled: !!(config.llmBase && config.llmKey && config.models.length), models: config.models, defaultModel: config.defaultModel || '' } } }); return;
      }
      const streamMatch = path.match(/^\/music\/stream\/([a-zA-Z0-9_-]{1,128})$/);
      if (!streamMatch && req.headers['x-heudio-client'] !== 'web') throw new ApiError(403, 'CLIENT_HEADER_REQUIRED', '请求缺少应用标识');
      rateLimit(req, path === '/companion/chat');
      const s = session(req, res);
      let data;
      if (path === '/music/status' && req.method === 'GET') {
        const d = await qq('/login/status', {}, s.token); const p = d.data?.profile;
        data = { provider: 'qq', loggedIn: !!p, profile: p ? { nickname: String(p.nickname || p.nick || 'QQ 音乐用户') } : null };
        if (!p) { s.token = ''; s.playback.clear(); }
      } else if (path === '/music/search' && req.method === 'GET') {
        const keyword = required(q.get('q'), '搜索词', /^\S[\s\S]{0,59}$/);
        const d = await qq('/search', { keyword, type: 'song', page: integer(q.get('page'), 1, 1, 100), limit: integer(q.get('limit'), 20, 1, 20) }, s.token);
        if (!Array.isArray(d.items)) throw new ApiError(502, 'QQ_INVALID_RESPONSE', '搜索服务返回了无效数据');
        data = { items: d.items.map(normalizeSong).filter(Boolean), total: d.total || 0, more: d.more === true };
      } else if (path.match(/^\/music\/tracks\/[^/]+\/playback$/) && req.method === 'GET') {
        const id = required(path.split('/')[3], '歌曲 ID'), quality = q.get('quality') || '128';
        if (!qualities.has(quality)) throw new ApiError(400, 'INVALID_QUALITY', '音质参数不正确');
        const p = await playback(s, id, quality);
        data = { streamPath: `/music/stream/${encodeURIComponent(id)}?quality=${quality}`, preview: p.preview, quality: p.quality };
      } else if (streamMatch && req.method === 'GET') {
        const quality = q.get('quality') || '128';
        if (!qualities.has(quality)) throw new ApiError(400, 'INVALID_QUALITY', '音质参数不正确');
        if (req.headers.range && !/^bytes=\d*-\d*$/.test(req.headers.range)) throw new ApiError(416, 'INVALID_RANGE', '不支持该音频范围');
        const p = await playback(s, streamMatch[1], quality);
        let media, target = p.url;
        try {
          for (let attempt = 0; attempt < 4; attempt++) {
            media = await transport(mediaUrl(target), { headers: req.headers.range ? { Range: req.headers.range } : {}, redirect: 'manual', signal: AbortSignal.timeout(120000) });
            if (![301, 302, 303, 307, 308].includes(media.status)) break;
            const next = media.headers.get('location'); await media.body?.cancel();
            target = new URL(next, target).href; media = null;
          }
        } catch (e) { if (e instanceof ApiError) throw e; throw new ApiError(502, 'STREAM_UNAVAILABLE', '音频连接失败，请重试'); }
        if (!media || ![200, 206, 416].includes(media.status)) { await media?.body?.cancel(); throw new ApiError(502, 'STREAM_UNAVAILABLE', '音频服务暂时不可用'); }
        res.statusCode = media.status;
        for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) if (media.headers.has(h)) res.setHeader(h, media.headers.get(h));
        res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
        if (media.body) await pipeline(Readable.fromWeb(media.body), res); else res.end(); return;
      } else if (path.match(/^\/music\/tracks\/[^/]+\/lyrics$/) && req.method === 'GET') {
        const id = required(path.split('/')[3], '歌曲 ID'), d = await qq('/getLyric', { songmid: id, trans: 1 }, s.token);
        data = { format: 'lrc', text: typeof d.response?.lyric === 'string' ? d.response.lyric : '', translation: typeof d.response?.trans === 'string' ? d.response.trans : '' };
      } else if (path.match(/^\/music\/playlists\/[^/]+$/) && req.method === 'GET') {
        const id = required(path.split('/')[3], '歌单 ID', /^\d{1,30}$/);
        const d = await qq('/getSongListDetail/' + id, {}, s.token);
        const cd = d.response?.cdlist?.[0] || d.data?.cdlist?.[0];
        if (!Array.isArray(cd?.songlist)) throw new ApiError(404, 'PLAYLIST_UNAVAILABLE', '歌单不存在或当前账号不可访问');
        data = { items: cd.songlist.map(normalizeSong).filter(Boolean), name: cd.dissname || '' };
      } else if (path === '/auth/channels' && req.method === 'GET') {
        const d = await qq('/login/channels');
        data = { channels: d.data?.channels || [] };
      } else if (path === '/auth/qr' && req.method === 'POST') {
        const body = await readBody(req); const channel = body.channel || 'qq';
        if (!['qq', 'wechat', 'qqmusic'].includes(channel)) throw new ApiError(400, 'INVALID_CHANNEL', '登录通道不正确');
        if (s.qr.size >= 5) throw new ApiError(429, 'QR_LIMIT', '请等待已有二维码过期或取消后重试');
        const generation = s.generation;
        const k = await qq('/login/qr/key', { channel }); const key = required(k.data?.unikey, '二维码标识');
        if (generation !== s.generation) { await qq('/login/qr/cancel', { key }).catch(() => {}); throw new ApiError(409, 'SESSION_CHANGED', '账号状态已变化，请重新扫码'); }
        s.qr.set(key, Date.now() + 240000);
        const d = await qq('/login/qr/create', { key }); const image = d.data?.qrimg;
        if (typeof image !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/i.test(image)) throw new ApiError(502, 'QR_INVALID_IMAGE', '二维码图片格式不受支持');
        data = { key, image, channel };
      } else if (path.match(/^\/auth\/qr\/[^/]+$/) && ['GET', 'DELETE'].includes(req.method)) {
        const key = path.split('/')[3]; ownQr(s, key);
        if (req.method === 'DELETE') { await qq('/login/qr/cancel', { key }); s.qr.delete(key); data = { cancelled: true }; }
        else {
          const generation = s.generation;
          const d = await qq('/login/qr/check', { key });
          if (generation !== s.generation) throw new ApiError(409, 'SESSION_CHANGED', '账号已退出，请重新扫码');
          if (Number(d.code) === 803) { s.token = sessionToken(d); s.playback.clear(); }
          if (Number(d.code) === 800) s.qr.delete(key);
          data = { code: Number(d.code), loggedIn: Number(d.code) === 803, message: Number(d.code) === 800 ? '二维码已过期或登录失败，请重新扫码' : '' };
        }
      } else if (path === '/auth/session' && req.method === 'DELETE') {
        const oldToken = s.token;
        s.generation++; s.token = ''; s.playback.clear();
        if (oldToken) await qq('/logout', {}, oldToken);
        // Cancel this app session's pending QR codes so a late poll cannot log it back in.
        for (const key of s.qr.keys()) await qq('/login/qr/cancel', { key }).catch(() => {});
        s.qr.clear(); data = { loggedIn: false };
      } else if (path === '/weather/cities' && req.method === 'GET') {
        const name = required(q.get('q'), '城市名', /^\S[\s\S]{0,79}$/);
        const target = new URL('https://geocoding-api.open-meteo.com/v1/search');
        target.search = new URLSearchParams({ name, count: '5', language: 'zh', format: 'json' });
        data = await weatherJson(target, config, transport);
      } else if (path === '/weather/current' && req.method === 'GET') {
        if (!q.has('lat') || !q.has('lon')) throw new ApiError(400, 'INVALID_COORDINATES', '缺少经纬度');
        const lat = Number(q.get('lat')), lon = Number(q.get('lon'));
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new ApiError(400, 'INVALID_COORDINATES', '经纬度不正确');
        const target = new URL('https://api.open-meteo.com/v1/forecast');
        target.search = new URLSearchParams({ latitude: lat, longitude: lon, current: 'temperature_2m,weather_code', timezone: 'auto' });
        data = await weatherJson(target, config, transport);
      } else if (path === '/companion/chat' && req.method === 'POST') {
        data = await companion(config, await readBody(req), transport);
      } else throw new ApiError(404, 'NOT_FOUND', '接口不存在或请求方法不正确');
      send(res, 200, { data });
    } catch (error) {
      if (res.headersSent || res.destroyed) { res.destroy(); return; }
      send(res, error instanceof ApiError ? error.status : 500, { error: { code: error instanceof ApiError ? error.code : 'INTERNAL_ERROR', message: error instanceof ApiError ? error.message : '服务暂时不可用' } });
    }
  });
  server.requestTimeout = 45000;
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of sessions) {
      if (value.expires < now) sessions.delete(key);
      else for (const [qr, expires] of value.qr) if (expires < now) value.qr.delete(qr);
    }
    for (const [key, value] of limits) if (value.until < now) limits.delete(key);
  }, 60000); cleanup.unref(); server.on('close', () => clearInterval(cleanup));
  return server;
}

async function weatherJson(url, config, transport) {
  try {
    const r = await transport(url, { signal: AbortSignal.timeout(config.timeout), redirect: 'error' });
    if (!r.ok) throw Error(); return await r.json();
  } catch { throw new ApiError(502, 'WEATHER_UNAVAILABLE', '天气服务暂时不可用'); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = readConfig();
  const server = createApp(config);
  server.listen(config.port, config.host, () => console.log(`Heudio backend: http://${config.host}:${config.port}/api/v1/health`));
  const close = () => server.close(() => process.exit(0));
  process.on('SIGTERM', close); process.on('SIGINT', close);
}
