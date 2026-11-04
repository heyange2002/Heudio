import React, { useEffect, useRef, useState } from 'react';
import { LyricLine } from '../types/music';
import { findActiveLyricIndex, formatTime } from '../utils/sceneAnalyzer';
import { Languages, Maximize2 } from 'lucide-react';

interface LyricsViewProps {
  lyrics: LyricLine[];
  currentTime: number;
  onSeek: (seconds: number) => void;
  accentColor: string;
  immersive?: boolean;
  onExpand?: () => void;
}

export const LyricsView: React.FC<LyricsViewProps> = ({
  lyrics,
  currentTime,
  onSeek,
  accentColor,
  immersive = false,
  onExpand,
}) => {
  const [showTranslation, setShowTranslation] = useState(immersive);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeLineRef = useRef<HTMLButtonElement | null>(null);

  const activeIndex = findActiveLyricIndex(lyrics, currentTime);
  const start = immersive ? 0 : Math.max(0, Math.min(activeIndex - 1, lyrics.length - 4));
  const visibleLyrics = immersive ? lyrics : lyrics.slice(start, start + 4);

  // Auto-scroll to active lyric line smoothly
  useEffect(() => {
    if (immersive && activeLineRef.current && containerRef.current) {
      const container = containerRef.current, line = activeLineRef.current;
      const top = container.scrollTop + line.getBoundingClientRect().top - container.getBoundingClientRect().top - container.clientHeight / 2 + line.clientHeight / 2;
      container.scrollTo({ top: Math.max(0, top), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    }
  }, [activeIndex, immersive, lyrics]);

  return (
    <section aria-label={immersive?'完整歌词':'歌词预览'} className={`relative w-full rounded-2xl border border-stone-800/80 bg-stone-900/60 backdrop-blur-md flex flex-col ${immersive ? 'p-4 h-[65dvh] min-h-64' : 'p-3'}`}>
      {/* Header with translation toggle & status */}
      <div className={`flex items-center justify-between border-b border-stone-800/60 text-xs text-stone-400 ${immersive?'pb-3 mb-2':'pb-2 mb-1'}`}>
        <div className="flex items-center gap-2">
          <span className="font-medium text-stone-300">{immersive?'同步歌词':'此刻的歌词'}</span>
        </div>
        <div className="flex items-center gap-1"><button
          onClick={() => setShowTranslation(!showTranslation)}
          className={`px-2.5 py-1 rounded-md text-xs transition-colors flex items-center gap-1.5 ${
            showTranslation ? 'bg-stone-800 text-stone-200' : 'text-stone-500 hover:text-stone-300'
          }`}
          aria-label="切换双语释义"
        >
          <Languages className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{showTranslation ? '双语对照' : '原文'}</span>
        </button>
        {!immersive&&onExpand&&<button type="button" aria-label="放大歌词" onClick={onExpand} className="flex items-center gap-1.5 rounded-md bg-stone-800 px-2.5 py-1 text-stone-200 hover:text-amber-200"><Maximize2 className="h-3.5 w-3.5"/><span>放大</span></button>}</div>
      </div>

      {/* Scrolling Lyrics List */}
      <div
        ref={containerRef}
        className={immersive?'min-h-0 flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-stone-800 select-none py-3':'space-y-1 select-none'}
      >
        {!lyrics.length && <p className="text-sm text-stone-500 p-3">这首歌暂无可用歌词，安心听音乐就好。</p>}
        {visibleLyrics.map((line, offset) => {
          const idx = start + offset;
          const isActive = idx === activeIndex;
          const isPassed = idx < activeIndex;

          return (
            <button type="button" aria-current={isActive?'true':undefined} aria-label={`跳转到 ${formatTime(line.timeSec)} ${line.text}`}
              key={idx}
              ref={isActive ? activeLineRef : null}
              onClick={() => onSeek(line.timeSec)}
              className={`w-full text-left cursor-pointer rounded-xl ${immersive?'p-3':'px-3 py-1'} transition-all duration-300 group ${
                isActive
                  ? 'bg-stone-800/70 border border-stone-700/60 shadow-lg scale-[1.01]'
                  : isPassed
                  ? 'opacity-40 hover:opacity-75 hover:bg-stone-800/30'
                  : 'opacity-65 hover:opacity-90 hover:bg-stone-800/30'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 flex-1 min-w-0">
                  <p
                    className={`text-sm ${immersive?'sm:text-base leading-relaxed':'truncate leading-5'} font-medium transition-colors ${
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
            </button>
          );
        })}
      </div>
    </section>
  );
};
