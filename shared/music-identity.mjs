import { randomBytes } from 'node:crypto';
export const MUSIC_COOKIE = 'soundisle_music_device';
export const MUSIC_COOKIE_SECONDS = 180 * 86400;
export const cookieValue = (header, name) => (header || '').split(';').map(part => part.trim()).find(part => part.startsWith(name + '='))?.slice(name.length + 1);
export function musicIdentityCookie(header, secure = true) {
  const saved = cookieValue(header, MUSIC_COOKIE);
  // Reuse the old app identity during rollout so an existing QQ grant is retained.
  const legacy = cookieValue(header, 'soundisle_session');
  const identity = /^[a-f0-9]{64}$/.test(saved || '') ? saved : /^[a-f0-9]{64}$/.test(legacy || '') ? legacy : randomBytes(32).toString('hex');
  return `${MUSIC_COOKIE}=${identity}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${MUSIC_COOKIE_SECONDS}${secure ? '; Secure' : ''}`;
}
