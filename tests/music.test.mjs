import test from 'node:test';
import assert from 'node:assert/strict';
import { createMusicClient, musicRoute, normalizeSongs, validateMusicConfig } from '../cloudflare/music.mjs';
import { getWeather } from '../cloudflare/context.mjs';
const request = (path = '', cookie = 'user-a') => new Request('https://soundisle.test/api/music' + path, { headers: { Cookie: 'soundisle_session=' + cookie } });
function store() { const map = new Map(); return { map, get: async k => map.get(k), put: async (k,v) => { map.set(k,v); }, delete: async k => map.delete(k) }; }
const song = { mid: 'realMid123', title: '真实歌曲', singer: [{ name: '歌手' }], album: { mid: 'album123', name: '专辑' }, interval: 120 };
test('QQ login tokens stay server side and sessions are isolated per app session', async () => {
  const state = store(); let receivedToken;
  const deps = { handleRequest: async req => {
    if (new URL(req.url).pathname === '/login/qr/check') return Response.json({ code: 803, cookie: 'qqmusic_session=private-qq-token;', data: { token: 'private-qq-token' } });
    receivedToken = req.headers.get('X-QQ-Session'); return Response.json({ code: 200, items: [song] });
  } };
  let client = await createMusicClient(request(), { QQ_SESSION_SECRET: 'test-key' }, state, deps);
  const login = await client.call('/login/qr/check', { key: 'qr-key' });
  assert(!JSON.stringify(login).includes('private-qq-token'));
  client = await createMusicClient(request(), {}, state, deps); assert.equal((await client.search('歌曲'))[0].mid, song.mid); assert.equal(receivedToken, 'private-qq-token');
  const other = await createMusicClient(request('', 'user-b'), {}, state, deps); await other.search('歌曲'); assert.equal(receivedToken, null);
  await client.call('/logout'); client = await createMusicClient(request(), {}, state, deps); await client.search('歌曲'); assert.equal(receivedToken, null);
});
test('music config rejects credentials, redirects and private production gateways', async () => {
  for (const url of ['http://service.test', 'https://user:pass@service.test', 'https://127.0.0.1', 'https://192.168.0.1', 'https://service.test?token=secret']) assert.throws(() => validateMusicConfig({ mode: 'gateway', url }));
  assert.equal(validateMusicConfig({ mode: 'gateway', url: 'http://localhost:3200' }, true).url, 'http://localhost:3200');
  const state = store(); await state.put('music:config', { mode: 'gateway', url: 'https://gateway.test' });
  const client = await createMusicClient(request(), {}, state, { fetch: async req => { assert.equal(req.redirect, 'manual'); return new Response(null, { status: 302 }); } });
  await assert.rejects(client.search('歌'), /暂时不可用/);
  await assert.rejects(client.call('/user/playlist/delete'), /不可用/);
});
test('normalizes actual catalog and playlist shapes, drops malformed IDs and duplicates', () => {
  const result = normalizeSongs({ songs: [song, song, { mid: '../invalid', title: 'bad' }] });
  assert.equal(result.length, 1); assert.equal(result[0].artist, '歌手'); assert.equal(result[0].duration, 120);
  assert.equal(normalizeSongs({ response: { cdlist: [{ songlist: [song] }] } }).length, 1);
});
test('music endpoints restrict methods and discard query credentials', async () => {
  let credential;
  const state = store();
  const response = await musicRoute(request('/search?keyword=歌&cookie=stolen'), {}, state, { handleRequest: async req => { credential = new URL(req.url).searchParams.get('cookie'); return Response.json({ code: 200, items: [song] }); } });
  assert.equal(response.status, 200); assert.equal(credential, null); assert.equal((await response.json()).songs.length, 1);
  const invalid = await musicRoute(new Request('https://app.test/api/music/config', { method: 'DELETE', headers: { Cookie: 'soundisle_session=test' } }), {}, state); assert.equal(invalid.status, 405);
});
test('weather uses explicit city and real provider readings, and handles missing data', async () => {
  assert.equal((await getWeather('')).available, false);
  const result = await getWeather('test-city', async url => url.includes('geocoding') ? Response.json({ results: [{ name: '测试市', latitude: 31, longitude: 121 }] }) : Response.json({ current: { temperature_2m: 19, weather_code: 61, time: '2026-11-03T16:00' } }));
  assert.equal(result.summary, '测试市 · 雨 19°C'); assert.equal(result.available, true);
  const failed = await getWeather('unknown-test-city', async () => { throw Error('offline'); }); assert.equal(failed.available, false);
});
