export type SceneMode = 'focus' | 'rest' | 'workout' | 'sleep';

export interface LyricLine {
  timeSec: number;
  text: string;
  translation?: string;
}

export interface MusicTrack {
  id: string;
  qqMid?: string;
  source?: 'qq-music';
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
  description: string;
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

export type PlaybackMode = 'sequential' | 'shuffle' | 'repeat-one';

export interface ServiceSettings {
  musicSource: 'qq-music';
  chatModel: 'MiniMax-M3' | 'local-heuristic';
  voiceTts: 'minimax' | 'silent';
  voiceModel: string;
  voiceId: string;
  voiceSpeed: number;
  voiceAutoPlay: boolean;
  playbackMode: PlaybackMode;
  motionEnabled: boolean; // "关闭动效"
  pureMusicMode: boolean; // "只听音乐"
  sleepTimerMinutes: number | null; // e.g. 15, 30, 45 or null
}
