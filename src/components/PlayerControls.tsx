import { TrackCover } from './TrackCover';
import React, { useState } from 'react';
import { MusicTrack } from '../types/music';
import { formatTime } from '../utils/sceneAnalyzer';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  SlidersHorizontal,
  Clock,
  Sparkles,
  EyeOff,
  Repeat,
  Repeat1,
  Music,
} from 'lucide-react';

interface PlayerControlsProps {
  currentTrack: MusicTrack;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  currentTime: number;
  onSeek: (seconds: number) => void;
  volume: number;
  onChangeVolume: (vol: number) => void;
  autoAdvance: boolean;
  onToggleAutoAdvance: () => void;
  motionEnabled: boolean;
  onToggleMotion: () => void;
  pureMusicMode: boolean;
  onTogglePureMusic: () => void;
  onOpenMixer: () => void;
  sleepTimerMinutes: number | null;
  onSetSleepTimer: (mins: number | null) => void;
}

export const PlayerControls: React.FC<PlayerControlsProps> = ({
  currentTrack,
  isPlaying,
  onTogglePlay,
  onNext,
  onPrev,
  currentTime,
  onSeek,
  volume,
  onChangeVolume,
  autoAdvance,
  onToggleAutoAdvance,
  motionEnabled,
  onToggleMotion,
  pureMusicMode,
  onTogglePureMusic,
  onOpenMixer,
  sleepTimerMinutes,
  onSetSleepTimer,
}) => {
  const [showTimerMenu, setShowTimerMenu] = useState(false);
  const [prevVolume, setPrevVolume] = useState(volume);

  const toggleMute = () => {
    if (volume > 0) {
      setPrevVolume(volume);
      onChangeVolume(0);
    } else {
      onChangeVolume(prevVolume || 0.8);
    }
  };

  const progressPercent = currentTrack.duration > 0
    ? Math.min(100, (currentTime / currentTrack.duration) * 100)
    : 0;

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-40 bg-stone-950/95 backdrop-blur-2xl border-t border-stone-800/80 px-4 py-3 sm:px-6 transition-all">
      <div className="max-w-7xl mx-auto flex flex-col gap-2">
        {/* Scrub bar */}
        <div className="flex items-center gap-3 w-full">
          <span className="font-mono text-xs text-stone-500 tabular-nums w-10 text-right">
            {formatTime(currentTime)}
          </span>
          <div className="relative flex-1 group py-1">
            <input
              type="range"
              min="0"
              max={currentTrack.duration}
              value={currentTime}
              onChange={(e) => onSeek(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-stone-800 rounded-lg appearance-none cursor-pointer accent-amber-400 group-hover:h-2 transition-all"
            />
          </div>
          <span className="font-mono text-xs text-stone-500 tabular-nums w-10">
            {formatTime(currentTrack.duration)}
          </span>
        </div>

        {/* Controls row */}
        <div className="flex items-center justify-between gap-4">
          {/* Left: Track Info */}
          <div className="flex items-center gap-3 min-w-0 max-w-[200px] sm:max-w-xs">
            <TrackCover
              trackId={currentTrack.id}
              src={currentTrack.coverUrl}
              alt={currentTrack.title}
                className="w-11 h-11 rounded-lg object-cover border border-stone-800 shrink-0"
            />
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-stone-100 truncate">
                {currentTrack.title}
              </h4>
              <p className="text-xs text-stone-400 truncate">
                {currentTrack.artist}
              </p>
            </div>
          </div>

          {/* Center: Main Playback Buttons */}
          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
            {/* Auto advance restriction toggle */}
            <button
              onClick={onToggleAutoAdvance}
              title={autoAdvance ? '自动连播下一首 (点击限制自动切歌)' : '已限制自动切歌 (单曲流)'}
              aria-label={autoAdvance ? '限制自动切歌' : '开启自动切歌'}
              className={`p-2 rounded-lg text-xs transition-colors hidden sm:flex items-center ${
                autoAdvance ? 'text-stone-400 hover:text-stone-200' : 'text-amber-400 bg-amber-400/10'
              }`}
            >
              {autoAdvance ? <Repeat className="w-4 h-4" /> : <Repeat1 className="w-4 h-4" />}
            </button>

            <button
              onClick={onPrev}
              aria-label="上一首"
              className="p-2 text-stone-400 hover:text-stone-100 transition-colors"
            >
              <SkipBack className="w-5 h-5" />
            </button>

            <button
              onClick={onTogglePlay}
              aria-label={isPlaying ? '暂停' : '播放'}
              className="p-3 rounded-full bg-amber-400 hover:bg-amber-300 text-stone-950 shadow-lg shadow-amber-400/20 active:scale-95 transition-transform"
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current translate-x-0.5" />}
            </button>

            <button
              onClick={onNext}
              aria-label="下一首"
              className="p-2 text-stone-400 hover:text-stone-100 transition-colors"
            >
              <SkipForward className="w-5 h-5" />
            </button>

            {/* Motion toggle */}
            <button
              onClick={onToggleMotion}
              title={motionEnabled ? '关闭音频动效' : '开启音频动效'}
              aria-label={motionEnabled ? '关闭动效' : '开启律动'}
              className={`p-2 rounded-lg text-xs transition-colors hidden sm:flex items-center ${
                motionEnabled ? 'text-stone-400 hover:text-stone-200' : 'text-amber-400 bg-amber-400/10'
              }`}
            >
              {motionEnabled ? <EyeOff className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
            </button>
          </div>

          {/* Right: Sound Mix, Sleep Timer, Volume */}
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {/* Ambient Mixer button */}
            <button
              onClick={onOpenMixer}
              title="打开自然声景混音"
              aria-label="打开自然声景混音"
              className="p-2 text-stone-400 hover:text-stone-200 hover:bg-stone-800/60 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span className="text-xs hidden md:inline">声景</span>
            </button>

            {/* Sleep Timer button */}
            <div className="relative">
              <button
                onClick={() => setShowTimerMenu(!showTimerMenu)}
                title="定时关闭 / 睡眠倒计时"
                aria-label="定时关闭"
                className={`p-2 rounded-lg text-xs transition-colors flex items-center gap-1.5 ${
                  sleepTimerMinutes ? 'text-amber-400 bg-amber-400/10 font-medium' : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span className="hidden md:inline">
                  {sleepTimerMinutes ? `${sleepTimerMinutes}m` : '定时'}
                </span>
              </button>

              {showTimerMenu && (
                <div className="absolute bottom-full right-0 mb-2 w-36 bg-stone-900 border border-stone-800 rounded-xl p-2 shadow-2xl space-y-1 text-xs">
                  <div className="px-2 py-1 text-[11px] text-stone-500 font-semibold border-b border-stone-800">
                    睡眠渐弱定时
                  </div>
                  {[null, 15, 30, 45, 60].map((mins) => (
                    <button
                      key={mins ?? 'off'}
                      onClick={() => {
                        onSetSleepTimer(mins);
                        setShowTimerMenu(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-md transition-colors ${
                        sleepTimerMinutes === mins
                          ? 'bg-amber-400 text-stone-950 font-semibold'
                          : 'text-stone-300 hover:bg-stone-800'
                      }`}
                    >
                      {mins === null ? '不开启' : `${mins} 分钟`}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Volume slider */}
            <div className="hidden lg:flex items-center gap-2">
              <button
                onClick={toggleMute}
                aria-label={volume === 0 ? '取消静音' : '静音'}
                className="text-stone-400 hover:text-stone-200"
              >
                {volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                onChange={(e) => onChangeVolume(parseFloat(e.target.value))}
                className="w-20 h-1.5 bg-stone-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
              />
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};
