import React, { useEffect, useRef } from 'react';
import { X, RotateCcw } from 'lucide-react';
import { DEFAULT_EQ, EQ_BANDS, EQ_PRESETS, type EqualizerSettings } from '../utils/equalizer';
export function EqualizerDrawer({ isOpen, onClose, settings, onChange }: { isOpen: boolean; onClose: () => void; settings: EqualizerSettings; onChange: (settings: EqualizerSettings) => void }) {
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    panel.current?.focus();
    const keydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab') {
        const controls = panel.current?.querySelectorAll<HTMLElement>('button,input');
        if (!controls?.length) return;
        const first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = overflow; window.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [isOpen]);
  if (!isOpen) return null;
  const preset = EQ_PRESETS.find(p => p.gains.every((g, i) => g === settings.gains[i]));
  const update = (partial: Partial<EqualizerSettings>) => onChange({ ...settings, ...partial });
  return <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-6" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="eq-title" className="w-full max-w-lg rounded-2xl border border-stone-700 bg-stone-900 p-5 sm:p-6 space-y-6 max-h-[85dvh] overflow-y-auto outline-none">
      <div className="flex items-start justify-between gap-4"><div><h2 id="eq-title" className="text-lg font-semibold">EQ 声场</h2><p className="mt-1 text-xs text-stone-400">为当前音乐调出你喜欢的听感</p></div><button aria-label="关闭 EQ 声场" onClick={onClose} className="p-2 text-stone-400 hover:text-white"><X className="w-5 h-5"/></button></div>
      <label className="flex items-center justify-between text-sm"><span>启用 EQ</span><input type="checkbox" checked={settings.enabled} onChange={e => update({ enabled: e.target.checked })} className="accent-amber-400 w-4 h-4"/></label>
      <div className={`space-y-5 ${settings.enabled ? '' : 'opacity-40'}`}>
        <div className="flex flex-wrap gap-2">{EQ_PRESETS.map(p => <button key={p.name} disabled={!settings.enabled} aria-pressed={preset?.name === p.name} onClick={() => update({ gains: [...p.gains] })} className={`px-3 py-2 rounded-lg text-xs border ${preset?.name === p.name ? 'border-amber-400/60 bg-amber-400/10 text-amber-300' : 'border-stone-700 text-stone-400'}`}>{p.name}</button>)}</div>
        <div className="space-y-4">{EQ_BANDS.map((band, i) => <label key={band.frequency} className="block"><div className="flex items-center justify-between text-xs mb-2"><span className="text-stone-300">{band.name} <span className="text-stone-500 ml-1">{band.label}</span></span><output className="font-mono text-amber-300">{settings.gains[i] > 0 ? '+' : ''}{settings.gains[i]} dB</output></div><input aria-label={`${band.name}增益`} type="range" min={-12} max={12} step={1} disabled={!settings.enabled} value={settings.gains[i]} onChange={e => update({ gains: settings.gains.map((gain, index) => index === i ? Number(e.target.value) : gain) })} className="w-full accent-amber-400"/></label>)}</div>
        <label className="block border-t border-stone-800 pt-4"><span className="text-xs text-stone-300">左右声场平衡</span><input aria-label="左右声场平衡" type="range" min={-1} max={1} step={0.05} disabled={!settings.enabled} value={settings.balance} onChange={e => update({ balance: Number(e.target.value) })} className="w-full accent-amber-400 mt-3"/><span className="flex justify-between text-[11px] text-stone-500"><span>左</span><output>{settings.balance === 0 ? '居中' : `${settings.balance < 0 ? '偏左' : '偏右'} ${Math.round(Math.abs(settings.balance) * 100)}%`}</output><span>右</span></span></label>
      </div>
      <button className="text-xs text-stone-400 hover:text-amber-300 flex items-center gap-2" onClick={() => onChange({ ...DEFAULT_EQ, gains: [...DEFAULT_EQ.gains] })}><RotateCcw className="w-3.5 h-3.5"/>恢复原声与居中声场</button>
      <p className="text-[11px] text-stone-500">听感设置自动保存在当前浏览器，切歌后继续生效。</p>
    </div>
  </div>;
}
