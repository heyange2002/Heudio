import test from 'node:test';
import assert from 'node:assert/strict';
import { securePlayback, streamPlayback, issuePlayback } from '../cloudflare/playback.mjs';
import { musicRoute } from '../cloudflare/music.mjs';
const signed = 'http://dl.stream.qqmusic.qq.com/M500real123.mp3?vkey=synthetic-only&uin=123';
const data = { data: { playUrl: { real123: { url: signed } } } };
const audio = () => new Response('a', { status: 206, headers: { 'Content-Type': 'audio/mpeg', 'Content-Range': 'bytes 0-0/3000' } });
test('certificate failure switches to a verified official HTTPS CDN and preserves the signed resource', async () => {
  const requests = [];
  const result = await securePlayback(data, async (url, options) => {
    const target = new URL(url); requests.push(target);
    assert.equal(target.protocol, 'https:'); assert.equal(target.search, new URL(signed).search);
    assert.equal(options.redirect, 'manual'); assert.equal(options.headers.Range, 'bytes=0-0');
    if (target.hostname === 'dl.stream.qqmusic.qq.com') throw Object.assign(Error('TLS'), { cause: { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' } });
    return audio();
  });
  assert.equal(new URL(result.data.playUrl.real123.url).hostname, 'aqqmusic.tc.qq.com');
  assert.equal(result.data.playUrl.real123.httpsVerified, true);
  assert.equal(data.data.playUrl.real123.url, signed); assert.equal(requests.length, 2);
});
test('keeps working HTTPS URLs and rejects invalid responses, downgrades and external redirects', async () => {
  const working = await securePlayback(data, async () => audio());
  assert.equal(new URL(working.data.playUrl.real123.url).hostname, 'dl.stream.qqmusic.qq.com');
  for (const response of [() => Response.json({ error: 'not audio' }), () => new Response('html', { status: 200 }), () => new Response(null, { status: 302, headers: { Location: 'https://untrusted.test/song.mp3' } }), () => new Response(null, { status: 302, headers: { Location: signed } })]) {
    let calls = 0;
    await assert.rejects(securePlayback(data, async () => { calls++; return response(); }), /HTTPS/);
    assert.equal(calls, 2);
  }
  await assert.rejects(securePlayback({ data: { playUrl: { x: { url: 'https://evil.test/song.mp3' } } } }), /格式无效/);
});
test('playback route validates HTTPS media before returning a link; credentials stay server side', async () => {
  const map = new Map(); const store = { get: async k => map.get(k), put: async (k,v) => map.set(k,v), delete: async k => map.delete(k) };
  const request = new Request('https://app.test/api/music/getMusicPlay/real123', { headers: { Cookie: 'soundisle_session=test' } });
  const response = await musicRoute(request, {}, store, { handleRequest: async () => Response.json(data), fetch: async () => audio() });
  assert.equal(response.status, 200); const result = await response.json(); assert.match(result.data.playUrl.real123.url, /^\/api\/music\/stream\/[a-f0-9]{48}$/); assert(!JSON.stringify(result).includes('synthetic-only'));
});

test('same-origin media relay preserves ranges, isolates sessions and never sends app cookies upstream', async () => {
  const map = new Map(), store = { get: async k => map.get(k), put: async (k,v) => map.set(k,v), delete: async k => map.delete(k) };
  const headers = { Cookie: 'soundisle_session=owner' }, request = new Request('https://app.test/api/music/getMusicPlay/real123', { headers });
  const issued = await issuePlayback(data, request, store, async () => audio());
  const path = issued.data.playUrl.real123.url;
  assert(!JSON.stringify(issued).includes('vkey'));
  let fetched = false;
  const response = await streamPlayback(new Request('https://app.test' + path, { headers: { ...headers, Range: 'bytes=10-19' } }), store, async (url, options) => {
    fetched = true; assert.equal(new URL(url).protocol, 'https:');
    assert.equal(options.headers.Range, 'bytes=10-19'); assert.equal(options.headers.Cookie, undefined);
    return new Response('0123456789', { status: 206, headers: { 'Content-Type': 'audio/mpeg', 'Content-Range': 'bytes 10-19/3000', 'Content-Length': '10' } });
  });
  assert(fetched); assert.equal(response.status, 206); assert.equal(response.headers.get('Content-Range'), 'bytes 10-19/3000'); assert.equal(await response.text(), '0123456789');
  const wrong = await streamPlayback(new Request('https://app.test'+path, { headers: { Cookie: 'soundisle_session=other' } }), store, async () => { throw Error('must not fetch'); }); assert.equal(wrong.status, 403);
  const multiple = await streamPlayback(new Request('https://app.test'+path, { headers: { ...headers, Range: 'bytes=0-1,5-6' } }), store); assert.equal(multiple.status, 416);
  const record = map.values().next().value; record.expires = 0;
  const expired = await streamPlayback(new Request('https://app.test'+path, { headers }), store); assert.equal(expired.status, 410);
});
