import { MusicQueue } from './MusicQueue';
import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api';
import type { QQSong } from '../utils/music';
import { TrackCover } from './TrackCover';
export function QQMusicPanel({ onPlay, onQueue, queue, queueTitle, onRecommend, currentMid, isPlaying }: {
  onPlay: (song: QQSong) => void; onQueue: (songs: QQSong[], title: string) => void;
  queue: QQSong[]; queueTitle: string; onRecommend: () => void; currentMid?: string; isPlaying?: boolean;
}) {
  const [status, setStatus] = useState('正在检查 QQ 音乐…'), [loggedIn, setLoggedIn] = useState(false);
  const [keyword, setKeyword] = useState(''), [songs, setSongs] = useState<QQSong[]>([]), [busy, setBusy] = useState(false);
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [error, setError] = useState('');
  const mounted = useRef(true), generation = useRef(0), statusGeneration = useRef(0);
  const call = async (path: string, options?: RequestInit) => {
    const timeout = AbortSignal.timeout(30000);
    const response = await apiFetch('/api/music' + path, { ...options, signal: options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout }); const data = await response.json();
    if (!response.ok) throw Error(data.error || '音乐服务暂时不可用'); return data;
  };
  const refresh = async () => {
    const version = ++statusGeneration.current;
    const login = await call('/login/status');
    if (!mounted.current || version !== statusGeneration.current) return;
    const profile = login.data?.profile; setLoggedIn(!!profile);
    setStatus(profile ? 'QQ 音乐已授权' : '搜索可匿名使用 · 播放与个人推荐请在设置中授权 QQ 音乐');
  };
  useEffect(() => {
    mounted.current = true;
    const update = () => { refresh().catch(e => { if (mounted.current) { setStatus('暂时无法确认 QQ 音乐连接'); setError(e.message); } }); };
    update(); window.addEventListener('soundisle:music-auth-changed', update);
    return () => { mounted.current = false; generation.current++; statusGeneration.current++; window.removeEventListener('soundisle:music-auth-changed', update); };
  }, []);
  useEffect(() => {
    if (!loggedIn) return;
    const renew = () => { call('/login/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {}); };
    renew(); const timer = setInterval(renew, 30 * 60000); return () => clearInterval(timer);
  }, [loggedIn]);
  const run = async (action: () => Promise<void>) => {
    if (busy) return; setBusy(true); setError(''); const version = ++generation.current;
    try { await action(); } catch (e) { if (mounted.current && version === generation.current) setError(e instanceof Error ? e.message : '请求失败'); }
    finally { if (mounted.current && version === generation.current) setBusy(false); }
  };
  const loadSongs = (path: string) => run(async () => { const data = await call(path); if (!mounted.current) return; setSongs(data.songs || []); setPlaylists([]); setStatus(data.songs?.length ? `找到 ${data.songs.length} 首歌曲` : '这次没有查到歌曲，可以换个关键词'); });
  const input = 'rounded-lg border border-stone-700 bg-stone-950 p-2 text-sm';
  return <section aria-label="QQ 音乐" className="rounded-2xl border border-stone-800 bg-stone-900/60 p-5 space-y-4">
    <div><h2 className="text-base font-semibold">QQ 音乐 · 和阿屿一起选歌</h2><p role="status" className="text-xs text-stone-400 mt-1">{status}</p></div>
    <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); if (keyword.trim()) void loadSongs('/search?keyword=' + encodeURIComponent(keyword.trim())); }}>
      <input aria-label="搜索 QQ 音乐" className={input + ' flex-1 min-w-40'} maxLength={60} placeholder="搜索歌曲、歌手，也可以直接告诉阿屿想听什么" value={keyword} onChange={e => setKeyword(e.target.value)}/><button disabled={busy || !keyword.trim()} className="rounded-lg bg-amber-400 text-stone-950 px-4 text-sm">{busy ? '查询中…' : '搜索'}</button>
    </form>
    <div className="flex flex-wrap gap-4 text-xs text-amber-300"><button disabled={busy} onClick={() => void loadSongs('/user/daily-songs')}>每日推荐</button><button disabled={busy} onClick={() => void loadSongs('/user/liked-songs')}>我喜欢</button>
      <button disabled={busy} onClick={() => run(async () => { const data = await call('/user/playlist'); setPlaylists(data.playlist || []); setSongs([]); setStatus(data.playlist?.length ? '选择一张歌单查看歌曲' : '暂无歌单'); })}>我的歌单</button>
      <button onClick={onRecommend}>让阿屿为此刻编排</button></div>
    {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
    {!!playlists.length && <div className="flex flex-wrap gap-2">{playlists.map((p,i) => <button key={p.tid || p.dirid || i} className={input} disabled={busy} onClick={() => run(async () => {
      const tid = p.tid ?? p.dissid; const dirid = p.dirid;
      let data;
      try { data = await call('/user/playlist-detail?' + (tid ? 'tid=' + encodeURIComponent(tid) : 'dirid=' + encodeURIComponent(dirid))); }
      catch (error) { if (!tid) throw error; data = await call('/getSongListDetail?disstid=' + encodeURIComponent(tid)); }
      const { normalizeSongs } = await import('../../shared/music-normalize.mjs'); setSongs(normalizeSongs(data));
    })}>{p.title || p.dissname || '未命名歌单'}</button>)}</div>}
    {!!songs.length && <div><div className="flex justify-between mb-2"><h3 className="text-xs text-stone-400">查询结果</h3><button className="text-xs text-amber-300" onClick={() => onQueue(songs, keyword || 'QQ 音乐选集')}>用这些歌组成队列</button></div>
      <div className="max-h-64 overflow-y-auto grid sm:grid-cols-2 gap-2">{songs.map(song => <button key={song.mid} className="flex gap-3 items-center text-left p-2 rounded-xl hover:bg-stone-800" onClick={() => onPlay(song)}><TrackCover trackId={'qq:'+song.mid} src={song.coverUrl} alt={song.title} className="w-10 h-10 rounded-lg"/><span className="min-w-0"><span className="block text-sm truncate">{song.title}</span><span className="block text-xs text-stone-400 truncate">{song.artist}</span></span><span className="ml-auto text-xs text-amber-300">播放</span></button>)}</div></div>}
    <MusicQueue songs={queue} title={queueTitle} currentMid={currentMid} isPlaying={isPlaying} onPlay={onPlay}/>
  </section>;
}
