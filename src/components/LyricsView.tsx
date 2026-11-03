import React, { useEffect, useRef, useState } from 'react';
import { LyricLine } from '../types/music';
import { findActiveLyricIndex, formatTime } from '../utils/sceneAnalyzer';
import { Languages, SkipForward } from 'lucide-react';

interface LyricsViewProps {
  lyrics: LyricLine[];
  currentTime: number;
  onSeek: (seconds: number) => void;
  accentColor: string;
  immersive?: boolean;
}

export const LyricsView: React.FC<LyricsViewProps> = ({
  lyrics,
  currentTime,
  onSeek,
  accentColor,
  immersive = false,
}) => {
  const [showTranslation, setShowTranslation] = useState(true);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeLineRef = useRef<HTMLDivElement | null>(null);

  const activeIndex = findActiveLyricIndex(lyrics, currentTime);

  // Auto-scroll to active lyric line smoothly
  useEffect(() => {
    if (activeLineRef.current && containerRef.current) {
      const container = containerRef.current, line = activeLineRef.current;
      const top = container.scrollTop + line.getBoundingClientRect().top - container.getBoundingClientRect().top - container.clientHeight / 2 + line.clientHeight / 2;
      container.scrollTo({ top: Math.max(0, top), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    }
  }, [activeIndex]);

  return (
    <div className={`relative w-full rounded-2xl border border-stone-800/80 bg-stone-900/60 backdrop-blur-md p-5 flex flex-col ${immersive ? 'h-[65vh] min-h-[380px]' : 'h-[380px] lg:h-[440px]'}`}>
      {/* Header with translation toggle & status */}
      <div className="flex items-center justify-between pb-3 mb-2 border-b border-stone-800/60 text-xs text-stone-400">
        <div className="flex items-center gap-2">
          <span className="font-medium text-stone-300">同步伴随心境词</span>
          <span aria-hidden="true">·</span>
          <span>点击句子跳转播放</span>
        </div>
        <button
          onClick={() => setShowTranslation(!showTranslation)}
          className={`px-2.5 py-1 rounded-md text-xs transition-colors flex items-center gap-1.5 ${
            showTranslation ? 'bg-stone-800 text-stone-200' : 'text-stone-500 hover:text-stone-300'
          }`}
          aria-label="切换双语释义"
        >
          <Languages className="w-3.5 h-3.5" />
          <span>{showTranslation ? '双语对照' : '纯中文'}</span>
        </button>
      </div>

      {/* Scrolling Lyrics List */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto space-y-4 pr-2 scrollbar-thin scrollbar-thumb-stone-800 select-none py-4"
      >
        {!lyrics.length && <p className="text-sm text-stone-500 p-3">这首歌暂无可用歌词，安心听音乐就好。</p>}
        {lyrics.map((line, idx) => {
          const isActive = idx === activeIndex;
          const isPassed = idx < activeIndex;

          return (
            <div
              key={idx}
              ref={isActive ? activeLineRef : null}
              onClick={() => onSeek(line.timeSec)}
              className={`cursor-pointer rounded-xl p-3 transition-all duration-300 group ${
                isActive
                  ? 'bg-stone-800/70 border border-stone-700/60 shadow-lg scale-[1.01]'
                  : isPassed
                  ? 'opacity-40 hover:opacity-75 hover:bg-stone-800/30'
                  : 'opacity-65 hover:opacity-90 hover:bg-stone-800/30'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 flex-1">
                  <p
                    className={`text-sm sm:text-base leading-relaxed font-medium transition-colors ${
                      isActive ? 'text-amber-200' : 'text-stone-300'
                    }`}
                    style={isActive ? { color: accentColor } : {}}
                  >
                    {line.text}
                  </p>
                  {showTranslation && line.translation && (
                    <p
                      className={`text-xs transition-colors ${
                        isActive ? 'text-stone-300' : 'text-stone-500'
                      }`}
                    >
                      {line.translation}
                    </p>
                  )}
                </div>
                <span className="font-mono text-[11px] text-stone-500 shrink-0 tabular-nums pt-0.5">
                  {formatTime(line.timeSec)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
