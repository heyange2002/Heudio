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
