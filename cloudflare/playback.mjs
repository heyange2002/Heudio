import { createHash, randomBytes } from 'node:crypto';
// Only official QQ media hosts may receive the signed playback query.
const official = host => host.endsWith('.qqmusic.qq.com') || host.endsWith('.tc.qq.com');
function mediaUrl(raw) {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || !official(url.hostname) || url.username || url.password || (url.port && url.port !== '443') || !/^\/[a-zA-Z0-9_.-]+\.(?:mp3|m4a|flac|ape)$/i.test(url.pathname)) throw Error('QQ 音乐播放地址格式无效');
  url.protocol = 'https:'; url.hash = ''; return url;
}
async function probe(url, fetchImpl, signal) {
  try {
    let next = url;
    for (let redirects = 0; redirects < 3; redirects++) {
      const response = await fetchImpl(next.toString(), {
        method: 'GET', redirect: 'manual', signal,
        headers: { Range: 'bytes=0-0', 'Accept-Encoding': 'identity' },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('Location'); await response.body?.cancel();
        if (!location) return null;
        const redirected = mediaUrl(new URL(location, next).toString());
        // Never forward the signed query through an HTTP redirect.
        if (new URL(location, next).protocol !== 'https:') return null;
        next = redirected; continue;
      }
      const type = response.headers.get('Content-Type') || '';
      const valid = response.status === 206 && /^bytes 0-0\/\d+$/.test(response.headers.get('Content-Range') || '') && /^(?:audio\/|application\/octet-stream)/i.test(type);
      await response.body?.cancel();
      return valid ? next.toString() : null;
    }
  } catch { /* TLS, network and upstream failures never expose signed URLs. */ }
  return null;
}
export async function securePlayback(data, fetchImpl = fetch, signal) {
  const entries = data?.data?.playUrl;
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return data;
  const output = { ...data, data: { ...data.data, playUrl: { ...entries } } };
  for (const [mid, entry] of Object.entries(entries).slice(0, 20)) {
    if (!entry?.url) continue;
    const original = mediaUrl(entry.url);
    // QQ's generic stream host may have an unusable TLS chain. The tc CDN
    // accepts the same signed resource and serves it with a valid HTTPS chain.
    const alternate = new URL(original); alternate.hostname = 'aqqmusic.tc.qq.com'; alternate.port = '';
    const candidates = [...new Set([original.toString(), alternate.toString()])];
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort();
    const timer = setTimeout(abort, 6000);
    try {
      const results = await Promise.all(candidates.map(url => probe(new URL(url), fetchImpl, controller.signal)));
      const chosen = results.find(Boolean);
      if (!chosen) throw Error('暂未找到可用的 QQ 音乐 HTTPS 播放线路，请稍后重试');
      output.data.playUrl[mid] = { ...entry, url: chosen, httpsVerified: true };
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  return output;
}

// Browser audio uses cookies, not custom API headers. Restrict that exception to
// opaque, session-bound media handles; signed QQ URLs never leave the backend.
export const isMediaRequest = (method, path) => ['GET', 'HEAD'].includes(method) && /^(?:\/api)?\/music\/stream\/[a-f0-9]{48}$/.test(path);
const sessionOwner = request => {
  const cookie = (request.headers.get('Cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith('soundisle_session='));
  if (!cookie) throw Error('请先登录声屿');
  return createHash('sha256').update(cookie).digest('hex');
};
export async function issuePlayback(data, request, store, fetchImpl = fetch) {
  const secure = await securePlayback(data, fetchImpl, request.signal);
  const entries = secure?.data?.playUrl;
  if (!entries) return secure;
  const output = { ...secure, data: { ...secure.data, playUrl: {} } };
  for (const [mid, entry] of Object.entries(entries)) {
    if (!entry?.url) { output.data.playUrl[mid] = entry; continue; }
    const id = randomBytes(24).toString('hex');
    await store.put('media:' + id, { url: entry.url, owner: sessionOwner(request), expires: Date.now() + 30 * 60000 });
    output.data.playUrl[mid] = { ...entry, url: '/api/music/stream/' + id };
  }
  return output;
}
export async function streamPlayback(request, store, fetchImpl = fetch) {
  const deny = (error, status) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
  const path = new URL(request.url).pathname;
  if (!isMediaRequest(request.method, path)) return deny('播放接口不存在', 404);
  const record = await store.get('media:' + path.split('/').at(-1));
  if (!record || record.expires <= Date.now()) return deny('播放链接已过期，请重新点击播放', 410);
  if (record.owner !== sessionOwner(request)) return deny('请使用当前登录会话播放', 403);
  const range = request.headers.get('Range');
  if (range && (range.length > 80 || !/^bytes=(?:\d+-\d*|-\d+)$/.test(range))) return deny('播放范围无效', 416);
  const original = mediaUrl(record.url), alternate = new URL(original); alternate.hostname = 'aqqmusic.tc.qq.com';
  for (const candidate of [...new Set([original.toString(), alternate.toString()])]) {
    let next = candidate;
    for (let redirects = 0; redirects < 3; redirects++) {
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
      let response;
      try {
        response = await fetchImpl(next, { method: request.method, redirect: 'manual',
          signal: AbortSignal.any([request.signal, controller.signal]),
          headers: { 'Accept-Encoding': 'identity', ...(range ? { Range: range } : {}) },
        });
      } catch { break; }
      finally { clearTimeout(timer); }
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('Location'); await response.body?.cancel();
        try {
          const redirected = new URL(location, next);
          if (!location || redirected.protocol !== 'https:') break;
          next = mediaUrl(redirected.toString()).toString(); continue;
        } catch { break; }
      }
      if (response.status === 416) { await response.body?.cancel(); return new Response(null, { status: 416, headers: { 'Content-Range': response.headers.get('Content-Range') || 'bytes */0', 'Cache-Control': 'no-store' } }); }
      if (![200,206].includes(response.status) || !/^(?:audio\/|application\/octet-stream)/i.test(response.headers.get('Content-Type') || '')) { await response.body?.cancel(); break; }
      const headers = new Headers({ 'Cache-Control': 'private, no-store', 'Cross-Origin-Resource-Policy': 'same-origin', 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes' });
      for (const name of ['Content-Type','Content-Range']) if (response.headers.has(name)) headers.set(name, response.headers.get(name));
      if (!response.headers.has('Content-Encoding') && response.headers.has('Content-Length')) headers.set('Content-Length', response.headers.get('Content-Length'));
      return new Response(request.method === 'HEAD' ? null : response.body, { status: response.status, headers });
    }
  }
  return deny('暂时无法下载歌曲，请重新点击播放或稍后重试', 502);
}
