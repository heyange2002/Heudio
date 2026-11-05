import { Play, AudioLines } from 'lucide-react';
import { TrackCover } from './TrackCover';
import type { QQSong } from '../utils/music';
import { formatTime } from '../utils/sceneAnalyzer';
export function MusicQueue({songs,title,currentMid,isPlaying,onPlay}:{songs:QQSong[];title:string;currentMid?:string;isPlaying?:boolean;onPlay:(song:QQSong)=>void}) {
  if(!songs.length)return null;
  return <section aria-label="播放队列" className="border-t border-stone-800 pt-4 space-y-3">
    <div className="flex items-baseline justify-between gap-3"><h3 className="text-sm font-semibold text-amber-200 truncate">{title}</h3><div className="flex shrink-0 items-center gap-3"><span className="text-xs text-stone-500">{songs.length} 首</span><button type="button" aria-label="播放当前歌单" onClick={()=>onPlay(songs[0])} className="flex items-center gap-1 text-xs text-amber-300"><Play className="h-3.5 w-3.5" aria-hidden="true"/>播放歌单</button></div></div>
    <ol className="max-h-96 overflow-y-auto space-y-1 pr-1">
      {songs.map((song,index)=>{const active=song.mid===currentMid;return <li key={song.mid}>
        <button type="button" aria-label={`播放 ${song.title} · ${song.artist}`} aria-current={active?'true':undefined} onClick={()=>onPlay(song)}
          className={`w-full grid grid-cols-[1.5rem_2.5rem_minmax(0,1fr)_2rem] sm:grid-cols-[1.5rem_2.5rem_minmax(0,1fr)_3rem_2rem] gap-3 items-center rounded-xl p-2.5 text-left transition-colors ${active?'bg-amber-400/10':'hover:bg-stone-800/70'}`}>
          <span className="text-xs tabular-nums text-stone-500 text-center">{index+1}</span>
          <TrackCover trackId={'qq:'+song.mid} src={song.coverUrl} alt="" className="h-10 w-10 rounded-lg object-cover"/>
          <span className="min-w-0 space-y-0.5"><span title={song.title} className={`block truncate text-sm ${active?'text-amber-200':'text-stone-200'}`}>{song.title}</span><span title={song.artist} className="block truncate text-xs text-stone-500">{song.artist}</span></span>
          <span className="hidden sm:block text-right text-xs tabular-nums text-stone-500">{formatTime(song.duration||0)}</span>
          <span className="justify-self-center text-amber-300">{active&&isPlaying?<AudioLines aria-label="正在播放" className="h-4 w-4"/>:<Play aria-hidden="true" className="h-4 w-4"/>}</span>
        </button>
      </li>;})}
    </ol>
  </section>;
}
