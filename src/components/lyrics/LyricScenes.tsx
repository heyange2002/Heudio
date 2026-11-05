import { AnimatePresence, motion } from 'motion/react';
import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import type { LyricLine } from '../../types/music';
import { formatTime } from '../../utils/sceneAnalyzer';
import type { SceneLyricStyle } from './styles';

interface Props {
  style: SceneLyricStyle; lyrics: LyricLine[]; activeIndex: number; progress: number;
  currentTime: number; onSeek: (seconds: number) => void; animate: boolean;
}

// Composition and animations are original; the four visual directions are
// inspired by Folia's Tilt, Cappella, Fume and Pendolo modes.
export function LyricScenes({ style, lyrics, activeIndex, progress, currentTime, onSeek, animate }: Props) {
  const active = lyrics[activeIndex];
  const sceneRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const rail = sceneRef.current?.querySelector<HTMLElement>('[data-scene-rail]');
    const line = rail?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!rail || !line) return;
    const center = () => {
      const box = rail.getBoundingClientRect(), current = line.getBoundingClientRect();
      const top = Math.max(0, rail.scrollTop + current.top - box.top - Math.max(0, (rail.clientHeight - current.height) / 2));
      rail.scrollTop = top;
    };
    center();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(center); observer.observe(rail); observer.observe(line);
    return () => observer.disconnect();
  }, [style, activeIndex, lyrics]);
  const context = (before: number, after: number) => lyrics.slice(Math.max(0, activeIndex - before), activeIndex + after + 1)
    .map((line, i) => ({ line, index: Math.max(0, activeIndex - before) + i }));
  const transition = animate ? { type: 'spring' as const, stiffness: 190, damping: 25 } : { duration: 0 };
  const lineButton = (line: LyricLine, index: number, className: string) => <motion.button
    type="button" key={`${index}:${line.text}`} layout={animate ? 'position' : false}
    aria-label={`跳转到 ${formatTime(line.timeSec)} ${line.text}`} aria-current={index === activeIndex ? 'true' : undefined}
    onClick={() => onSeek(line.timeSec)} className={`${className} ${index === activeIndex ? 'is-active' : ''}`}
    initial={animate ? { opacity: 0, y: 18, scale: .96 } : false}
    animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: animate ? -16 : 0 }} transition={transition}
    style={{ '--scene-offset': index - activeIndex, '--scene-fit': Math.max(.5, Math.min(1, 22 / Math.max(1, line.text.length))) } as CSSProperties}>
    <span className="scene-line-text">{line.text}</span>
  </motion.button>;

  return <div ref={sceneRef} className={`lyric-scene lyric-scene-${style}`} data-scene={style}>
    {style === 'tilt' && <>
      <span aria-hidden="true" className="tilt-index">{String(activeIndex + 1).padStart(2, '0')}</span>
      <div className="tilt-rail" data-scene-rail><AnimatePresence initial={false} mode={animate ? 'popLayout' : 'sync'}>
        {context(1, 1).map(({ line, index }) => <div key={`${index}:${line.text}`} className={`tilt-row ${index === activeIndex ? 'tilt-main' : 'tilt-aside'}`}>{lineButton(line, index, 'tilt-line')}</div>)}
      </AnimatePresence></div>
      <div aria-hidden="true" className="scene-rule"><span style={{ transform: `scaleX(${progress})` }}/></div>
    </>}
    {style === 'chorus' && <div className="chorus-rail" data-scene-rail><AnimatePresence initial={false} mode={animate ? 'popLayout' : 'sync'}>
      {context(2, 1).map(({ line, index }) => <motion.div key={`${index}:${line.text}`} layout={animate ? 'position' : false} transition={transition}
        initial={animate ? { opacity: 0, x: index % 2 ? 24 : -24, scale: .92 } : false} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, scale: .92 }}
        className={`chorus-message ${index % 2 ? 'from-right' : 'from-left'} ${index > activeIndex ? 'is-upcoming' : ''}`}>
        <span className="chorus-avatar" aria-hidden="true">{index % 2 ? '♫' : '♪'}</span>
        {lineButton(line, index, 'chorus-bubble')}
      </motion.div>)}
    </AnimatePresence></div>}
    {style === 'fume' && <>
      <div className="fume-echoes" aria-hidden="true"><span>{lyrics[activeIndex - 1]?.text || active?.text}</span><span>{active?.text}</span><span>{lyrics[activeIndex + 1]?.text || active?.text}</span></div>
      <div className="fume-foreground"><span className="scene-eyebrow" aria-hidden="true">WORDS IN THE AIR · {String(activeIndex + 1).padStart(2, '0')}</span>
        <AnimatePresence initial={false} mode={animate ? 'wait' : 'sync'}>{active && lineButton(active, activeIndex, 'fume-line')}</AnimatePresence>
        {lyrics[activeIndex + 1] && lineButton(lyrics[activeIndex + 1], activeIndex + 1, 'fume-next')}
      </div>
      <div aria-hidden="true" className="fume-edge" style={{ transform: `scaleY(${progress})` }}/>
    </>}
    {style === 'clock' && <>
      <div aria-hidden="true" className="lyric-clock">
        <svg viewBox="0 0 240 240" className="clock-face">
          <circle cx="120" cy="120" r="108" fill="none" stroke="currentColor" strokeWidth=".6" opacity=".25"/>
          <circle cx="120" cy="120" r="87" fill="none" stroke="currentColor" strokeWidth=".5" opacity=".15"/>
          {Array.from({ length: 60 }, (_, i) => <line key={i} x1="120" y1="16" x2="120" y2={i % 5 ? 20 : 26} stroke="currentColor" opacity={i % 5 ? .25 : .6} strokeWidth={i % 5 ? .6 : 1} transform={`rotate(${i * 6} 120 120)`}/>)}
          <circle className="clock-progress" cx="120" cy="120" r="96" pathLength="1" fill="none" stroke="var(--lyric-accent)" strokeWidth="2" strokeDasharray={`${progress} 1`} transform="rotate(-90 120 120)"/>
          <g className="clock-hand" style={{ transform: `rotate(${animate ? currentTime * 6 : 0}deg)` }}><line x1="120" y1="133" x2="120" y2="40" stroke="var(--lyric-accent)" strokeWidth="1.2"/><circle cx="120" cy="120" r="4" fill="var(--lyric-accent)"/></g>
        </svg>
        <span className="clock-time">{formatTime(currentTime)}</span>
      </div>
      <div className="clock-rail" data-scene-rail><span className="scene-eyebrow" aria-hidden="true">EVERY SECOND, A VERSE</span><AnimatePresence initial={false} mode={animate ? 'popLayout' : 'sync'}>
        {context(1, 1).map(({ line, index }) => lineButton(line, index, 'clock-line'))}
      </AnimatePresence></div>
    </>}
  </div>;
}
