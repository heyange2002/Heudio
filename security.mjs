import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

// Authentication secrets never enter the frontend bundle. TLS handles encryption.
export function createSecurity({ key, production = false, ttl = 3600000, now = Date.now }) {
  if (typeof key !== 'string' || key.length < 32) throw Error('APP_ACCESS_KEY must contain at least 32 characters');
  const digest = value => createHash('sha256').update(value).digest();
  const expected = digest(key), sessions = new Map(), attempts = new Map();
  const cookie = 'soundisle_session';
  const deny = (res, status, error) => res.status(status).json({ error });
  const tokenOf = req => (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(cookie + '='))?.slice(cookie.length + 1);
  const prune = () => {
    for (const [id, end] of sessions) if (end <= now()) sessions.delete(id);
    for (const [ip, value] of attempts) if (value.until <= now()) attempts.delete(ip);
  };
  function middleware(req, res, next) {
    prune();
    const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    if (!req.secure && (production || !loopback)) return deny(res, 426, '请通过 HTTPS 连接服务');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    // Custom header forces a CORS preflight; this same-origin server grants no CORS access.
    if (req.headers['x-soundisle-client'] !== 'web') return deny(res, 403, '请求来源无效');
    const origin = req.headers.origin;
    if (origin && origin !== `${req.protocol}://${req.get('host')}`) return deny(res, 403, '请求来源无效');
    const id = tokenOf(req), authenticated = id && sessions.has(id);
    if (req.path === '/auth/session' && req.method === 'GET') return res.json({ authenticated: !!authenticated });
    if (req.path === '/auth/session' && req.method === 'POST') {
      const ip = req.ip || req.socket.remoteAddress;
      let a = attempts.get(ip);
      if (!a) { if (attempts.size >= 10000) return deny(res, 503, '服务繁忙'); a = { count: 0, until: now() + 60000 }; attempts.set(ip, a); }
      if (++a.count > 5) return deny(res, 429, '尝试次数过多，请一分钟后重试');
      if (!req.is('application/json')) return deny(res, 415, '请使用 JSON 请求');
      if (typeof req.body?.key !== 'string' || req.body.key.length > 4096 || !timingSafeEqual(digest(req.body.key), expected)) return deny(res, 401, '访问 Key 不正确');
      if (sessions.size >= 1000) return deny(res, 503, '服务繁忙');
      if (id) sessions.delete(id);
      const fresh = randomBytes(32).toString('hex'); sessions.set(fresh, now() + ttl);
      res.setHeader('Set-Cookie', `${cookie}=${fresh}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${Math.floor(ttl / 1000)}${req.secure ? '; Secure' : ''}`);
      return res.json({ authenticated: true });
    }
    if (!authenticated) return deny(res, 401, '请先输入访问 Key');
    if (req.path === '/auth/session' && req.method === 'DELETE') {
      sessions.delete(id); res.setHeader('Set-Cookie', `${cookie}=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0${req.secure ? '; Secure' : ''}`);
      return res.json({ authenticated: false });
    }
    next();
  }
  return middleware;
}
