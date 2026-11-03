import test from 'node:test';
import assert from 'node:assert/strict';
import { SpeechPlayer } from '../src/utils/speechPlayer';
import { DEFAULT_SPEECH } from '../shared/speech.mjs';

const settings = { voiceModel: DEFAULT_SPEECH.model, voiceId: DEFAULT_SPEECH.voiceId, voiceSpeed: DEFAULT_SPEECH.speed };
function harness(request = async (_path: string, _options: RequestInit) => new Response('mp3', { headers: { 'Content-Type': 'audio/mpeg' } })) {
  const states: any[] = [], revoked: string[] = [], audios: any[] = [];
  let plays = 0, calls = 0, blocked = false;
  const player = new SpeechPlayer(state => states.push(state), {
    request: async (path, options = {}) => { calls++; return request(path, options); },
    createUrl: () => 'blob:test-' + audios.length,
    revokeUrl: url => revoked.push(url),
    createAudio: () => {
      const audio = { onended: null, onerror: null, paused: false, play: async () => { plays++; if (blocked) { const err = new Error('blocked'); err.name = 'NotAllowedError'; throw err; } }, pause() { this.paused = true; }, removeAttribute() {}, load() {} };
      audios.push(audio); return audio as unknown as HTMLAudioElement;
    },
  });
  return { player, states, revoked, audios, calls: () => calls, plays: () => plays, block: (value: boolean) => { blocked = value; } };
}
test('speech playback stops, releases audio resources and ignores stale responses', async () => {
  let complete: (response: Response) => void;
  let signal: AbortSignal;
  const h = harness(async (_path, options) => { signal = options.signal!; return new Promise(resolve => { complete = resolve; }); });
  const pending = h.player.speak('旧消息', settings);
  assert.equal(h.player.state.status, 'loading'); h.player.stop(); assert(signal!.aborted);
  complete!(new Response('old', { headers: { 'Content-Type': 'audio/mpeg' } })); await pending;
  assert.equal(h.audios.length, 0); assert.equal(h.player.state.status, 'idle');
  const next = harness(); await next.player.speak('新消息', settings); assert.equal(next.player.state.status, 'playing');
  next.audios[0].onended(); assert.equal(next.player.state.status, 'idle'); assert.equal(next.audios[0].paused, true); assert.equal(next.revoked.length, 1);
});
test('autoplay restrictions preserve generated audio for an explicit click without paying twice', async () => {
  const h = harness(); h.block(true); await h.player.speak('你好', settings);
  assert.equal(h.player.state.status, 'ready'); assert.equal(h.calls(), 1);
  h.block(false); await h.player.resume(); assert.equal(h.player.state.status, 'playing'); assert.equal(h.calls(), 1); assert.equal(h.plays(), 2);
  h.player.stop(); assert.equal(h.revoked.length, 1);
});
test('speech failures are visible and never invoke system speech', async () => {
  const h = harness(async () => Response.json({ error: '尚未配置 MiniMax' }, { status: 503 }));
  await h.player.speak('你好', settings);
  assert.equal(h.player.state.status, 'error'); assert.equal(h.player.state.error, '尚未配置 MiniMax'); assert.equal(h.audios.length, 0);
});
