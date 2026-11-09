import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { AgentMessage, SceneMode } from '../types/music';
import { Send, Volume2, RefreshCw, Square, LoaderCircle, Play, Mic, X } from 'lucide-react';
import type { SpeechState } from '../utils/speechPlayer';
import { VoiceInput, type VoiceInputState } from '../utils/voiceInput';
import { CompanionContext } from './CompanionContext';
import { notifyError } from './AppNotifications';

interface AgentCompanionProps {
  messages: AgentMessage[];
  onPlaylistAction?: (playlist: NonNullable<AgentMessage['playlist']>, action: 'play' | 'enqueue', scene?: SceneMode) => void;
  onSendMessage: (text: string) => void;
  isLoading: boolean;
  onApplyScene: (sceneId: SceneMode) => void;
  currentScene: SceneMode;
  weatherText: string;
  timeContextText: string;
  city?: string;
  workState?: string;
  motionEnabled?: boolean;
  onSpeakMessage?: (text: string) => void;
  speechState?: SpeechState;
  onStopSpeech?: () => void;
  onListeningChange?: (active: boolean) => void;
}

export const AgentCompanion: React.FC<AgentCompanionProps> = ({
  messages,
  onPlaylistAction,
  onSendMessage,
  isLoading,
  onApplyScene,
  currentScene,
  weatherText,
  timeContextText,
  city,
  workState,
  motionEnabled = true,
  onSpeakMessage,
  speechState,
  onStopSpeech,
  onListeningChange,
}) => {
  const [inputText, setInputText] = useState('');
  const [voiceInput, setVoiceInput] = useState<VoiceInputState>({status:'idle'});
  const latest = useRef({onSendMessage,isLoading,onListeningChange,inputText});
  latest.current={onSendMessage,isLoading,onListeningChange,inputText};
  const recorder=useMemo(()=>new VoiceInput(setVoiceInput,text=>{
    const message=[latest.current.inputText.trim(),text].filter(Boolean).join(' ');
    setInputText(message);
    if(!latest.current.isLoading){latest.current.onSendMessage(message);setInputText('');}
  }),[]);
  const recording=voiceInput.status==='recording';
  useEffect(() => { if (voiceInput.error) notifyError(voiceInput.error); }, [voiceInput.error]);
  const voiceBusy=['requesting','recording','processing'].includes(voiceInput.status);
  const messageListRef = useRef<HTMLDivElement>(null);
  const messageContentRef = useRef<HTMLDivElement>(null);
  const followLatestMessage = () => {
    const list = messageListRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  };
  useLayoutEffect(followLatestMessage, [messages, isLoading, speechState?.status, voiceInput.status]);
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(followLatestMessage);
    if (messageListRef.current) observer.observe(messageListRef.current);
    if (messageContentRef.current) observer.observe(messageContentRef.current);
    return () => observer.disconnect();
  }, []);
  useEffect(()=>()=>{recorder.cancel(false);latest.current.onListeningChange?.(false);},[recorder]);
  useEffect(()=>{latest.current.onListeningChange?.(recording);},[recording]);
  useEffect(()=>{if(isLoading&&voiceBusy)recorder.cancel();},[isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading || voiceBusy) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  return (
    <div className="w-full rounded-2xl border border-stone-800/80 bg-stone-900/60 backdrop-blur-md p-5 flex flex-col h-[min(580px,calc(100dvh-15rem))] min-h-[360px] md:h-auto md:min-h-0 md:flex-1">
      {/* Header with context indicators */}
      <div className="agent-context-header pb-3 mb-3 border-b border-stone-800/60 text-xs text-stone-400">
        <div className="agent-identity">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span className="font-semibold text-stone-200">阿屿 · 你的音乐陪伴者</span>
          <span aria-hidden="true">·</span>
          <span>听你说，为你选歌</span>
        </div>
        <CompanionContext weatherText={weatherText} timeContextText={timeContextText} city={city} workState={workState}/>
      </div>

      {/* Messages Stream */}
      <div ref={messageListRef} role="log" aria-label="与阿屿的对话记录" className="flex-1 min-h-0 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-stone-800 py-1">
        <div ref={messageContentRef} className="space-y-4">
        {messages.map((msg) => {
          const isAgent = msg.role === 'agent';
          const speechStatus = speechState?.text === msg.content ? speechState.status : 'idle';
          const active = speechStatus === 'loading' || speechStatus === 'playing';
          const speechLabel = speechStatus === 'loading' ? '取消语音生成' : speechStatus === 'playing' ? '停止朗读' : speechStatus === 'ready' ? '播放语音' : '语音朗读陪伴';
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isAgent ? 'items-start' : 'items-end'}`}
            >
              <div
                className={`max-w-[88%] rounded-2xl p-4 text-sm leading-relaxed transition-all ${
                  isAgent
                    ? 'bg-stone-800/90 text-stone-100 border border-stone-700/60 rounded-tl-sm shadow-md'
                    : 'bg-amber-500/20 text-amber-100 border border-amber-500/30 rounded-tr-sm'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-1">
                  <span className="text-[11px] font-medium text-stone-400">
                    {isAgent ? '声屿 Agent' : '我'}
                  </span>
                  {isAgent && onSpeakMessage && (
                    <button
                      onClick={() => onSpeakMessage(msg.content)}
                      title={speechLabel}
                      aria-label={speechLabel}
                      aria-pressed={active}
                      className="text-stone-400 hover:text-amber-300 p-0.5 rounded transition-colors"
                    >
                      {speechStatus === 'loading' ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : active ? <Square className="w-3.5 h-3.5" /> : speechStatus === 'ready' ? <Play className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>

                <p className="whitespace-pre-wrap">{msg.content}</p>
                {isAgent && msg.playlist?.songs.length ? <div className="mt-3 rounded-xl border border-stone-600/60 p-3" aria-label="推荐歌单">
                  <p className="font-medium text-amber-200">{msg.playlist.title}</p>
                  <ol className="mt-2 space-y-1 text-xs text-stone-300">
                    {msg.playlist.songs.map((song, i) => <li key={song.mid}>{i + 1}. {song.title} · {song.artist}</li>)}
                  </ol>
                  <div className="mt-3 flex gap-3 text-xs text-amber-200">
                    <button type="button" onClick={() => onPlaylistAction?.(msg.playlist!, 'play', msg.playlistScene)}>播放歌单</button>
                    <button type="button" onClick={() => onPlaylistAction?.(msg.playlist!, 'enqueue', msg.playlistScene)}>追加到当前歌单</button>
                  </div>
                </div> : null}

              </div>
              <span className="text-[10px] text-stone-500 mt-1 px-1">
                {msg.timestamp}
              </span>
            </div>
          );
        })}

        </div>
      </div>

      {speechState && speechState.status !== 'idle' && !speechState.error && (
        <div role="status" aria-live="polite" className="flex items-center justify-between gap-2 mt-2 text-xs text-stone-400">
          <span className="flex items-center gap-2">{!speechState.error && <span className={`speech-activity ${motionEnabled && (speechState.status === 'playing' || speechState.status === 'loading') ? 'is-active' : ''}`} aria-hidden="true"><i/><i/><i/><i/><i/></span>}{speechState.error?.replace(/MiniMax/gi, '语音服务') || '阿屿在这里，轻声陪你'}</span>
          {(speechState.status === 'playing' || speechState.status === 'loading' || speechState.status === 'ready') && <button type="button" onClick={onStopSpeech} className="shrink-0 text-amber-300">{speechState.status === 'loading' ? '取消' : '停止'}</button>}
        </div>
      )}

      {/* Input Box */}
      {voiceBusy ? <div role="status" aria-live="polite" className="flex items-center gap-2 mt-2 text-xs text-amber-200">
        <span className="flex-1">{voiceInput.error || (recording?'正在听你说 · 再点麦克风结束并发送（最长60秒）':voiceInput.status==='requesting'?'正在请求麦克风权限…':'正在识别你说的话…')}</span>
        {voiceBusy&&<button type="button" aria-label="取消语音输入" className="p-1 text-stone-400" onClick={()=>recorder.cancel()}><X className="h-4 w-4"/></button>}
      </div> : null}
      {isLoading && (
        <div role="status" aria-live="polite" className="agent-response-progress shrink-0 flex items-center gap-2 mt-2 text-xs text-stone-400 p-3 bg-stone-800/40 rounded-xl animate-pulse">
          <RefreshCw aria-hidden="true" className="w-3.5 h-3.5 shrink-0 animate-spin text-amber-400" />
          <span>声屿正在体会你的心境并构筑音乐声景...</span>
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 mt-2">
        <input
          type="text"
          aria-label="与阿屿交流"
          disabled={voiceBusy}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="描述当下状态，如：刚下班想闭目听会儿琴声、准备入睡..."
          className="min-w-0 flex-1 px-4 py-3 rounded-xl bg-stone-800/90 border border-stone-700/80 text-sm text-stone-100 placeholder-stone-400 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/50 transition-all"
        />
        <button type="button" aria-label={recording?'结束录音并发送':'开始语音交流'} aria-pressed={recording}
          title={recording?'结束录音并发送':'点击说话'} disabled={isLoading||['requesting','processing'].includes(voiceInput.status)}
          onClick={()=>{if(recording)recorder.stop();else{onStopSpeech?.();void recorder.start();}}}
          className={`shrink-0 p-3 rounded-xl border transition-colors disabled:opacity-30 ${recording?'bg-rose-400/20 border-rose-400 text-rose-300':'bg-stone-800 border-stone-700 text-amber-300 hover:bg-stone-700'}`}>
          {voiceInput.status==='processing'?<LoaderCircle className="w-4 h-4 animate-spin"/>:recording?<Square className="w-4 h-4"/>:<Mic className="w-4 h-4"/>}
        </button>
        <button
          type="submit"
          disabled={!inputText.trim() || isLoading || voiceBusy}
          aria-label="发送需求给 Agent"
          className="shrink-0 p-3 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-30 disabled:hover:bg-amber-400 text-stone-950 transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
      <p className="text-[10px] text-stone-500 mt-1.5">点击麦克风开始说话，再点结束后自动发送。</p>
    </div>
  );
};
