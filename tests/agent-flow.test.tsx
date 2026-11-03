import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import App from '../src/App';

test('conversation waits for model reply and playlist before synthesizing that exact reply', async () => {
  const page = new JSDOM('<div id="root"></div>', { url: 'https://soundisle.test' });
  Object.assign(globalThis, { window: page.window, document: page.window.document, location: page.window.location, localStorage: page.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
  page.window.scrollTo = () => {};
  page.window.matchMedia = () => ({ matches: true }) as any;
  page.window.HTMLElement.prototype.scrollTo = () => {};
  page.window.HTMLElement.prototype.scrollIntoView = () => {};
  page.window.HTMLCanvasElement.prototype.getContext = () => null;
  const oldFetch = globalThis.fetch, oldAudio = globalThis.Audio;
  const oldCreate = URL.createObjectURL, oldRevoke = URL.revokeObjectURL;
  const steps: string[] = []; let finishModel!: (response: Response) => void;
  let voiceText = '';
  globalThis.Audio = class { onended = null; onerror = null; play = async () => { steps.push('audio:play'); }; pause() {} removeAttribute() {} load() {} } as any;
  URL.createObjectURL = () => 'blob:reply'; URL.revokeObjectURL = () => {};
  globalThis.fetch = async (url, options) => {
    const path = String(url);
    if (path === '/api/agent/chat') { steps.push('model:start'); const payload = JSON.parse(options!.body as string); assert.equal(payload.musicSource, 'qq-music'); return new Promise(resolve => { finishModel = resolve; }); }
    if (path === '/api/voice/synthesize') { steps.push('speech:start'); voiceText = JSON.parse(options!.body as string).text; return new Response('mp3', { headers: { 'Content-Type': 'audio/mpeg' } }); }
    if (path === '/api/music/config') return Response.json({ mode: 'embedded', url: '', configured: true });
    if (path === '/api/music/login/channels') return Response.json({ data: { channels: ['qq','wechat'] } });
    return Response.json({ data: {}, summary: '未设置城市，天气未知' });
  };
  const root = createRoot(document.getElementById('root')!);
  try {
    await act(async () => root.render(<App/>));
    const recommend = [...document.querySelectorAll('button')].find(b => b.textContent === '让阿屿为此刻编排')!;
    await act(async () => recommend.dispatchEvent(new page.window.MouseEvent('click', { bubbles: true })));
    assert.deepEqual(steps, ['model:start']); assert.equal(voiceText, '');
    const reply = '忙了一天，先陪你慢下来。这几首歌，留给此刻的你。';
    await act(async () => {
      steps.push('model:done'); finishModel(Response.json({ reply, recommendedSceneId: 'rest', rationale: '适合放松', suggestedFollowUps: [], mode: 'model', playlist: { title: '此刻慢下来', songs: [{ mid: 'song123', title: '真的歌曲', artist: '歌手', duration: 180, album: '专辑', coverUrl: '' }] } }));
    });
    assert.deepEqual(steps, ['model:start','model:done','speech:start','audio:play']);
    assert.equal(voiceText, reply); assert(document.body.textContent?.includes('此刻慢下来'));
    assert(document.body.textContent?.includes('真的歌曲'));
  } finally {
    await act(async () => root.unmount()); page.window.close();
    globalThis.fetch = oldFetch; globalThis.Audio = oldAudio; URL.createObjectURL = oldCreate; URL.revokeObjectURL = oldRevoke;
  }
});
