import { useEffect, useRef, type ReactNode } from 'react';
import { ListMusic, PanelLeftClose } from 'lucide-react';

export function MusicSidebar({isOpen,onToggle,onClose,count,children,motionEnabled=true}:{isOpen:boolean;onToggle:()=>void;onClose:()=>void;count:number;children:ReactNode;motionEnabled?:boolean}) {
  const toggleRef=useRef<HTMLButtonElement>(null),closeRef=useRef<HTMLButtonElement>(null);
  const latestClose=useRef(onClose);latestClose.current=onClose;
  useEffect(()=>{
    if(!isOpen)return;
    closeRef.current?.focus();
    const keydown=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();latestClose.current();}};
    window.addEventListener('keydown',keydown);
    return()=>{window.removeEventListener('keydown',keydown);toggleRef.current?.focus();};
  },[isOpen]);
  return <>
    <button ref={toggleRef} type="button" aria-label={isOpen?'收起音乐侧栏':'展开音乐侧栏'} aria-expanded={isOpen} aria-controls="music-sidebar"
      onClick={onToggle} data-motion={motionEnabled?'on':'off'} className={`music-entry fixed top-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-2 rounded-2xl border border-stone-700/80 bg-stone-900/90 px-2.5 py-4 text-xs text-stone-300 backdrop-blur-xl hover:text-amber-200 ${isOpen?'invisible':''}`}>
      <ListMusic className="h-5 w-5 text-amber-300"/><span>音乐</span>{count>0&&<span className="text-[10px] tabular-nums text-stone-500">{count} 首</span>}
    </button>
    <button type="button" tabIndex={-1} aria-label="收起音乐侧栏遮罩" aria-hidden={!isOpen} inert={!isOpen} onClick={onClose} data-motion={motionEnabled?'on':'off'} className={`music-sidebar-backdrop fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden ${isOpen?'is-open':''}`}/>
    <aside id="music-sidebar" aria-label="音乐侧栏" aria-hidden={!isOpen} inert={!isOpen} data-motion={motionEnabled?'on':'off'}
      className={`music-sidebar fixed left-3 top-24 bottom-36 z-40 w-[min(26rem,calc(100vw-1.5rem))] flex flex-col overflow-hidden rounded-2xl border border-stone-700/80 bg-stone-950/95 shadow-2xl backdrop-blur-xl ${isOpen?'is-open':''}`}>
      <div className="flex shrink-0 items-center justify-between border-b border-stone-800 px-5 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold"><ListMusic className="h-4 w-4 text-amber-300"/>音乐与队列</span>
        <button ref={closeRef} type="button" aria-label="收起音乐侧栏" onClick={onClose} className="rounded-lg p-2 text-stone-400 hover:bg-stone-800 hover:text-stone-100"><PanelLeftClose className="h-4 w-4"/></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-3">{children}</div>
    </aside>
  </>;
}
