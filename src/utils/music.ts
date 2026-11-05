import type { LyricLine, MusicTrack, SceneMode } from '../types/music';
import { EMPTY_TRACK, SCENE_THEMES } from '../data/sceneThemes';
export type QQSong = { mid: string; title: string; artist: string; album: string; duration: number; coverUrl: string; genre?: string; bpm?: number; releaseDate?: string; tags?: string[] };
export type CompanionProfile = { name: string; city: string; preferences: string; workState: string };
export function qqTrack(song: QQSong, scene: SceneMode): MusicTrack {
  const base = { ...EMPTY_TRACK, themeColors: SCENE_THEMES[scene] };
  return { ...base, ...song, id: `qq:${song.mid}`, qqMid: song.mid, source: 'qq-music', scene, genre: song.genre || 'QQ 音乐', duration: song.duration || 240, lyrics: [], description: '阿屿与你一起选的歌' };
}
export function parseLyrics(text: string): LyricLine[] {
  if (typeof text !== 'string') return [];
  return text.split('\n').flatMap(line => {
    const matches = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    const content = line.replace(/\[[^\]]*\]/g, '').trim();
    return content ? matches.map(m => ({ timeSec: Number(m[1]) * 60 + Number(m[2]), text: content })) : [];
  }).sort((a,b) => a.timeSec - b.timeSec);
}
export function readLocal<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
}
export function saveLocal(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Current session remains usable. */ }
}
