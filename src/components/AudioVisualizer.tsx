import { AmbientBackdrop } from './AmbientBackdrop';
import { useMotionPreference } from '../hooks/useMotionPreference';
import { TrackCover } from './TrackCover';
import React, { useEffect, useRef, useState } from 'react';
import { MusicTrack } from '../types/music';
import { audioEngine } from '../utils/audioEngine';
import { Sparkles, EyeOff } from 'lucide-react';

interface AudioVisualizerProps {
  currentTrack: MusicTrack;
  isPlaying: boolean;
  motionEnabled: boolean;
  onToggleMotion: () => void;
  pureMusicMode: boolean;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  currentTrack,
  isPlaying,
  motionEnabled,
  onToggleMotion,
  pureMusicMode,
}) => {
  const [motionStyle, setMotionStyle] = useState(() => { try { const saved = localStorage.getItem('soundisle:motion-style'); return saved === 'spectrum' || saved === 'orbit' ? saved : 'nebula'; } catch { return 'nebula'; } });
  const canAnimate = useMotionPreference(motionEnabled);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!canAnimate || motionStyle === 'nebula') {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const freqData = new Uint8Array(new ArrayBuffer(64));
    let phase = 0;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;

      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, width, height);

      // Get real frequency data from audio engine
      audioEngine.getFrequencyData(freqData);

      // Calculate average intensity
      let sum = 0;
      for (let i = 0; i < freqData.length; i++) {
        sum += freqData[i];
      }
      const avg = sum / freqData.length;
      const energy = isPlaying ? Math.max(0.2, avg / 120) : 0.1;

      // Draw subtle background aura
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) * 0.35 * (1 + energy * 0.15);

      const radialGrad = ctx.createRadialGradient(
        centerX,
        centerY,
        10,
        centerX,
        centerY,
        radius * 1.4
      );
      radialGrad.addColorStop(0, currentTrack.themeColors.glow);
      radialGrad.addColorStop(1, 'transparent');

      ctx.fillStyle = radialGrad;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * 1.4, 0, Math.PI * 2);
      ctx.fill();

      // Draw concentric orbital frequency waves
      const barCount = 48;
      const step = (Math.PI * 2) / barCount;
      phase += isPlaying ? 0.015 : 0.003;

      ctx.save();
      ctx.translate(centerX, centerY);

      if (motionStyle === 'spectrum') {
        ctx.restore();
        const barWidth = width / barCount;
        for (let i = 0; i < barCount; i++) {
          const val = isPlaying ? freqData[i % freqData.length] / 255 : 0.04;
          ctx.fillStyle = currentTrack.themeColors.accent; ctx.globalAlpha = 0.4 + val * 0.6;
          ctx.fillRect(i * barWidth + 2, height - 16 - val * 130, barWidth - 4, Math.max(3, val * 130));
        }
        if (isPlaying && !document.hidden) animationFrameRef.current = requestAnimationFrame(render); return;
      }
      // Draw outer audio reactive bars
      for (let i = 0; i < barCount; i++) {
        const angle = i * step + phase;
        const val = isPlaying ? freqData[i % freqData.length] / 255 : 0.1 + Math.sin(phase + i) * 0.05;
        const barHeight = 8 + val * 55;

        const x1 = Math.cos(angle) * (radius * 0.85);
        const y1 = Math.sin(angle) * (radius * 0.85);
        const x2 = Math.cos(angle) * (radius * 0.85 + barHeight);
        const y2 = Math.sin(angle) * (radius * 0.85 + barHeight);

        ctx.strokeStyle = currentTrack.themeColors.accent;
        ctx.globalAlpha = 0.35 + val * 0.65;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // Draw inner soothing harmonic curve
      ctx.beginPath();
      for (let i = 0; i <= barCount; i++) {
        const angle = i * step - phase;
        const waveOffset = Math.sin(angle * 4 + phase * 2) * (8 * energy);
        const r = radius * 0.75 + waveOffset;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.strokeStyle = currentTrack.themeColors.accent;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.restore();

      if (isPlaying && !document.hidden) animationFrameRef.current = requestAnimationFrame(render);
    };

    const sync = () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (!document.hidden) render();
    };
    sync(); document.addEventListener('visibilitychange', sync);

    return () => {
      document.removeEventListener('visibilitychange', sync);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [canAnimate, isPlaying, currentTrack, motionStyle]);

  return (
    <section aria-label="专辑动效"
      className={`relative w-full rounded-2xl overflow-hidden border border-stone-800/80 bg-stone-900/60 backdrop-blur-md flex flex-col items-center justify-center transition-all duration-500 ${
        pureMusicMode ? 'pure-music-visualizer' : 'h-[clamp(300px,calc(100dvh-27rem),440px)] min-h-[300px] md:shrink-0'
      }`}
    >
      {motionStyle === 'nebula' && <AmbientBackdrop accentColor={currentTrack.themeColors.accent} glow={currentTrack.themeColors.glow} coverUrl={currentTrack.coverUrl} isPlaying={isPlaying} motionEnabled={canAnimate}/>}
      {/* Dynamic ambient color glow backdrop */}
      <div
        className="absolute inset-0 pointer-events-none opacity-25 transition-opacity duration-700"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${currentTrack.themeColors.accent}33, transparent 75%)`,
        }}
      />

      {canAnimate && motionStyle !== 'nebula' ? (
        <canvas
          ref={canvasRef}
          width={600}
          height={600}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        />
      ) : (
        <div aria-hidden="true" className={`${motionStyle === 'nebula' ? 'hidden' : ''} absolute inset-0 flex items-center justify-center pointer-events-none`}>
          <div className="w-64 h-64 rounded-full border border-stone-700/30" style={{ boxShadow: `0 0 60px ${currentTrack.themeColors.glow}` }}/>
        </div>
      )}

      <div aria-label="动效样式" className="absolute top-3 right-3 z-20 flex gap-1 p-1 rounded-lg bg-stone-950/60 border border-stone-800">
        {([['nebula', '流云'], ['orbit', '环绕'], ['spectrum', '频谱']] as const).map(([value, label]) => <button key={value} aria-pressed={motionStyle === value} onClick={() => { setMotionStyle(value); try { localStorage.setItem('soundisle:motion-style', value); } catch {} }} className={`px-2 py-1 text-[11px] rounded-md ${motionStyle === value ? 'text-amber-300 bg-stone-800' : 'text-stone-500 hover:text-stone-200'}`}>{label}</button>)}
      </div>
      {/* Center Track Artwork & Title */}
      <div className={`relative z-10 flex flex-col items-center ${pureMusicMode?'p-6':'p-4'} text-center max-w-md`}>
        <div className={`relative group ${pureMusicMode?'mb-5':'mb-3'}`}>
          <TrackCover
            trackId={currentTrack.id}
              src={currentTrack.coverUrl}
            alt={currentTrack.title}
            className={`${pureMusicMode?'w-36 h-36 sm:w-44 sm:h-44':'w-[clamp(7rem,18dvh,11rem)] h-[clamp(7rem,18dvh,11rem)]'} rounded-2xl object-cover shadow-2xl border border-stone-700/60 transition-transform duration-500 group-hover:scale-102`}
          />
          {isPlaying && motionEnabled && (
            <div
              className="absolute -inset-1 rounded-2xl opacity-40 blur-md -z-10 transition-opacity"
              style={{ backgroundColor: currentTrack.themeColors.accent }}
            />
          )}
        </div>

        <span className="text-xs uppercase tracking-widest font-mono text-stone-400 mb-1">{currentTrack.genre}</span>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-100 text-balance mb-1.5">
          {currentTrack.title}
        </h2>
        <p className="text-xs text-stone-400">{currentTrack.artist}</p>

        {/* Motion switch indicator */}
        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={onToggleMotion}
            aria-label={motionEnabled ? '关闭动效' : '开启律动动效'}
            className="px-3 py-1 text-xs text-stone-400 hover:text-stone-200 bg-stone-800/80 hover:bg-stone-700 rounded-md border border-stone-700/50 transition-colors flex items-center gap-1.5"
          >
            {motionEnabled ? <EyeOff className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
            <span>{motionEnabled ? '关闭动效' : '开启律动'}</span>
          </button>
        </div>
      </div>
    </section>
  );
};
