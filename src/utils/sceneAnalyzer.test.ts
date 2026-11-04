import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatTime,
  findActiveLyricIndex,
  calculateNextTrackIndex,
} from './sceneAnalyzer';

test('formatTime correctly formats seconds to mm:ss', () => {
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(65), '01:05');
  assert.equal(formatTime(180), '03:00');
  assert.equal(formatTime(-5), '00:00');
});

test('findActiveLyricIndex identifies correct active line', () => {
  const lyrics = [
    { timeSec: 0, text: 'Line 0' },
    { timeSec: 10, text: 'Line 1' },
    { timeSec: 30, text: 'Line 2' },
  ];

  assert.equal(findActiveLyricIndex(lyrics, 0), 0);
  assert.equal(findActiveLyricIndex(lyrics, 5), 0);
  assert.equal(findActiveLyricIndex(lyrics, 15), 1);
  assert.equal(findActiveLyricIndex(lyrics, 35), 2);
  assert.equal(findActiveLyricIndex([], 10), -1);
});

test('calculateNextTrackIndex respects autoAdvance restriction', () => {
  const total = 5;
  // With autoAdvance = true
  assert.equal(calculateNextTrackIndex(1, total, true, 'advance'), 2);
  assert.equal(calculateNextTrackIndex(4, total, true, 'advance'), 0);
  assert.equal(calculateNextTrackIndex(0, total, true, 'previous'), 4);

  // With autoAdvance = false ("限制自动切歌")
  assert.equal(calculateNextTrackIndex(1, total, false, 'advance'), 1);
  // Manual previous still works
  assert.equal(calculateNextTrackIndex(1, total, false, 'previous'), 0);
});
