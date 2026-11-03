import { SceneMode, AmbientMix, LyricLine, MusicTrack } from '../types/music';

export interface AnalysisResult {
  sceneId: SceneMode;
  sceneTitle: string;
  reply: string;
  rationale: string;
  recommendedTrackId: string;
  ambientAdjustments: Partial<AmbientMix>;
  suggestedFollowUps: string[];
  isCorrection: boolean;
}

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

export function analyzeUserPrompt(
  input: string,
  context?: {
    timeHour?: number;
    weather?: string;
    currentScene?: SceneMode;
    currentTrackId?: string;
  }
): AnalysisResult {
  const query = (input || '').trim().toLowerCase();
  const currentScene = context?.currentScene || 'focus';

  // Check for user corrections ("纠正推荐")
  if (
    query.includes('钢琴') ||
    query.includes('纯琴') ||
    query.includes('只要琴') ||
    query.includes('木质')
  ) {
    return {
      sceneId: currentScene,
      sceneTitle: '黑白回响 · 纯粹琴音',
      reply: '收到。已为你滤去合成音与背景器乐，转为清晰温暖的木质钢琴。',
      rationale: '响应偏好纠正，保留真实击弦木槌泛音与呼吸感。',
      recommendedTrackId: 'gentle-piano',
      ambientAdjustments: { rain: 0.25, fire: 0.1, cafe: 0, waves: 0, wind: 0.05 },
      suggestedFollowUps: ['稍微轻柔一点', '加点窗外小雨', '开启只听音乐模式'],
      isCorrection: true,
    };
  }

  if (
    query.includes('安静') ||
    query.includes('太吵') ||
    query.includes('吵') ||
    query.includes('慢一点') ||
    query.includes('轻一点') ||
    query.includes('不要鼓') ||
    query.includes('去鼓')
  ) {
    return {
      sceneId: currentScene === 'workout' ? 'rest' : currentScene,
      sceneTitle: '轻灵留白 · 降噪安神',
      reply: '已为你隐去重音鼓点与急促节奏，将动态起伏调至温和区间。',
      rationale: '即时修正推荐，降低听觉负荷，留出舒适的感知距离。',
      recommendedTrackId: 'gentle-piano',
      ambientAdjustments: { wind: 0.1, rain: 0.15, fire: 0.05, waves: 0.2, cafe: 0 },
      suggestedFollowUps: ['切换到睡眠模式', '关闭动效', '降低整体音量'],
      isCorrection: true,
    };
  }

  // Sleep intent
  if (
    query.includes('睡') ||
    query.includes('困') ||
    query.includes('晚安') ||
    query.includes('失眠') ||
    query.includes('入睡') ||
    query.includes('躺下')
  ) {
    return {
      sceneId: 'sleep',
      sceneTitle: '夜泊星海 · 睡眠准备',
      reply: '夜色深了。声屿为你减退了所有光亮与节拍，闭上眼，随潮汐安心休息吧。',
      rationale: '45-52 BPM极低频律动与德尔塔波引导，辅以潮涌白噪音，协助神经系统降温。',
      recommendedTrackId: 'sleep-drift',
      ambientAdjustments: { waves: 0.45, rain: 0.1, fire: 0.05, wind: 0.15, cafe: 0 },
      suggestedFollowUps: ['设置30分钟定时关闭', '换成纯海浪', '音量渐弱'],
      isCorrection: false,
    };
  }

  // Workout / active intent
  if (
    query.includes('跑') ||
    query.includes('动') ||
    query.includes('健身') ||
    query.includes('出汗') ||
    query.includes('晨跑') ||
    query.includes('节奏') ||
    query.includes('提神') ||
    query.includes('燃')
  ) {
    return {
      sceneId: 'workout',
      sceneTitle: '晨曦跃动 · 活力步伐',
      reply: '换上运动鞋了吗？声屿已接入120BPM晨光脉冲，让律动托住你的步频。',
      rationale: '提炼稳定上行节拍与宽广通透的音场，提供适度多巴胺激励。',
      recommendedTrackId: 'sunrise-stride',
      ambientAdjustments: { wind: 0.35, waves: 0.1, rain: 0, fire: 0, cafe: 0 },
      suggestedFollowUps: ['步频再快一点', '运动完毕进入拉伸', '不要环境风声'],
      isCorrection: false,
    };
  }

  // Rest / unwind intent
  if (
    query.includes('下班') ||
    query.includes('累') ||
    query.includes('歇') ||
    query.includes('放空') ||
    query.includes('喝茶') ||
    query.includes('咖啡') ||
    query.includes('散步') ||
    query.includes('放松')
  ) {
    return {
      sceneId: 'rest',
      sceneTitle: '暮色海湾 · 停歇片刻',
      reply: '辛苦了，先喝口水松一松肩膀。这里只有暮色与轻柔海风，允许你什么也不想。',
      rationale: '抚平交感神经应激，结合原声吉他与柔和海滩浪花，创造温暖安全岛。',
      recommendedTrackId: 'coastal-rest',
      ambientAdjustments: { waves: 0.35, wind: 0.2, rain: 0.15, fire: 0.1, cafe: 0.1 },
      suggestedFollowUps: ['加点小雨声', '开启15分钟番茄休息', '换成纯钢琴'],
      isCorrection: false,
    };
  }

  // Contextual time check if input is neutral
  const hour = context?.timeHour ?? new Date().getHours();
  if (hour >= 23 || hour < 5) {
    return {
      sceneId: 'focus',
      sceneTitle: '深夜微窗 · 极客心流',
      reply: '深夜的万物都安静了。声屿为你点亮一盏温和的桌灯，陪你把最后的灵感沉淀下来。',
      rationale: '深夜时段优先抑制尖锐高频，以低保真电子钢琴铺底，不打扰思考亦不显清冷。',
      recommendedTrackId: 'midnight-code',
      ambientAdjustments: { rain: 0.35, fire: 0.1, waves: 0, wind: 0.05, cafe: 0 },
      suggestedFollowUps: ['快写完了准备睡觉', '换成纯钢琴', '调大窗外雨声'],
      isCorrection: false,
    };
  }

  // Default focus
  return {
    sceneId: 'focus',
    sceneTitle: '夜窗微雨 · 深度专注',
    reply: '已为你铺开清澈平缓的专注流。把杂念留在门外，我们一步步来。',
    rationale: '稳定68BPM温润律动，有效隔绝外界碎片化干扰。',
    recommendedTrackId: 'midnight-code',
    ambientAdjustments: { rain: 0.3, fire: 0.1, waves: 0.05, wind: 0.1, cafe: 0.1 },
    suggestedFollowUps: ['开启25分钟专注', '换成纯原声', '进入纯音乐模式'],
    isCorrection: false,
  };
}

export function filterTracks(tracks: MusicTrack[], sceneId?: SceneMode): MusicTrack[] {
  if (!sceneId) return tracks;
  return tracks.filter((t) => t.scene === sceneId);
}
