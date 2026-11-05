import test from 'node:test';
import assert from 'node:assert/strict';
import { restorePlaybackSession, trackSong } from '../src/utils/playbackSession';
import { qqTrack } from '../src/utils/music';

test('restores playlist separately from play order, current song and position using fresh track metadata', () => {
  const a = { mid: 'songA', title: '第一首', artist: '歌手', album: '', duration: 120, coverUrl: '' };
  const b = { ...a, mid: 'songB', title: '第二首' };
  const restored = restorePlaybackSession({ songs: [b, a], queue: [a, b], title: '上次歌单', currentMid: a.mid, position: 57.25, scene: 'rest' });
  assert.deepEqual(restored.tracks.map(trackSong), [b, a]);
  assert.deepEqual(restored.queue, [a, b]);
  assert.equal(restored.currentTrackIndex, 1); assert.equal(restored.currentTime, 57.25);
  assert.equal(restored.title, '上次歌单'); assert.equal(restored.tracks[1].scene, 'rest');
  assert.deepEqual(restored.tracks[1].lyrics, []);
  assert.deepEqual(trackSong(qqTrack(a, 'rest')), a);
});

test('invalid storage cannot break startup or restore an invalid position', () => {
  for (const saved of [null, [], 'bad', { songs: [null, { mid: '../bad' }], queue: {}, scene: '__proto__' }]) {
    const state = restorePlaybackSession(saved);
    assert.equal(state.tracks.length, 1); assert.equal(state.tracks[0].qqMid, undefined);
    assert.equal(state.currentTime, 0); assert.equal(state.scene, 'focus');
  }
  const song = { mid: 'good', title: '歌曲', artist: '歌手', duration: 120 };
  for (const [position, expected] of [[-2, 0], [Infinity, 0], [NaN, 0], [200, 120]]) {
    const state = restorePlaybackSession({ songs: [song, song], currentMid: 'good', position });
    assert.equal(state.tracks.length, 1); assert.equal(state.currentTime, expected);
  }
  assert.equal(restorePlaybackSession({ songs: [song], currentMid: 'deleted', position: 40 }).currentTime, 0);
});

test('large queues restore every song and preserve selection beyond the old 500-song cutoff', () => {
  const songs = Array.from({length: 650}, (_,i) => ({mid:'track'+i,title:'歌曲'+i,artist:'歌手',album:'',duration:180,coverUrl:''}));
  const restored = restorePlaybackSession({songs,queue:songs,currentMid:'track620',position:42,title:'完整歌单'});
  assert.equal(restored.tracks.length,650);assert.equal(restored.queue.length,650);
  assert.equal(restored.currentTrackIndex,620);assert.equal(restored.currentTime,42);
});
