import React from 'react';
import { Music, Settings } from 'lucide-react';
interface TopBarProps {
  onHome: () => void;
  pureMusicMode: boolean;
  onTogglePureMusic: () => void;
  onOpenSettings: () => void;
}
export const TopBar: React.FC<TopBarProps> = ({ onHome, pureMusicMode, onTogglePureMusic, onOpenSettings }) => (
  <header className="sticky top-0 z-40 w-full backdrop-blur-xl bg-stone-950/80 border-b border-stone-800/60">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 min-h-16 py-3 flex items-center justify-between gap-3">
      <a href="#home" onClick={e => { e.preventDefault(); onHome(); }} className="text-base sm:text-lg font-bold tracking-tight text-stone-100 hover:text-amber-300 flex items-center gap-2">
        <img src="/brand/soundisle.svg" alt="" aria-hidden="true" className="w-9 h-9 shrink-0"/><span>声屿 SoundIsle</span><span className="rounded border border-stone-700 px-1.5 py-0.5 text-[10px] font-medium text-stone-400">PC 版</span>
      </a>
      <div aria-label="播放模式与设置" className="flex items-center gap-2 shrink-0">
        <button onClick={onTogglePureMusic} aria-label={pureMusicMode ? '退出纯音乐模式' : '开启只听音乐模式'} className={`px-3 py-2 text-xs rounded-lg flex items-center gap-2 ${pureMusicMode ? 'bg-amber-400 text-stone-950' : 'bg-stone-800 text-stone-200 border border-stone-700/60'}`}>
          <Music className="w-3.5 h-3.5"/><span>{pureMusicMode ? '返回陪伴' : '只听音乐'}</span>
        </button>
        <button onClick={onOpenSettings} className="px-3 py-2 rounded-lg text-xs text-stone-300 hover:bg-stone-800 flex items-center gap-1.5"><Settings className="w-4 h-4"/><span>设置</span></button>
      </div>
    </div>
  </header>
);
