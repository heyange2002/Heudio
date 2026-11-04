import { LyricLine } from '../types/music';

export function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function findActiveLyricIndex(lyrics: LyricLine[], currentTime: number): number {
  if (!lyrics || lyrics.length === 0) return -1;
  for (let i = lyrics.length - 1; i >= 0; i--) {
    if (currentTime >= lyrics[i].timeSec) {
      return i;
    }
  }
  return 0;
}

export function calculateNextTrackIndex(
  currentIndex: number,
  totalTracks: number,
  autoAdvance: boolean,
  mode: 'advance' | 'previous' = 'advance'
): number {
  if (totalTracks <= 0) return 0;
  if (!autoAdvance && mode === 'advance') {
    return currentIndex; // 限制自动切歌：保持当前曲目或循环
  }
  if (mode === 'previous') {
    return (currentIndex - 1 + totalTracks) % totalTracks;
  }
  return (currentIndex + 1) % totalTracks;
}
