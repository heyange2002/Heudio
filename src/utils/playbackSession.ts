import type { MusicTrack, SceneMode } from '../types/music';
import { qqTrack, type QQSong } from './music';
import { EMPTY_TRACK } from '../data/sceneThemes';

export const PLAYBACK_SESSION_KEY = 'soundisle:playback-session';
export const DEFAULT_QUEUE_TITLE = '阿屿为你选的歌';
export const trackSong = (track: MusicTrack): QQSong => ({
  mid: track.qqMid!, title: track.title, artist: track.artist, album: track.album,
  duration: track.duration, coverUrl: track.coverUrl,
});

function songs(value: unknown): QQSong[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.slice(0, 500).flatMap(song => {
    if (!song || typeof song.mid !== 'string' || !/^[a-zA-Z0-9]+$/.test(song.mid) || seen.has(song.mid) ||
      typeof song.title !== 'string' || typeof song.artist !== 'string') return [];
    seen.add(song.mid);
    return [{ mid: song.mid, title: song.title, artist: song.artist,
      album: typeof song.album === 'string' ? song.album : '',
      duration: Number.isFinite(song.duration) && song.duration > 0 ? song.duration : 240,
      coverUrl: typeof song.coverUrl === 'string' ? song.coverUrl : '',
    }];
  });
}

// Persist metadata only. Playback URLs and authorization are obtained afresh.
export function restorePlaybackSession(value: unknown) {
  const saved = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const scene: SceneMode = ['focus', 'rest', 'workout', 'sleep'].includes(saved.scene as string) ? saved.scene as SceneMode : 'focus';
  const tracks = songs(saved.songs).map(song => qqTrack(song, scene));
  const index = tracks.findIndex(track => track.qqMid === saved.currentMid);
  const currentTrackIndex = Math.max(0, index);
  const duration = tracks[currentTrackIndex]?.duration || 0;
  const currentTime = index >= 0 && typeof saved.position === 'number' && Number.isFinite(saved.position)
    ? Math.max(0, Math.min(duration, saved.position)) : 0;
  return { tracks: tracks.length ? tracks : [EMPTY_TRACK], currentTrackIndex, currentTime, scene,
    queue: songs(saved.queue), title: typeof saved.title === 'string' ? saved.title : DEFAULT_QUEUE_TITLE };
}
