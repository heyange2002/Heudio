import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import App from '../src/App';
import { DEFAULT_AGENT_PROMPT } from '../shared/agent-policy.mjs';

test('playlist action plays real songs and MiniMax speech, persists the Agent prompt and never starts synthetic music', async () => {
  const page = new JSDOM('<div id="root"></div>', { url: 'https://soundisle.test' });
  Object.assign(globalThis, { window: page.window, document: page.window.document, location: page.window.location, localStorage: page.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
  page.window.scrollTo = () => {};
  page.window.matchMedia = () => ({ matches: true }) as any;
  page.window.HTMLElement.prototype.scrollTo = () => {};
  page.window.HTMLElement.prototype.scrollIntoView = () => {};
  page.window.HTMLCanvasElement.prototype.getContext = () => null;
  let expectedPrompt='只推荐轻柔的粤语爵士，简短温暖地交流。';
  localStorage.setItem('soundisle:agent-prompt',JSON.stringify(expectedPrompt));
  const oldFetch = globalThis.fetch, oldAudio = globalThis.Audio;
  const oldCreate = URL.createObjectURL, oldRevoke = URL.revokeObjectURL;
  const steps: string[] = []; let finishModel!: (response: Response) => void;
  const audios: any[] = [];
  let voiceText = '';
  globalThis.Audio = class {
    volume = 1; currentTime = 0; onended = null; onerror = null; ontimeupdate = null;
    constructor(public src: string) { audios.push(this); }
    play = async () => { steps.push(this.src.startsWith('blob:') ? 'speech:play' : 'music:play'); };
    pause() {} removeAttribute() {} load() {}
  } as any;
  URL.createObjectURL = () => 'blob:reply'; URL.revokeObjectURL = () => {};
  globalThis.fetch = async (url, options) => {
    const path = String(url);
    if (path === '/api/agent/chat') { steps.push('model:start'); const payload = JSON.parse(options!.body as string); assert.equal(payload.musicSource, 'qq-music'); assert.equal(payload.intent,'playlist'); assert.equal(payload.agentPrompt,expectedPrompt); return new Promise(resolve => { finishModel = resolve; }); }
    if (path === '/api/voice/synthesize') { steps.push('speech:start'); voiceText = JSON.parse(options!.body as string).text; return new Response('mp3', { headers: { 'Content-Type': 'audio/mpeg' } }); }
    if (path.startsWith('/api/music/getMusicPlay/')) {
      const mid = path.split('/').pop()!.split('?')[0]; steps.push('music:request:' + mid);
      return Response.json({data:{playUrl:{[mid]:{url:'/api/music/stream/' + (mid === 'song123' ? 'a' : 'b').repeat(48)}}}});
    }
    if (path === '/api/music/config') return Response.json({ mode: 'embedded', url: '', configured: true });
    if (path === '/api/music/login/channels') return Response.json({ data: { channels: ['qq','wechat'] } });
    return Response.json({ data: {}, summary: '未设置城市，天气未知' });
  };
  const root = createRoot(document.getElementById('root')!);
  try {
    await act(async () => root.render(<App/>));
    const play=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='播放')!;
    await act(async()=>play.dispatchEvent(new page.window.MouseEvent('click',{bubbles:true})));
    assert.equal(audios.length,0);assert(document.body.textContent?.includes('请先让阿屿选歌'));
    const main = document.querySelector('main')!;
    assert.equal(main.querySelector('section[aria-label="QQ 音乐"]'),null);
    const sidebar=document.querySelector('aside[aria-label="音乐侧栏"]') as HTMLElement;
    assert(sidebar.hidden);
    assert.equal(main.querySelector('select[aria-label="QQ 音乐连接方式"]'), null);
    assert.equal(main.querySelector('input[placeholder="用于获取真实天气"]'), null);
    assert(!main.textContent?.includes('认识彼此'));
    const settings = [...document.querySelectorAll('button')].find(b => b.textContent === '设置')!;
    await act(async () => settings.dispatchEvent(new page.window.MouseEvent('click', { bubbles: true })));
    const dialog = document.querySelector('[role="dialog"]')!;
    assert(dialog.querySelector('select[aria-label="QQ 音乐连接方式"]'));
    assert(dialog.textContent?.includes('获取授权二维码'));
    assert.equal(main.querySelector('select[aria-label="QQ 音乐连接方式"]'), null);
    const personal = [...dialog.querySelectorAll('[role="tab"]')].find(b => b.textContent === '个人设置')!;
    await act(async () => personal.dispatchEvent(new page.window.MouseEvent('click', { bubbles: true })));
    const state = dialog.querySelector('select')!;
    await act(async () => { state.value = '工作专注中'; state.dispatchEvent(new page.window.Event('change', { bubbles: true })); });
    assert.equal(JSON.parse(localStorage.getItem('soundisle:profile')!).workState, '工作专注中');
    const agentTab=[...dialog.querySelectorAll('[role="tab"]')].find(b=>b.textContent==='Agent 设置')!;
    await act(async()=>agentTab.dispatchEvent(new page.window.MouseEvent('click',{bubbles:true})));
    assert.equal(dialog.querySelector<HTMLTextAreaElement>('textarea[aria-label="Agent 提示词"]')?.value,expectedPrompt);
    const close = dialog.querySelector('button[aria-label="关闭设置"]')!;
    await act(async () => close.dispatchEvent(new page.window.MouseEvent('click', { bubbles: true })));
    assert.equal(document.querySelector('[role="dialog"]'), null);
    const expandMusic=document.querySelector('button[aria-label="展开音乐侧栏"]')!;
    await act(async()=>expandMusic.dispatchEvent(new page.window.MouseEvent('click',{bubbles:true})));
    assert(!sidebar.hidden);
    const recommend = [...document.querySelectorAll('button')].find(b => b.textContent === '让阿屿为此刻编排')!;
    await act(async () => recommend.dispatchEvent(new page.window.MouseEvent('click', { bubbles: true })));
    assert(sidebar.hidden);
    assert.deepEqual(steps, ['model:start']); assert.equal(voiceText, '');
    const reply = '忙了一天，先陪你慢下来。这几首歌，留给此刻的你。';
    await act(async () => {
      steps.push('model:done'); finishModel(Response.json({ reply, recommendedSceneId: 'rest', rationale: '适合放松', suggestedFollowUps: ['换一首试试'], mode: 'model', playlist: { title: '此刻慢下来', songs: [{ mid: 'song123', title: '真的歌曲', artist: '歌手', duration: 180, album: '专辑', coverUrl: '' },{ mid: 'song456', title: '下一首歌', artist: '歌手', duration: 180, album: '专辑', coverUrl: '' }] } }));
    });
    assert.deepEqual(steps.slice(0,2), ['model:start','model:done']);
    for (const step of ['music:request:song123','music:play']) assert(steps.includes(step));
    assert(steps.includes('speech:start'));assert(steps.includes('speech:play'));assert.equal(voiceText,reply);
    assert(document.body.textContent?.includes('此刻慢下来'));
    assert(document.body.textContent?.includes('真的歌曲'));
    assert(!document.body.textContent?.includes('编排思路'));
    assert(!document.body.textContent?.includes('换一首试试'));
    const speakReply=()=>[...document.querySelectorAll('button[aria-label="语音朗读陪伴"]')].at(-1)!;
    const firstMusic = audios.find(a=>!a.src.startsWith('blob:'));
    assert.equal(firstMusic.volume, 0.85 * 0.3);
    // A playlist continues automatically, even while the companion is speaking.
    await act(async()=>firstMusic.onended());
    const secondMusic = audios.filter(a=>!a.src.startsWith('blob:')).at(-1);
    assert(steps.includes('music:request:song456')); assert.equal(secondMusic.volume, 0.85 * 0.3);
    await act(async()=>audios.find(a=>a.src.startsWith('blob:')).onended());
    assert.equal(secondMusic.volume, 0.85);
    await act(async()=>speakReply().dispatchEvent(new page.window.MouseEvent('click',{bubbles:true})));
    assert.equal(secondMusic.volume, 0.85 * 0.3);
    await act(async()=>audios.at(-1).onerror()); assert.equal(secondMusic.volume, 0.85);
    await act(async()=>speakReply().dispatchEvent(new page.window.MouseEvent('click',{bubbles:true})));
    assert.equal(secondMusic.volume, 0.85 * 0.3);
    const stop=document.querySelector('button[aria-label="停止朗读"]')!;
    await act(async()=>stop.dispatchEvent(new page.window.MouseEvent('click',{bubbles:true})));
    assert.equal(secondMusic.volume, 0.85);
    await act(async()=>settings.dispatchEvent(new page.window.MouseEvent('click',{bubbles:true})));
    const reset=[...document.querySelectorAll('button')].find(b=>b.textContent==='恢复默认提示词')!;
    await act(async()=>reset.dispatchEvent(new page.window.MouseEvent('click',{bubbles:true})));
    expectedPrompt=DEFAULT_AGENT_PROMPT;assert.equal(JSON.parse(localStorage.getItem('soundisle:agent-prompt')!),DEFAULT_AGENT_PROMPT);
    await act(async()=>document.querySelector('button[aria-label="关闭设置"]')!.dispatchEvent(new page.window.MouseEvent('click',{bubbles:true})));
    // A single-song recommendation also starts without another play click.
    await act(async()=>recommend.dispatchEvent(new page.window.MouseEvent('click',{bubbles:true})));
    await act(async()=>finishModel(Response.json({reply:'听听这首。',recommendedSceneId:'rest',mode:'model',playlist:{title:'送你一首歌',songs:[{mid:'single',title:'一首歌',artist:'歌手',duration:180,album:'',coverUrl:''}]}})));
    assert(steps.includes('music:request:single'));
    assert.equal(document.querySelector('section[aria-label="播放队列"] button[aria-current="true"]')?.getAttribute('aria-label'),'播放 一首歌 · 歌手');
    const synthesisCount=steps.filter(s=>s==='speech:start').length;
    await act(async()=>recommend.dispatchEvent(new page.window.MouseEvent('click',{bubbles:true})));
    await act(async()=>finishModel(Response.json({reply:'假装编好了',mode:'model'})));
    assert(document.body.textContent?.includes('这次没有找到合适的歌曲'));
    assert.equal(steps.filter(s=>s==='speech:start').length,synthesisCount+1);
    assert.match(voiceText,/这次没有找到合适的歌曲/);
    assert(!document.body.textContent?.includes('假装编好了'));
    assert.equal(document.querySelector('section[aria-label="播放队列"] button[aria-current="true"]')?.getAttribute('aria-label'),'播放 一首歌 · 歌手');
  } finally {
    await act(async () => root.unmount()); page.window.close();
    globalThis.fetch = oldFetch; globalThis.Audio = oldAudio; URL.createObjectURL = oldCreate; URL.revokeObjectURL = oldRevoke;
  }
});
