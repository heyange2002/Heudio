export type SceneMode = 'focus' | 'rest' | 'workout' | 'sleep';

export interface LyricLine {
  timeSec: number;
  text: string;
  translation?: string;
}

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // in seconds
  coverUrl: string;
  scene: SceneMode;
  genre: string;
  bpm: number;
  themeColors: {
    accent: string;
    glow: string;
    bgTint: string;
    gradient: string;
  };
  lyrics: LyricLine[];
  audioPreset: 'lofi-code' | 'ambient-drift' | 'gentle-piano' | 'sunrise-stride' | 'sleep-drift' | 'coastal-rest';
  description: string;
}

export interface AmbientMix {
  rain: number;
  waves: number;
  fire: number;
  wind: number;
  cafe: number;
}

export interface MusicScene {
  id: SceneMode;
  name: string;
  tagline: string;
  description: string;
  targetBpm: string;
  ambientDefaults: AmbientMix;
  recommendedTrackIds: string[];
  themeColor: string;
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  timestamp: string;
  sceneAdjustment?: SceneMode;
  recommendedTrackId?: string;
  rationale?: string;
  quickActions?: string[];
}

export interface ServiceSettings {
  musicSource: 'soundisle-builtin' | 'open-archive' | 'local-stems';
  chatModel: 'gemini-3.8-flash' | 'gemini-4-argon' | 'local-heuristic';
  voiceTts: 'gemini-tts' | 'browser-speech' | 'silent';
  autoAdvance: boolean; // "限制自动切歌"
  motionEnabled: boolean; // "关闭动效"
  pureMusicMode: boolean; // "只听音乐"
  sleepTimerMinutes: number | null; // e.g. 15, 30, 45 or null
}
