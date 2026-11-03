import test from 'node:test';
import assert from 'node:assert/strict';
import { companionChat, companionConfig } from '../cloudflare/companion.mjs';
const body = { message: '下班了，想休息', currentScene: 'focus', chatModel: 'MiniMax-M3' };
const env = { MINIMAX_API_KEY: 'test-server-key' };
const reply = { reply: '陪你放松片刻。', recommendedSceneId: 'rest', sceneTitle: '雨后小憩', rationale: '舒缓音乐适合放松。', suggestedFollowUps: ['轻一点', '加点雨声'] };
const upstream = content => Response.json({ choices: [{ finish_reason: 'stop', message: { content } }] });

test('M3 uses server credentials and returns validated scene JSON', async () => {
  const result = await companionChat(body, env, async (url, options) => {
    assert.equal(url, 'https://api.minimax.cn/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer test-server-key');
    assert.equal(options.redirect, 'manual');
    const payload = JSON.parse(options.body);
    assert.equal(payload.model, 'MiniMax-M3');
    assert.deepEqual(payload.thinking, { type: 'disabled' });
    assert.equal(JSON.parse(payload.messages[1].content).message, body.message);
    return upstream(`<think>private reasoning</think>\n\`\`\`json\n${JSON.stringify({ ...reply, mode: 'spoofed', extra: 'discarded', ambientAdjustments: { rain: 0.3, waves: 10 } })}\n\`\`\``);
  });
  assert.equal(result.mode, 'model'); assert.equal(result.model, 'MiniMax-M3');
  assert.equal(result.reply, reply.reply); assert.equal(result.extra, undefined);
  assert.deepEqual(result.ambientAdjustments, { rain: 0.3 });
  assert.deepEqual(companionConfig(env), { provider: 'minimax', model: 'MiniMax-M3', configured: true });
});

test('missing key and explicit offline choice never call the provider', async () => {
  const fail = () => { throw Error('must not call'); };
  assert.equal((await companionChat(body, {}, fail)).mode, 'local');
  const result = await companionChat({ ...body, chatModel: 'local-heuristic' }, env, fail);
  assert.equal(result.mode, 'local'); assert.equal(result.fallbackReason, undefined);
  assert.equal(companionConfig({ MINIMAX_API_KEY: '  ' }).configured, false);
});

test('provider errors, redirects, incomplete and malformed JSON safely fall back', async () => {
  for (const response of [new Response(null, { status: 401 }), new Response(null, { status: 302 }), upstream('invalid'), upstream(JSON.stringify({ ...reply, suggestedFollowUps: [null] })), Response.json({ choices: [{ finish_reason: 'length', message: { content: JSON.stringify(reply) } }] }), upstream('x'.repeat(70000))]) {
    const result = await companionChat(body, env, async () => response);
    assert.equal(result.mode, 'local'); assert.match(result.fallbackReason, /暂时不可用/);
    assert(!JSON.stringify(result).includes('test-server-key'));
  }
});

test('cancellation reaches upstream fetch and returns a local response', async () => {
  const controller = new AbortController();
  const pending = companionChat(body, env, async (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(Error('aborted')))), controller.signal);
  controller.abort(); assert.equal((await pending).mode, 'local');
});

test('Workers protects model config and chat; offline choice bypasses MiniMax', async () => {
  const { default: worker } = await import('../cloudflare/worker.mjs');
  const bindings = { ...env, AUTH: { idFromName: () => 'auth', get: () => ({ fetch: async () => Response.json({ authenticated: true }) }) } };
  const request = (path, options = {}) => new Request(`https://soundisle.test${path}`, { ...options, headers: { 'X-Soundisle-Client': 'web', 'Content-Type': 'application/json', ...options.headers } });
  let response = await worker.fetch(request('/api/agent/config'), bindings);
  assert.deepEqual(await response.json(), companionConfig(env));
  bindings.AUTH.get = () => ({ fetch: async () => Response.json({ authenticated: false }) });
  response = await worker.fetch(request('/api/agent/config'), bindings); assert.equal(response.status, 401);
  response = await worker.fetch(request('/api/agent/chat', { method: 'POST', body: JSON.stringify(body) }), bindings); assert.equal(response.status, 401);
  bindings.AUTH.get = () => ({ fetch: async () => Response.json({ authenticated: true }) });
  response = await worker.fetch(request('/api/agent/chat', { method: 'POST', body: JSON.stringify({ ...body, chatModel: 'local-heuristic' }) }), bindings);
  assert.equal((await response.json()).mode, 'local');
});

test('persona, history and user context drive real search → validated queue → final reply', async () => {
  const song = { mid: 'real123', title: '安静的歌', artist: '测试歌手' };
  let step = 0;
  const answer = await companionChat({ ...body, profile: { name: '小张', preferences: '喜欢纯音乐', workState: '工作专注中' }, history: [{ role: 'user', content: '不要鼓点' }] }, env, async (_url, options) => {
    const data = JSON.parse(options.body);
    assert.match(data.messages[0].content, /阿屿/);
    assert.equal(data.messages[1].content, '不要鼓点');
    const current = JSON.parse(data.messages[2].content); assert.equal(current.profile.workState, '工作专注中');
    if (step++ === 0) return Response.json({ choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: '', tool_calls: [{ id: 'find', type: 'function', function: { name: 'search_music', arguments: '{"keyword":"安静纯音乐"}' } }] } }] });
    if (step === 2) { assert.equal(JSON.parse(data.messages.at(-1).content).songs[0].mid, song.mid); return Response.json({ choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: '', tool_calls: [{ id: 'queue', type: 'function', function: { name: 'queue_music', arguments: '{"title":"专注时刻","mids":["real123"]}' } }] } }] }); }
    return upstream(JSON.stringify(reply));
  }, undefined, { search: async keyword => { assert.equal(keyword, '安静纯音乐'); return [song]; } });
  assert.equal(step, 3); assert.equal(answer.mode, 'model'); assert.equal(answer.playlist.songs[0].mid, 'real123'); assert.equal(answer.toolTrace.length, 2);
});
test('agent rejects fabricated song IDs and reports tool failure to the model', async () => {
  let step = 0;
  const answer = await companionChat(body, env, async (_url, options) => {
    const data = JSON.parse(options.body);
    if (!step++) return Response.json({ choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: '', tool_calls: [{ id: 'bad', type: 'function', function: { name: 'queue_music', arguments: '{"title":"bad","mids":["invented"]}' } }] } }] });
    assert(JSON.parse(data.messages.at(-1).content).error); return upstream(JSON.stringify(reply));
  }, undefined, {});
  assert.equal(answer.mode, 'model'); assert.equal(answer.playlist, undefined); assert.equal(answer.toolTrace[0].ok, false);
});
