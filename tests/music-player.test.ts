import test from 'node:test';
import assert from 'node:assert/strict';
import { audioEngine, SoundIsleAudioEngine } from '../src/utils/audioEngine';
import { qqTrack } from '../src/utils/music';

test('QQ playback uses actual audio, supports seeking and voice ducking, and surfaces unavailable tracks', async () => {
  Object.assign(globalThis, { location: new URL('https://app.test/'), window: { dispatchEvent() {} } });
  const oldFetch = globalThis.fetch, oldAudio = globalThis.Audio;
  const audios: any[] = [], started: string[] = [], errors: string[] = [];
  let complete!: (response: Response) => void;
  globalThis.Audio = class { volume = 1; currentTime = 0; paused = false; onended = null; onerror = null; ontimeupdate = null; constructor(public src: string) { audios.push(this); } play = async () => {}; pause() { this.paused = true; } removeAttribute() {} load() {} } as any;
  globalThis.fetch = async () => new Promise(resolve => { complete = resolve; });
  const song = qqTrack({ mid: 'real123', title: '真实歌曲', artist: '歌手', duration: 120, album: '专辑', coverUrl: '' }, 'rest');
  audioEngine.onStarted(track => started.push(track.id)); audioEngine.onError(message => errors.push(message));
  try {
    audioEngine.playTrack(song); audioEngine.pause();
    complete(Response.json({ data: { playUrl: { real123: { url: 'https://app.test/api/music/stream/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } } } }));
    await new Promise(resolve => setImmediate(resolve)); assert.equal(audios.length, 0);
    audioEngine.playTrack(song, 15); complete(Response.json({ data: { playUrl: { real123: { url: 'https://app.test/api/music/stream/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' } } } }));
    await new Promise(resolve => setImmediate(resolve)); assert.equal(audios.length, 1); assert.equal(audios[0].currentTime, 15); assert.equal(started.length, 1);
    await new Promise(resolve => setTimeout(resolve, 700));
    audioEngine.seek(35); assert.equal(audios[0].currentTime, 35);
    audioEngine.setMasterVolume(0.8); audioEngine.setSpeechDucking(true); assert.equal(audios[0].volume, 0.05);
    audioEngine.setInputMuted(true); assert.equal(audios[0].volume, 0);
    audioEngine.setInputMuted(false); assert.equal(audios[0].volume, 0.05);
    audioEngine.setMasterVolume(0.5); assert.equal(audios[0].volume, 0.05);
    audioEngine.setSpeechDucking(false); assert.equal(audios[0].volume, 0.5);
    audioEngine.setMasterVolume(0.02); audioEngine.setSpeechDucking(true); assert.equal(audios[0].volume, 0.02);
    audioEngine.setMasterVolume(0); assert.equal(audios[0].volume, 0);
    audioEngine.setSpeechDucking(false); assert.equal(audios[0].volume, 0);
    audioEngine.setMasterVolume(0.8);
    audioEngine.setSpeechDucking(false); assert.equal(audios[0].volume, 0.8);
    audioEngine.playTrack(song); complete(Response.json({ data: { playUrl: { real123: { url: 'https://sjy6.stream.qqmusic.qq.com/song.mp3?vkey=synthetic' } } } }));
    await new Promise(resolve => setImmediate(resolve)); assert.match(errors.pop()!, /旧版播放链接/); assert.equal(audios.length, 1);
    audioEngine.playTrack(song); complete(Response.json({ data: { playUrl: { real123: { url: '' } } } }));
    await new Promise(resolve => setImmediate(resolve)); assert.match(errors[0], /没有可用/); assert.equal(audioEngine.getIsPlaying(), false);
  } finally { audioEngine.pause(); audioEngine.setInputMuted(false); audioEngine.setSpeechDucking(false); audioEngine.onStarted(() => {}); audioEngine.onError(() => {}); globalThis.fetch = oldFetch; globalThis.Audio = oldAudio; }
});

test('preloaded audio is silent, reused during handoff and discarded on changes; failures fall back to fresh playback', async () => {
  const oldFetch = globalThis.fetch, oldAudio = globalThis.Audio;
  Object.assign(globalThis, { location: new URL('https://app.test/'), window: { dispatchEvent() {} } });
  const audios: any[] = [], requests: string[] = [], errors: string[] = [];
  let fail = false, pending: ((response: Response) => void) | undefined;
  globalThis.Audio = class {
    volume = 1; currentTime = 0; plays = 0; loads = 0; preload = ''; error = null;
    constructor(public src: string) { audios.push(this); }
    play = async () => { this.plays++; }; pause() {} load() { this.loads++; } removeAttribute() { this.src = ''; }
  } as any;
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    if (fail) return Response.json({ error: '暂时失败' }, { status: 502 });
    if (pending) return new Promise(resolve => { pending = resolve; });
    const mid = String(url).split('/').pop()!.split('?')[0];
    return Response.json({ data: { playUrl: { [mid]: { url: '/api/music/stream/' + 'a'.repeat(48) } } } });
  };
  const engine = new SoundIsleAudioEngine(); engine.onError(message => errors.push(message));
  const song = (mid: string) => qqTrack({ mid, title: mid, artist: '', album: '', duration: 120, coverUrl: '' }, 'rest');
  const tick = () => new Promise(resolve => setImmediate(resolve));
  try {
    engine.playTrack(song('first')); await tick();
    engine.preloadTrack(song('second')); engine.preloadTrack(song('second')); await tick();
    assert.equal(requests.length, 2); assert.equal(audios[1].preload, 'auto');
    assert.equal(audios[1].plays, 0); assert.equal(audios[1].loads, 1);
    engine.playTrack(song('second')); await tick();
    assert.equal(audios.length, 2); assert.equal(requests.length, 2); assert.equal(audios[1].plays, 1);
    engine.preloadTrack(song('unused')); await tick();
    engine.preloadTrack(song('replacement')); await tick();
    assert.equal(audios[2].src, ''); assert.equal(audios[3].plays, 0);
    engine.clearPreload(); assert.equal(audios[3].src, '');
    fail = true; engine.preloadTrack(song('retry')); await tick();
    assert.deepEqual(errors, []); assert.equal(engine.getIsPlaying(), true);
    fail = false; engine.playTrack(song('retry')); await tick();
    assert.equal(audios.at(-1).plays, 1); assert.deepEqual(errors, []);
    // Late preload responses cannot create orphaned audio after cancellation.
    pending = () => {}; engine.preloadTrack(song('late')); await tick();
    const count = audios.length; engine.clearPreload();
    pending!(Response.json({ data: { playUrl: { late: { url: '/api/music/stream/' + 'b'.repeat(48) } } } }));
    await tick(); assert.equal(audios.length, count);
  } finally { engine.pause(); engine.clearPreload(); globalThis.fetch = oldFetch; globalThis.Audio = oldAudio; }
});

test('a smooth handoff fades at the current volume and pause cancels a pending transition', async () => {
  Object.assign(globalThis, { location: new URL('https://app.test/'), window: { dispatchEvent() {} } });
  const oldFetch = globalThis.fetch, oldAudio = globalThis.Audio;
  const audios: any[] = [];
  globalThis.Audio = class {
    volume = 1; currentTime = 0; paused = false; onended = null; onerror = null; ontimeupdate = null;
    constructor(public src: string) { audios.push(this); }
    play = async () => {}; pause() { this.paused = true; } removeAttribute() {} load() {}
  } as any;
  globalThis.fetch = async () => Response.json({data:{playUrl:{first:{url:'/api/music/stream/'+'a'.repeat(48)},second:{url:'/api/music/stream/'+'b'.repeat(48)}}}});
  const engine = new SoundIsleAudioEngine(), started: string[] = [];
  engine.onStarted(t => started.push(t.qqMid!));
  const song = (mid:string) => qqTrack({mid,title:mid,artist:'歌手',album:'',coverUrl:'',duration:120},'rest');
  const tick = () => new Promise(resolve=>setImmediate(resolve));
  try {
    engine.setMasterVolume(0.4); engine.playTrack(song('first')); await tick();
    const pending = engine.transitionToTrack(song('second'), 100);
    await new Promise(resolve=>setTimeout(resolve,45));
    assert(audios[0].volume < 0.4); engine.pause(); await pending;
    assert.deepEqual(started,['first']); assert.equal(engine.getIsPlaying(),false);
    engine.playTrack(song('first')); await tick();
    await engine.transitionToTrack(song('second'), 40); await tick();
    assert.equal(started.at(-1),'second');
    await new Promise(resolve => setTimeout(resolve, 700)); assert.equal(audios.at(-1).volume,0.4);
  } finally {engine.pause();engine.clearPreload();globalThis.fetch=oldFetch;globalThis.Audio=oldAudio;}
});

test('play and pause fade smoothly at the selected volume; rapid resume cancels the old pause', async () => {
  Object.assign(globalThis, { location: new URL('https://app.test/'), window: { dispatchEvent() {} } });
  const oldFetch = globalThis.fetch, oldAudio = globalThis.Audio, audios: any[] = [];
  globalThis.Audio = class {
    volume = 1; currentTime = 24.5; paused = false; onended = null; onerror = null; ontimeupdate = null;
    constructor(public src: string) { audios.push(this); }
    play = async () => { this.paused = false; }; pause() { this.paused = true; } removeAttribute() {} load() {}
  } as any;
  globalThis.fetch = async () => Response.json({ data: { playUrl: { real: { url: '/api/music/stream/' + 'a'.repeat(48) } } } });
  const engine = new SoundIsleAudioEngine(), song = qqTrack({ mid: 'real', title: '真实歌曲', artist: '', album: '', duration: 120, coverUrl: '' }, 'rest');
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  try {
    engine.setMasterVolume(.4); engine.playTrack(song, 24.5);
    await new Promise(resolve => setImmediate(resolve));
    const audio = audios[0]; assert.equal(audio.volume, 0);
    await wait(220); assert(audio.volume > 0 && audio.volume < .4);
    await wait(500); assert.equal(audio.volume, .4);
    engine.pause(650); assert.equal(audio.paused, false); assert.equal(engine.getIsPlaying(), false);
    await wait(220); assert(audio.volume > 0 && audio.volume < .4);
    await wait(500); assert.equal(audio.paused, true); assert.equal(audio.volume, 0);
    assert.equal(engine.getElapsedSeconds(), 24.5);
    engine.resume(); await wait(720);
    const resumed = audios.at(-1); assert.equal(resumed.volume, .4);
    engine.pause(650); await wait(150); engine.resume();
    await wait(720); const latest = audios.at(-1);
    assert.notEqual(latest, resumed); assert.equal(latest.paused, false); assert.equal(latest.volume, .4);
    engine.setSpeechDucking(true); assert.equal(latest.volume, .05);
    engine.pause(650); await wait(150); assert(latest.volume < .05);
    engine.setInputMuted(true); assert.equal(latest.volume, 0);
  } finally { engine.pause(); globalThis.fetch = oldFetch; globalThis.Audio = oldAudio; }
});
