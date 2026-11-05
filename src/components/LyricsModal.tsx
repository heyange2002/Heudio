import { useEffect, useRef } from 'react';
import { Pause, Play, X } from 'lucide-react';
import type { LyricLine } from '../types/music';
import { LyricsView, type LyricStyle } from './LyricsView';
import { AmbientBackdrop } from './AmbientBackdrop';
import { TrackCover } from './TrackCover';
import { formatTime } from '../utils/sceneAnalyzer';

export function LyricsModal({isOpen,onClose,title,artist,coverUrl,trackId,isPlaying=false,motionEnabled=true,onTogglePlay,duration=0,...lyricsProps}:{isOpen:boolean;onClose:()=>void;title:string;artist:string;lyrics:LyricLine[];currentTime:number;onSeek:(seconds:number)=>void;accentColor:string;coverUrl?:string;trackId?:string;isPlaying?:boolean;motionEnabled?:boolean;onTogglePlay?:()=>void;duration?:number;lyricStyle?:LyricStyle;onStyleChange?:(style:LyricStyle)=>void}) {
  const dialogRef=useRef<HTMLDivElement>(null),closeRef=useRef<HTMLButtonElement>(null);
  const latestClose=useRef(onClose);latestClose.current=onClose;
  useEffect(()=>{
    if(!isOpen)return;
    const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';closeRef.current?.focus();
    const keydown=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();latestClose.current();}
      if(event.key!=='Tab')return;
      const controls=dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]');
      if(!controls?.length)return;
      const first=controls[0],last=controls[controls.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    window.addEventListener('keydown',keydown);
    return()=>{document.body.style.overflow=overflow;window.removeEventListener('keydown',keydown);if(previous?.isConnected)previous.focus();};
  },[isOpen]);
  if(!isOpen)return null;
  return <div className="lyrics-modal-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="lyrics-modal-title" className="lyrics-stage">
      <AmbientBackdrop accentColor={lyricsProps.accentColor} coverUrl={coverUrl} isPlaying={isPlaying} motionEnabled={motionEnabled}/>
      <header className="lyrics-stage-header window-drag-region">
        <span className="text-xs tracking-[.3em] text-stone-400">SOUNDISLE <span className="hidden sm:inline"> / 此刻沉浸</span></span>
        <button ref={closeRef} type="button" aria-label="关闭完整歌词" onClick={onClose} className="lyrics-close"><X className="h-5 w-5"/></button>
      </header>
      <div className="lyrics-stage-content">
        <div className="lyrics-stage-album">
          {coverUrl && <TrackCover trackId={trackId || title} src={coverUrl} alt={title} className="lyrics-stage-cover"/>}
          <div className="min-w-0"><p className="mb-3 text-[10px] tracking-[.3em] text-stone-400 hidden md:block">NOW PLAYING</p><h2 id="lyrics-modal-title" className="text-xl md:text-3xl font-semibold text-stone-100 text-balance">{title}</h2><p className="mt-2 text-sm text-stone-400">{artist} · 完整歌词</p></div>
        </div>
        <LyricsView {...lyricsProps} immersive isPlaying={isPlaying} motionEnabled={motionEnabled} duration={duration}/>
      </div>
      <footer className="lyrics-stage-player">
        {onTogglePlay && <button type="button" aria-label={isPlaying ? '暂停播放' : '继续播放'} onClick={onTogglePlay} className="lyrics-play">{isPlaying ? <Pause className="h-5 w-5"/> : <Play className="h-5 w-5"/>}</button>}
        <span className="lyrics-player-time">{formatTime(lyricsProps.currentTime)}</span>
        <input aria-label="沉浸歌词播放进度" type="range" min="0" max={duration || 1} step="0.1" value={Math.min(lyricsProps.currentTime,duration || 1)} disabled={!duration} onChange={e=>lyricsProps.onSeek(Number(e.target.value))} style={{accentColor:lyricsProps.accentColor}} className="min-w-0 flex-1"/>
        <span className="lyrics-player-time">{formatTime(duration)}</span>
      </footer>
    </div>
  </div>;
}
