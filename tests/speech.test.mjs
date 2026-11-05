import test from 'node:test';
import assert from 'node:assert/strict';
import { synthesizeSpeech, speechConfig } from '../cloudflare/speech.mjs';
import worker from '../cloudflare/worker.mjs';
import { DEFAULT_SPEECH } from '../shared/speech.mjs';

test('MiniMax receives server credentials and validated options; frontend receives MP3 bytes only', async () => {
  const response = await synthesizeSpeech({ text: '放松一下。', ...DEFAULT_SPEECH }, { MINIMAX_API_KEY: 'test-only-secret' }, async (url, options) => {
    assert.equal(url, 'https://api.minimax.cn/v1/t2a_v2');
    assert.equal(options.headers.Authorization, 'Bearer test-only-secret');
    assert.equal(options.redirect, 'manual');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'speech-2.8-hd');
    assert.equal(body.voice_setting.voice_id, DEFAULT_SPEECH.voiceId);
    assert.equal(body.voice_setting.speed, 0.95);
    assert.equal(body.voice_setting.vol, 5);
    assert.equal(body.output_format, 'hex');
    assert.equal(body.stream, false);
    return Response.json({ base_resp: { status_code: 0 }, data: { audio: '494433fffb' } });
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'audio/mpeg');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [73, 68, 51, 255, 251]);
  assert(!JSON.stringify(speechConfig({ MINIMAX_API_KEY: 'test-only-secret' })).includes('test-only-secret'));
});

test('missing configuration and invalid or overlong inputs never call the paid API', async () => {
  const noFetch = () => { throw Error('must not call upstream'); };
  assert.equal((await synthesizeSpeech({ text: '你好' }, {}, noFetch)).status, 503);
  for (const body of [null, {}, { text: '' }, { text: 'x'.repeat(1501) }, { text: '你好', model: 'other' }, { text: '你好', voiceId: 'unknown' }, { text: '你好', speed: 100 }, { text: '你好', speed: '1' }]) {
    assert.equal((await synthesizeSpeech(body, { MINIMAX_API_KEY: 'test-only' }, noFetch)).status, 400);
  }
});

test('upstream HTTP/business/invalid-audio failures return safe errors', async () => {
  for (const response of [new Response('secret upstream detail', { status: 401 }), Response.json({ base_resp: { status_code: 1008, status_msg: 'secret upstream detail' } }), Response.json({ base_resp: { status_code: 0 }, data: { audio: 'https://untrusted.test' } }), Response.json({ base_resp: { status_code: 0 }, data: { audio: 'abc' } }), new Response('not JSON')]) {
    const result = await synthesizeSpeech({ text: '你好' }, { MINIMAX_API_KEY: 'test-only' }, async () => response);
    assert.equal(result.status, 502);
    assert(!(await result.text()).includes('secret upstream detail'));
  }
  assert.equal((await synthesizeSpeech({ text: '你好' }, { MINIMAX_API_KEY: 'test-only' }, async () => new Response('', { status: 429 }))).status, 429);
});

test('client cancellation reaches the MiniMax request', async () => {
  const controller = new AbortController();
  const pending = synthesizeSpeech({ text: '你好' }, { MINIMAX_API_KEY: 'test-only' }, async (_url, options) => {
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(Error('aborted')), { once: true }));
  }, controller.signal);
  controller.abort();
  assert.equal((await pending).status, 504);
});

test('upstream redirects are rejected without forwarding the provider key', async () => {
  let calls = 0;
  const result = await synthesizeSpeech({ text: '你好' }, { MINIMAX_API_KEY: 'test-only' }, async (_url, options) => {
    calls++;
    assert.equal(options.redirect, 'manual');
    return new Response(null, { status: 307, headers: { Location: 'https://untrusted.test/' } });
  });
  assert.equal(calls, 1); assert.equal(result.status, 502); assert.match((await result.json()).error, /重定向/);
});

test('Workers speech endpoints enforce origin and authentication before synthesis', async () => {
  const env = { AUTH: { idFromName: () => 'id', get: () => ({ fetch: async () => Response.json({ authenticated: false }) }) } };
  const request = (path, extra = {}) => new Request('https://soundisle.test' + path, { method: path.endsWith('config') ? 'GET' : 'POST', headers: { 'X-Soundisle-Client': 'web', 'Content-Type': 'application/json', ...extra }, ...(path.endsWith('config') ? {} : { body: JSON.stringify({ text: '你好' }) }) });
  for (const path of ['/api/voice/config', '/api/voice/synthesize']) assert.equal((await worker.fetch(request(path), env)).status, 401);
  assert.equal((await worker.fetch(request('/api/voice/synthesize', { Origin: 'https://evil.test' }), env)).status, 403);
  env.AUTH.get = () => ({ fetch: async () => Response.json({ authenticated: true }) });
  assert.equal((await worker.fetch(request('/api/voice/synthesize'), env)).status, 503);
  const config = await worker.fetch(request('/api/voice/config'), env);
  assert.equal(config.status, 200);
  assert.equal((await config.json()).configured, false);
});
