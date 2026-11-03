import test from 'node:test';
import assert from 'node:assert/strict';
import { audioEngine } from '../src/utils/audioEngine';
import { qqTrack } from '../src/utils/music';

test('QQ playback uses actual audio, supports seeking and voice ducking, and surfaces unavailable tracks', async () => {
  Object.assign(globalThis, { location: { protocol: 'https:', hostname: 'app.test' }, window: { dispatchEvent() {} } });
  const oldFetch = globalThis.fetch, oldAudio = globalThis.Audio;
  const audios: any[] = [], started: string[] = [], errors: string[] = [];
  let complete!: (response: Response) => void;
  globalThis.Audio = class { volume = 1; currentTime = 0; paused = false; onended = null; onerror = null; ontimeupdate = null; constructor(public src: string) { audios.push(this); } play = async () => {}; pause() { this.paused = true; } removeAttribute() {} load() {} } as any;
  globalThis.fetch = async () => new Promise(resolve => { complete = resolve; });
  const song = qqTrack({ mid: 'real123', title: '真实歌曲', artist: '歌手', duration: 120, album: '专辑', coverUrl: '' }, 'rest');
  audioEngine.onStarted(track => started.push(track.id)); audioEngine.onError(message => errors.push(message));
  try {
    audioEngine.playTrack(song); audioEngine.pause();
    complete(Response.json({ data: { playUrl: { real123: { url: 'https://music.test/old.mp3' } } } }));
    await new Promise(resolve => setImmediate(resolve)); assert.equal(audios.length, 0);
    audioEngine.playTrack(song, 15); complete(Response.json({ data: { playUrl: { real123: { url: 'https://music.test/song.mp3' } } } }));
    await new Promise(resolve => setImmediate(resolve)); assert.equal(audios.length, 1); assert.equal(audios[0].currentTime, 15); assert.equal(started.length, 1);
    audioEngine.seek(35); assert.equal(audios[0].currentTime, 35);
    audioEngine.setMasterVolume(0.8); audioEngine.setSpeechDucking(true); assert.equal(audios[0].volume, 0.2);
    audioEngine.setSpeechDucking(false); assert.equal(audios[0].volume, 0.8);
    audioEngine.playTrack(song); complete(Response.json({ data: { playUrl: { real123: { url: '' } } } }));
    await new Promise(resolve => setImmediate(resolve)); assert.match(errors[0], /没有可用/); assert.equal(audioEngine.getIsPlaying(), false);
  } finally { audioEngine.pause(); audioEngine.onStarted(() => {}); audioEngine.onError(() => {}); globalThis.fetch = oldFetch; globalThis.Audio = oldAudio; }
});
