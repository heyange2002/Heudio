import React, { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { LyricLine } from '../types/music';
import { findActiveLyricIndex, formatTime } from '../utils/sceneAnalyzer';
import { Maximize2 } from 'lucide-react';
import { useMotionPreference } from '../hooks/useMotionPreference';

import { LyricScenes } from './lyrics/LyricScenes';
import { LYRIC_STYLES, LYRIC_STYLE_DESCRIPTIONS, isSceneStyle, type LyricStyle } from './lyrics/styles';
export { LYRIC_STYLES, type LyricStyle } from './lyrics/styles';
interface LyricsViewProps {
  lyrics: LyricLine[]; currentTime: number; onSeek: (seconds: number) => void; accentColor: string;
  immersive?: boolean; onExpand?: () => void; lyricStyle?: LyricStyle; onStyleChange?: (style: LyricStyle) => void;
  motionEnabled?: boolean; isPlaying?: boolean; duration?: number;
}

export const LyricsView: React.FC<LyricsViewProps> = ({ lyrics, currentTime, onSeek, accentColor, immersive = false, onExpand,
  lyricStyle, onStyleChange, motionEnabled = true, isPlaying = false, duration = 0 }) => {
  const [localStyle, setLocalStyle] = useState<LyricStyle>('flow');
  const style = lyricStyle || localStyle;
  const animate = useMotionPreference(motionEnabled);
  const containerRef = useRef<HTMLDivElement>(null), activeLineRef = useRef<HTMLButtonElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const browsingUntil = useRef(0);
  const [previewLines, setPreviewLines] = useState(4);
  useEffect(() => {
    if (immersive || !sectionRef.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setPreviewLines(Math.max(4, Math.min(8, Math.floor((entry.contentRect.height - 90) / 44)))));
    observer.observe(sectionRef.current); return () => observer.disconnect();
  }, [immersive]);
  const activeIndex = findActiveLyricIndex(lyrics, currentTime);
  const active = lyrics[activeIndex];
  const start = immersive ? 0 : Math.max(0, Math.min(activeIndex - 1, lyrics.length - previewLines));
  const visibleLyrics = immersive ? lyrics : lyrics.slice(start, start + previewLines);
  const lineEnd = lyrics[activeIndex + 1]?.timeSec ?? (duration > (active?.timeSec ?? 0) ? duration : (active?.timeSec ?? 0) + 6);
  const progress = active ? Math.max(0, Math.min(1, (currentTime - active.timeSec) / Math.max(0.1, lineEnd - active.timeSec))) : 0;
  useEffect(() => {
    if (immersive && style === 'flow' && activeLineRef.current && containerRef.current && Date.now() > browsingUntil.current) {
      const container = containerRef.current, line = activeLineRef.current;
      const top = container.scrollTop + line.getBoundingClientRect().top - container.getBoundingClientRect().top - container.clientHeight / 2 + line.clientHeight / 2;
      container.scrollTo?.({ top: Math.max(0, top), behavior: animate ? 'smooth' : 'instant' });
    }
  }, [activeIndex, immersive, lyrics, style, animate]);
  const changeStyle = (value: LyricStyle) => { setLocalStyle(value); onStyleChange?.(value); };
  return <section ref={sectionRef} aria-label={immersive ? '完整歌词' : '歌词预览'} data-lyric-style={style} data-motion={animate} className={`lyrics-panel ${immersive ? 'lyrics-panel-immersive' : 'lyrics-panel-preview'}`} style={{ '--lyric-accent': accentColor } as CSSProperties}>
    <div className="lyrics-toolbar">
      <div aria-label="歌词样式" className="lyrics-style-picker">{LYRIC_STYLES.map(([value, label]) => <button type="button" key={value} aria-pressed={style === value} title={LYRIC_STYLE_DESCRIPTIONS[value]} onClick={() => changeStyle(value)}>{label}</button>)}</div>
      <div className="flex items-center gap-1">
        {!immersive && onExpand && <button type="button" aria-label="放大歌词" onClick={onExpand} className="lyrics-tool"><Maximize2 className="h-3.5 w-3.5"/><span>放大</span></button>}
      </div>
    </div>
    {!lyrics.length ? <p className="lyrics-empty">这首歌暂无可用歌词，安心听音乐就好。</p> : style === 'flow' ?
      <div ref={containerRef} className="lyrics-scroll" onWheel={() => { browsingUntil.current = Date.now() + 4000; }} onTouchMove={() => { browsingUntil.current = Date.now() + 4000; }}>
        {visibleLyrics.map((line, offset) => {
          const idx = start + offset, isActive = idx === activeIndex;
          return <motion.button type="button" key={`${idx}:${line.text}`} layout={animate ? 'position' : false} transition={{ type: 'spring', stiffness: 170, damping: 26 }}
            aria-current={isActive ? 'true' : undefined} aria-label={`跳转到 ${formatTime(line.timeSec)} ${line.text}`} ref={isActive ? activeLineRef : null} onClick={() => { browsingUntil.current = 0; onSeek(line.timeSec); }}
            className={`lyrics-line ${isActive ? 'is-active' : ''}`} style={{ '--line-distance': Math.min(4, Math.abs(idx - activeIndex)) } as CSSProperties}>
            <span className="min-w-0 flex-1"><span className="lyrics-line-text">{line.text}</span></span>
            <span className="lyrics-timestamp">{formatTime(line.timeSec)}</span>
          </motion.button>;
        })}
      </div> : isSceneStyle(style) ? <LyricScenes style={style} lyrics={lyrics} activeIndex={activeIndex} progress={progress} currentTime={currentTime} onSeek={onSeek} animate={animate}/> : <div className="lyrics-spotlight">
        <button type="button" className="lyrics-neighbor" disabled={activeIndex <= 0} onClick={() => onSeek(lyrics[activeIndex - 1].timeSec)}>{lyrics[activeIndex - 1]?.text || '此刻，听见'}</button>
        <div className="lyrics-focus-slot"><AnimatePresence mode="wait" initial={false}>
          <motion.button key={`${activeIndex}:${active?.text}:${style}`} type="button" aria-current="true" aria-label={`跳转到 ${formatTime(active?.timeSec ?? 0)} ${active?.text}`} onClick={() => active && onSeek(active.timeSec)} className={`lyrics-focus lyrics-focus-${style}`}
            initial={animate ? { opacity: 0, y: 24, scale: 0.94, filter: 'blur(8px)' } : false} animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }} exit={animate ? { opacity: 0, y: -16, filter: 'blur(6px)' } : { opacity: 0 }} transition={{ duration: animate ? 0.38 : 0 }}>
            <span className="lyrics-focus-words">{Array.from(active?.text || '').map((char, i, chars) => {
              const lit = Math.max(0, Math.min(1, progress * chars.length - i));
              return <span key={i} className="lyric-glyph" style={{ '--glyph-lit': lit, '--glyph-delay': `${i * 22}ms`, '--glyph-tilt': `${((i * 7) % 9) - 4}deg`, '--glyph-y': `${Math.sin(i * 1.7) * 7}px` } as CSSProperties}>{char === ' ' ? '\u00a0' : char}</span>;
            })}</span>
          </motion.button>
        </AnimatePresence></div>
        <button type="button" className="lyrics-neighbor" disabled={activeIndex >= lyrics.length - 1} onClick={() => onSeek(lyrics[activeIndex + 1].timeSec)}>{lyrics[activeIndex + 1]?.text || '余音，仍在'}</button>
        <div aria-hidden="true" className="lyrics-line-progress"><span style={{ transform: `scaleX(${progress})` }}/></div>
      </div>}
    {immersive && <div className="lyrics-caption"><span className={`lyrics-status-dot ${isPlaying && animate ? 'is-playing' : ''}`}/>{isPlaying ? '让文字随音乐流动' : '音乐停驻，余韵未散'}<span className="ml-auto">点击歌词跳转</span></div>}
  </section>;
};
