import type { MusicTrack, SceneMode } from '../types/music';
import { COVER_IMAGES } from '../utils/coverFallback';
export const SCENE_THEMES: Record<SceneMode, MusicTrack['themeColors']> = {
  focus: { accent: '#e0a96d', glow: 'rgba(224,169,109,0.35)', bgTint: 'rgba(25,23,20,0.95)', gradient: 'from-amber-950/40 via-stone-900/60 to-black' },
  rest: { accent: '#a3b18a', glow: 'rgba(163,177,138,0.35)', bgTint: 'rgba(22,25,20,0.95)', gradient: 'from-green-950/40 via-stone-900/60 to-black' },
  workout: { accent: '#fb923c', glow: 'rgba(251,146,60,0.35)', bgTint: 'rgba(28,21,16,0.95)', gradient: 'from-orange-950/40 via-stone-900/60 to-black' },
  sleep: { accent: '#38bdf8', glow: 'rgba(56,189,248,0.35)', bgTint: 'rgba(17,23,30,0.95)', gradient: 'from-sky-950/40 via-stone-900/60 to-black' },
};
export const EMPTY_TRACK: MusicTrack = {
  id: 'waiting-for-music', title: '此刻，想听什么？', artist: '让阿屿选歌，或在音乐侧栏搜索', album: '',
  duration: 0, coverUrl: COVER_IMAGES.focus, scene: 'focus', genre: '等待播放', bpm: 0,
  themeColors: SCENE_THEMES.focus, lyrics: [], description: '',
};
