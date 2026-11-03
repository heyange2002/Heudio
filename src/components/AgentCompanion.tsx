import React, { useState } from 'react';
import { AgentMessage, SceneMode } from '../types/music';
import { Send, Sparkles, Volume2, ArrowRight, CornerDownLeft, RefreshCw, Sliders, Square, LoaderCircle, Play } from 'lucide-react';
import type { SpeechState } from '../utils/speechPlayer';

interface AgentCompanionProps {
  messages: AgentMessage[];
  onSendMessage: (text: string) => void;
  isLoading: boolean;
  onApplyScene: (sceneId: SceneMode) => void;
  currentScene: SceneMode;
  weatherText: string;
  timeContextText: string;
  onSpeakMessage?: (text: string) => void;
  speechState?: SpeechState;
  onStopSpeech?: () => void;
}

const PRESET_INTENTS = [
  '深夜写代码，需要深度专注心流',
  '刚下班有点累，想在窗边放空片刻',
  '晨起慢跑，需要明快稳健的节拍',
  '准备入睡了，请换最轻柔的声音',
];

const CORRECTION_CHIPS = [
  '换成纯钢琴独奏',
  '去掉节拍鼓点，更安静些',
  '稍微轻柔一点',
  '调大窗外的雨声',
  '节奏再快一点',
];

export const AgentCompanion: React.FC<AgentCompanionProps> = ({
  messages,
  onSendMessage,
  isLoading,
  onApplyScene,
  currentScene,
  weatherText,
  timeContextText,
  onSpeakMessage,
  speechState,
  onStopSpeech,
}) => {
  const [inputText, setInputText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  const handleChipClick = (chip: string) => {
    if (isLoading) return;
    onSendMessage(chip);
  };

  return (
    <div className="w-full rounded-2xl border border-stone-800/80 bg-stone-900/60 backdrop-blur-md p-5 flex flex-col h-[520px] lg:h-[580px]">
      {/* Header with context indicators */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-stone-800/60 text-xs text-stone-400">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span className="font-semibold text-stone-200">声屿 Companion Agent</span>
          <span aria-hidden="true">·</span>
          <span>适度对话陪伴</span>
        </div>
        <div className="flex items-center gap-2 text-stone-400 text-[11px]">
          <span>{weatherText}</span>
          <span aria-hidden="true">/</span>
          <span>{timeContextText}</span>
        </div>
      </div>

      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin scrollbar-thumb-stone-800 py-1">
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

                {/* Rationale & Scene Adjustments if present */}
                {isAgent && msg.rationale && (
                  <div className="mt-2.5 pt-2 border-t border-stone-700/50 text-xs text-stone-400 flex items-start gap-1.5">
                    <span className="text-amber-400/90 shrink-0">编排思路:</span>
                    <span>{msg.rationale}</span>
                  </div>
                )}

                {/* Suggested follow-up action buttons */}
                {isAgent && msg.quickActions && msg.quickActions.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5 pt-1">
                    {msg.quickActions.map((action, i) => (
                      <button
                        key={i}
                        onClick={() => handleChipClick(action)}
                        className="px-2.5 py-1 text-xs rounded-md bg-stone-700/60 hover:bg-stone-700 text-stone-300 hover:text-white transition-colors border border-stone-600/40"
                      >
                        {action}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <span className="text-[10px] text-stone-500 mt-1 px-1">
                {msg.timestamp}
              </span>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-stone-400 p-3 bg-stone-800/40 rounded-xl max-w-xs animate-pulse">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
            <span>声屿正在体会你的心境并构筑音乐声景...</span>
          </div>
        )}
      </div>

      {/* Quick Suggestions & Corrections */}
      <div className="pt-2 pb-1 border-t border-stone-800/60 space-y-2">
        <div className="flex items-center justify-between text-[11px] text-stone-400">
          <span>纠正推荐 / 微调心境</span>
          <span className="text-stone-500">点击即时调整</span>
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {CORRECTION_CHIPS.map((chip, idx) => (
            <button
              key={idx}
              onClick={() => handleChipClick(chip)}
              className="px-2.5 py-1 text-xs rounded-full bg-stone-800/80 hover:bg-stone-700 text-stone-300 hover:text-amber-200 transition-colors border border-stone-700/50 whitespace-nowrap shrink-0"
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      {speechState && speechState.status !== 'idle' && (
        <div role="status" aria-live="polite" className="flex items-center justify-between gap-2 mt-2 text-xs text-stone-400">
          <span>{speechState.error || (speechState.status === 'loading' ? '正在生成 MiniMax 语音…' : 'MiniMax 正在朗读 · AI 合成声音')}</span>
          {(speechState.status === 'playing' || speechState.status === 'loading' || speechState.status === 'ready') && <button type="button" onClick={onStopSpeech} className="shrink-0 text-amber-300">{speechState.status === 'loading' ? '取消' : '停止'}</button>}
        </div>
      )}

      {/* Input Box */}
      <form onSubmit={handleSubmit} className="relative mt-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="描述当下状态，如：刚下班想闭目听会儿琴声、准备入睡..."
          className="w-full pl-4 pr-12 py-3 rounded-xl bg-stone-800/90 border border-stone-700/80 text-sm text-stone-100 placeholder-stone-400 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/50 transition-all"
        />
        <button
          type="submit"
          disabled={!inputText.trim() || isLoading}
          aria-label="发送需求给 Agent"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-amber-400 hover:bg-amber-300 disabled:opacity-30 disabled:hover:bg-amber-400 text-stone-950 transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
