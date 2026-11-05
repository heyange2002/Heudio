import { useEffect, useRef, type CSSProperties } from 'react';
import { audioEngine } from '../utils/audioEngine';
import { useMotionPreference } from '../hooks/useMotionPreference';

export function AmbientBackdrop({ accentColor, glow, coverUrl, isPlaying = false, motionEnabled = true }: {
  accentColor: string; glow?: string; coverUrl?: string; isPlaying?: boolean; motionEnabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const animate = useMotionPreference(motionEnabled) && isPlaying;
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let frame = 0, last = 0, energy = 0;
    const data = new Uint8Array(new ArrayBuffer(64));
    const draw = (time: number) => {
      if (time - last > 50) {
        audioEngine.getFrequencyData(data);
        const level = data.slice(0, 12).reduce((sum, value) => sum + value, 0) / (12 * 255);
        energy += (level - energy) * 0.15;
        node.style.setProperty('--ambient-energy', String(energy));
        last = time;
      }
      frame = requestAnimationFrame(draw);
    };
    const sync = () => {
      if (frame) cancelAnimationFrame(frame);
      if (animate && !document.hidden && typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(draw);
      node.dataset.running = String(animate && !document.hidden);
    };
    sync(); document.addEventListener('visibilitychange', sync);
    if (!animate) node.style.setProperty('--ambient-energy', '0');
    return () => { if (frame) cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', sync); };
  }, [animate]);
  return <div ref={ref} aria-hidden="true" className="ambient-backdrop" style={{ '--ambient-accent': accentColor, '--ambient-glow': glow || accentColor } as CSSProperties}>
    {coverUrl && <div key={coverUrl} className="ambient-art" style={{ backgroundImage: `url(${JSON.stringify(coverUrl)})` }} />}
    <div className="ambient-orb ambient-orb-one"/><div className="ambient-orb ambient-orb-two"/><div className="ambient-orb ambient-orb-three"/>
    <div className="ambient-shade"/>
  </div>;
}
