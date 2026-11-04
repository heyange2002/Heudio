import handleRequest from '@yakult-green-tea/qq-music-api/serverless';
import { cookieValue, MUSIC_COOKIE } from '../shared/music-identity.mjs';
import { createHash } from 'node:crypto';
import { issuePlayback, streamPlayback } from './playback.mjs';

const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export function validateMusicConfig(body, local = false) {
  if (body?.mode === 'embedded') return { mode: 'embedded', url: '' };
  if (body?.mode !== 'gateway') throw Error('请选择内置服务或自建服务');
  const url = new URL(body.url);
  if (url.username || url.password || url.search || url.hash) throw Error('服务地址不能包含凭据或查询参数');
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && loopback && url.protocol === 'http:')) throw Error('自建服务需使用 HTTPS，本机可使用 localhost HTTP');
  if (!local && (loopback || /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname) || url.hostname.includes(':') || url.hostname.endsWith('.local'))) throw Error('线上服务需使用公开 HTTPS 地址');
  return { mode: 'gateway', url: url.toString().replace(/\/$/, '') };
}
export { normalizeSongs } from '../shared/music-normalize.mjs';
import { normalizeSongs } from '../shared/music-normalize.mjs';

const allowed = new Set(['/login/channels','/login/qr/key','/login/qr/create','/login/qr/check','/login/qr/cancel','/login/status','/login/refresh','/logout','/search','/user/daily-songs','/user/liked-songs','/user/playlist','/user/playlist-detail','/getSongListDetail','/getLyric']);
export async function createMusicClient(request, env, store, deps = {}) {
  const config = await store.get('music:config') ?? { mode: env.QQ_MUSIC_API_URL ? 'gateway' : 'embedded', url: env.QQ_MUSIC_API_URL || '' };
  const appToken = cookieValue(request.headers.get('Cookie'), 'soundisle_session');
  if (!appToken) throw Error('请先登录声屿');
  const browser = cookieValue(request.headers.get('Cookie'), MUSIC_COOKIE);
  const identity = /^[a-f0-9]{64}$/.test(browser || '') ? browser : appToken;
  const sessionKey = 'qq:session:' + createHash('sha256').update('soundisle_session=' + identity).digest('hex');
  return storedMusicClient(sessionKey, config, env, store, deps);
}
async function storedMusicClient(sessionKey, config, env, store, deps = {}) {
  let session = await store.get(sessionKey);
  if (session?.expires < Date.now()) { await store.delete(sessionKey); session = null; }
  const invoke = deps.handleRequest ?? handleRequest;
  const fetcher = deps.fetch ?? fetch;
  const call = async (path, params = {}, method = 'GET', signal) => {
    if (!allowed.has(path) && !/^\/getMusicPlay\/[a-zA-Z0-9]+$/.test(path)) throw Error('音乐接口不可用');
    session = await store.get(sessionKey);
    if (session && path !== '/login/refresh' && path !== '/logout' && !path.startsWith('/login/qr/') && (session.nextRefreshAt || 0) <= Date.now()) {
      try { await call('/login/refresh', {}, 'POST'); } catch { /* Keep the still-valid saved grant on transient failures. */ }
      session = await store.get(sessionKey);
    }
    const priorToken = session?.token;
    const url = new URL((config.mode === 'gateway' ? config.url : 'https://qq.internal') + path);
    for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, String(value));
    const headers = new Headers();
    if (session?.token) headers.set('X-QQ-Session', session.token);
    const timeoutSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000);
    const upstreamRequest = new Request(url, { method, headers, signal: timeoutSignal });
    let response;
    // Revoke our saved grant before contacting the upstream, including during an outage.
    if (path === '/logout') { await store.delete(sessionKey); session = null; }
    if (path === '/login/refresh' && session) {
      session = { ...session, nextRefreshAt: Date.now() + 5 * 60000 };
      await store.put(sessionKey, session);
    }
    try {
      response = config.mode === 'gateway'
        ? await fetcher(new Request(upstreamRequest, { redirect: 'manual' }))
        : await invoke(upstreamRequest, env);
    } catch { throw Error('暂时无法连接 QQ 音乐，请稍后重试或检查自建服务地址'); }
    let data;
    try { data = await response.json(); } catch { throw Error('QQ 音乐服务暂时不可用，请稍后重试'); }
    if (!response.ok) throw Error(response.status === 401 ? '请先在 QQ 音乐面板扫码授权' : data.failureReason === 'connection-reset' || data.kind === 'network' ? '音乐服务连接 QQ 上游失败，请稍后重试或使用自建音乐服务' : 'QQ 音乐服务暂时不可用，请稍后重试');
    if (data.code && ![0,200,800,801,802,803].includes(data.code)) throw Error('QQ 音乐请求未成功，请检查授权状态后重试');
    const token = data.data?.token ?? data.token ?? /qqmusic_session=([^;]+)/.exec(data.cookie || response.headers.get('Set-Cookie') || '')?.[1];
    if (token && (path !== '/login/refresh' || (await store.get(sessionKey))?.token === priorToken)) {
      session = { token, expires: Number.isFinite(data.data?.expiresAt) ? data.data.expiresAt : session?.expires || Date.now() + 30 * 86400000, nextRefreshAt: Date.now() + 30 * 60000 };
      await store.put(sessionKey, session);
    }
    // QQ credentials stay on the server, including Node QR response cookies.
    const scrub = value => {
      if (Array.isArray(value)) return value.map(scrub);
      if (!value || typeof value !== 'object') return value;
      return Object.fromEntries(Object.entries(value).filter(([key]) => !/^(token|cookie|cookies|credential|credentials|refreshToken)$/i.test(key)).map(([key, v]) => [key, scrub(v)]));
    };
    if (path === '/logout') { await store.delete(sessionKey); session = null; }
    return scrub(data);
  };
  return { config, call, search: async keyword => normalizeSongs(await call('/search', { keyword: String(keyword).slice(0,60), type: 'song', limit: 12 })),
    daily: async () => normalizeSongs(await call('/user/daily-songs')), liked: async () => normalizeSongs(await call('/user/liked-songs')),
    clear: async () => { await store.delete(sessionKey); session = null; },
  };
}
export async function musicRoute(request, env, store, deps) {
  const url = new URL(request.url), path = url.pathname.replace('/api/music', '');
  try {
    if (path.startsWith('/stream/')) return await streamPlayback(request, store, deps?.fetch ?? fetch);
    const client = await createMusicClient(request, env, store, deps);
    if (path === '/config') {
      if (request.method === 'PUT') {
        const config = validateMusicConfig(await request.json(), ['localhost','127.0.0.1','[::1]'].includes(url.hostname));
        await store.put('music:config', config);
        if (config.mode !== client.config.mode || config.url !== client.config.url) await client.clear();
        return json({ ...config, configured: config.mode === 'gateway' || !!env.QQ_SESSION_SECRET });
      }
      if (request.method !== 'GET') return json({ error: '方法不支持' }, 405);
      return json({ ...client.config, configured: client.config.mode === 'gateway' || !!env.QQ_SESSION_SECRET, packageVersion: '3.3.5' });
    }
    if (request.method !== (path === '/login/refresh' ? 'POST' : 'GET')) return json({ error: '方法不支持' }, 405);
    const params = Object.fromEntries(url.searchParams);
    // Do not allow query credentials to bypass this app's server-side QQ session.
    for (const key of ['cookie','token','uid']) delete params[key];
    if (path === '/search') return json({ songs: await client.search(params.keyword || '') });
    if (path === '/user/daily-songs') return json({ songs: await client.daily() });
    if (path === '/user/liked-songs') return json({ songs: await client.liked() });
    if (/^\/getMusicPlay\/[a-zA-Z0-9]+$/.test(path)) {
      const data = await client.call(path, params, request.method, request.signal);
      return json(await issuePlayback(data, request, store, deps?.fetch ?? fetch));
    }
    return json(await client.call(path, params, request.method, request.signal));
  } catch (error) { return json({ error: error.message || '音乐请求失败' }, 502); }
}

// Run on the server even when no settings panel is open. Tokens never leave the store.
export async function refreshSavedMusicSessions(env, store, deps = {}) {
  const config = await store.get('music:config') ?? { mode: env.QQ_MUSIC_API_URL ? 'gateway' : 'embedded', url: env.QQ_MUSIC_API_URL || '' };
  const keys = await store.keys('qq:session:');
  for (const key of keys) {
    const session = await store.get(key);
    if (!session?.token || (session.nextRefreshAt || 0) > Date.now()) continue;
    if (session.expires <= Date.now()) { await store.delete(key); continue; }
    try { const client = await storedMusicClient(key, config, env, store, deps); await client.call('/login/refresh', {}, 'POST'); }
    catch { /* Retry on the next timer; do not discard credentials on network errors. */ }
  }
}
