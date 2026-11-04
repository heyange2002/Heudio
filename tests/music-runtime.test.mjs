import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

test('real Workers runtime bundles QQ API and persists music settings with protected sessions', async () => {
  const bundle = await build({ entryPoints: ['cloudflare/worker.mjs'], bundle: true, format: 'esm', platform: 'browser', external: ['node:*'], write: false });
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, compatibilityDate: '2026-11-03', compatibilityFlags: ['nodejs_compat'], script: bundle.outputFiles[0].text,
    bindings: { APP_ACCESS_KEY: '0648' },
    durableObjects: { AUTH: { className: 'AuthStore', useSQLite: true }, MUSIC: { className: 'MusicStore', useSQLite: true } },
  }));
  try {
    const base = 'https://soundisle.test';
    const headers = { 'X-Soundisle-Client': 'web', 'Content-Type': 'application/json' };
    let response = await mf.dispatchFetch(base + '/api/music/config', { headers }); assert.equal(response.status, 401);
    response = await mf.dispatchFetch(base + '/api/auth/session', { method: 'POST', headers, body: JSON.stringify({ key: '0648' }) });
    assert.equal(response.status, 200); headers.Cookie = response.headers.get('Set-Cookie').split(';')[0];
    response = await mf.dispatchFetch(base + '/api/voice/transcribe', { method: 'POST', headers: { ...headers, 'Content-Type': 'audio/wav' }, body: new Uint8Array(20) }); assert.equal(response.status, 503);
    response = await mf.dispatchFetch(base + '/api/music/stream/' + 'a'.repeat(48), { headers: { Cookie: headers.Cookie, 'Sec-Fetch-Site': 'same-origin' } }); assert.equal(response.status, 410);
    response = await mf.dispatchFetch(base + '/api/music/stream/' + 'a'.repeat(48), { headers: { Cookie: headers.Cookie, 'Sec-Fetch-Site': 'cross-site' } }); assert.equal(response.status, 403);
    response = await mf.dispatchFetch(base + '/api/music/config', { headers }); const config = await response.json();
    assert.equal(config.configured, true); assert.equal(config.mode, 'embedded'); assert(!JSON.stringify(config).includes('secret'));
    response = await mf.dispatchFetch(base + '/api/music/login/channels', { headers }); const capabilities = await response.json();
    assert.equal(response.status, 200); assert(capabilities.data.channels.includes('qq')); assert(capabilities.data.channels.includes('wechat'));
    response = await mf.dispatchFetch(base + '/api/music/login/status', { headers }); assert.equal(response.status, 200); assert.deepEqual((await response.json()).data, {});
    response = await mf.dispatchFetch(base + '/api/music/config', { method: 'PUT', headers, body: JSON.stringify({ mode: 'gateway', url: 'https://example.com' }) }); assert.equal(response.status, 200);
    response = await mf.dispatchFetch(base + '/api/music/config', { headers }); assert.equal((await response.json()).url, 'https://example.com');
    response = await mf.dispatchFetch(base + '/api/context/weather', { headers }); assert.equal((await response.json()).available, false);
  } finally { await mf.dispose(); }
});
