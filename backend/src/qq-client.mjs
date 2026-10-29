import { ApiError } from './config.mjs';

export function qqClient(config, transport = fetch) {
  return async function request(path, params = {}, token = '', method = 'GET') {
    const url = new URL(config.qqBase + path);
    for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, String(value));
    let response;
    try {
      response = await transport(url, { method, headers: token ? { 'X-QQ-Session': token } : {}, signal: AbortSignal.timeout(config.timeout), redirect: 'error' });
    } catch (e) {
      throw new ApiError(e.name === 'TimeoutError' ? 504 : 502, 'QQ_UNAVAILABLE', 'QQ 音乐服务暂时不可用，请检查后端服务');
    }
    let data;
    try { data = await response.json(); } catch { throw new ApiError(502, 'QQ_INVALID_RESPONSE', 'QQ 音乐服务返回了无效数据'); }
    if (!response.ok) throw new ApiError(response.status === 401 ? 401 : 502, response.status === 401 ? 'LOGIN_REQUIRED' : 'QQ_REQUEST_FAILED', response.status === 401 ? '请先扫码登录 QQ 音乐' : 'QQ 音乐请求未成功，请稍后重试');
    if (data.code !== undefined && ![0, 200, 800, 801, 802, 803].includes(Number(data.code))) throw new ApiError(502, 'QQ_REQUEST_FAILED', 'QQ 音乐请求未成功，请稍后重试');
    return data;
  };
}

export function normalizeSong(song) {
  const mid = song.mid || song.songmid || song.songMid;
  if (!mid) return null;
  const album = song.album?.mid || song.albummid;
  return {
    id: 'qq-' + mid, provider: 'qq', mediaId: String(mid), numericId: song.id || song.songid,
    title: String(song.name || song.songname || song.title || '未命名歌曲'),
    artist: (song.singer || song.artists || []).map(s => s.name).join(' / ') || '未知歌手',
    duration: Number(song.interval || song.duration || 0), genre: 'cloud', scenes: [], source: 'QQ 音乐',
    cover: album && /^[a-zA-Z0-9]+$/.test(album) ? `https://y.gtimg.cn/music/photo_new/T002R500x500M000${album}.jpg` : '',
  };
}

export function mediaUrl(value) {
  try {
    const u = new URL(value);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || (u.port && !['80', '443'].includes(u.port))) throw Error();
    if (!['qq.com', 'gtimg.com'].some(host => u.hostname === host || u.hostname.endsWith('.' + host))) throw Error();
    u.protocol = 'https:';
    return u.href;
  } catch { throw new ApiError(502, 'PLAYBACK_UNAVAILABLE', '当前请求未获得可用的 QQ 音乐播放地址'); }
}

export function sessionToken(result) {
  const token = result.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith('qqmusic_session='))?.slice('qqmusic_session='.length);
  if (typeof token !== 'string' || !/^[a-zA-Z0-9._~-]{16,16384}$/.test(token)) throw new ApiError(502, 'QQ_SESSION_INVALID', '登录服务未返回有效会话，请重新扫码');
  return token;
}
