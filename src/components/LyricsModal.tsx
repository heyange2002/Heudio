import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { LyricLine } from '../types/music';
import { LyricsView } from './LyricsView';

export function LyricsModal({isOpen,onClose,title,artist,...lyricsProps}:{isOpen:boolean;onClose:()=>void;title:string;artist:string;lyrics:LyricLine[];currentTime:number;onSeek:(seconds:number)=>void;accentColor:string}) {
  const dialogRef=useRef<HTMLDivElement>(null),closeRef=useRef<HTMLButtonElement>(null);
  const latestClose=useRef(onClose);latestClose.current=onClose;
  useEffect(()=>{
    if(!isOpen)return;
    const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';closeRef.current?.focus();
    const keydown=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();latestClose.current();}
      if(event.key!=='Tab')return;
      const controls=dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]),[href],input,select,textarea,[tabindex="0"]');
      if(!controls?.length)return;
      const first=controls[0],last=controls[controls.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    window.addEventListener('keydown',keydown);
    return()=>{document.body.style.overflow=overflow;window.removeEventListener('keydown',keydown);if(previous?.isConnected)previous.focus();};
  },[isOpen]);
  if(!isOpen)return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="lyrics-modal-title" className="w-full max-w-3xl max-h-[90dvh] overflow-y-auto rounded-3xl border border-stone-700/70 bg-stone-950 p-4 sm:p-6 shadow-2xl">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0"><h2 id="lyrics-modal-title" className="truncate text-lg font-semibold">{title}</h2><p className="mt-1 truncate text-sm text-stone-400">{artist} · 完整歌词</p></div>
        <button ref={closeRef} type="button" aria-label="关闭完整歌词" onClick={onClose} className="rounded-lg p-2 text-stone-400 hover:bg-stone-800 hover:text-stone-100"><X className="h-5 w-5"/></button>
      </div>
      <LyricsView {...lyricsProps} immersive/>
    </div>
  </div>;
}
