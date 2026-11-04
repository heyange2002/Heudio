import React from 'react';
import { Volume2, Sparkles, Moon, Sun, SlidersHorizontal, Music } from 'lucide-react';

interface TopBarProps {
  activeSection: string;
  onSelectSection: (section: string) => void;
  pureMusicMode: boolean;
  onTogglePureMusic: () => void;
  onOpenSettings: () => void;
  onOpenMixer: () => void;
  currentSceneName: string;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeSection,
  onSelectSection,
  pureMusicMode,
  onTogglePureMusic,
  onOpenSettings,
  onOpenMixer,
  currentSceneName,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-xl bg-stone-950/80 border-b border-stone-800/60 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#home"
          onClick={(e) => {
            e.preventDefault();
            onSelectSection('home');
          }}
          className="text-lg font-bold tracking-tight text-stone-100 hover:text-amber-300 transition-colors whitespace-nowrap shrink-0 flex items-center gap-2"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400/80 inline-block" />
          <span>声屿 SoundIsle</span>
        </a>

        {/* Zone 2: 4 clean single-line nav links */}
        <nav aria-label="主要功能" className="hidden lg:flex items-center gap-7 text-sm font-medium text-stone-400">
          <button
            aria-current={activeSection === 'companion' ? 'page' : undefined}
            aria-controls="music-workspace"
            onClick={() => onSelectSection('companion')}
            className={`transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'companion' ? 'text-amber-300 font-semibold' : 'hover:text-stone-200'
            }`}
          >
            心境感知
          </button>
          <button
            aria-current={activeSection === 'visualizer' ? 'page' : undefined}
            aria-controls="music-workspace"
            onClick={() => onSelectSection('visualizer')}
            className={`transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'visualizer' ? 'text-amber-300 font-semibold' : 'hover:text-stone-200'
            }`}
          >
            声音律动
          </button>
          <button
            aria-current={activeSection === 'lyrics' ? 'page' : undefined}
            aria-controls="music-workspace"
            onClick={() => onSelectSection('lyrics')}
            className={`transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'lyrics' ? 'text-amber-300 font-semibold' : 'hover:text-stone-200'
            }`}
          >
            沉浸歌词
          </button>
          <button
            onClick={onOpenMixer}
            className="hover:text-stone-200 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
          >
            <span>自然音混音</span>
          </button>
          <button
            onClick={onOpenSettings}
            className="hover:text-stone-200 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
          >
            <span>设置</span>
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onTogglePureMusic}
            aria-label={pureMusicMode ? '退出纯音乐模式' : '开启只听音乐模式'}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-2 whitespace-nowrap shrink-0 ${
              pureMusicMode
                ? 'bg-amber-400 text-stone-950 shadow-md font-semibold'
                : 'bg-stone-800/90 text-stone-200 hover:bg-stone-700 border border-stone-700/60'
            }`}
          >
            <Music className="w-3.5 h-3.5" />
            <span>{pureMusicMode ? '纯音乐中 · 退出' : '只听音乐'}</span>
          </button>
        </div>
      </div>
      <nav aria-label="手机功能" className="lg:hidden flex gap-5 overflow-x-auto px-4 pb-3 text-xs text-stone-400">
        {([['companion','心境感知'],['visualizer','声音律动'],['lyrics','沉浸歌词']] as const).map(([section,label]) =>
          <button key={section} aria-controls="music-workspace" aria-current={activeSection === section ? 'page' : undefined}
            className={`shrink-0 ${activeSection === section ? 'text-amber-300' : ''}`} onClick={() => onSelectSection(section)}>{label}</button>)}
        <button className="shrink-0" onClick={onOpenMixer}>自然音混音</button>
        <button className="shrink-0" onClick={onOpenSettings}>设置</button>
      </nav>
    </header>
  );
};
