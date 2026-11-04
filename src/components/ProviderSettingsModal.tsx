import React, { useEffect, useState } from 'react';
import { apiFetch } from '../api';
import { SPEECH_MODELS, SPEECH_VOICES } from '../../shared/speech.mjs';
import { ServiceSettings } from '../types/music';
import { QQMusicSettings } from './QQMusicSettings';
import { CompanionProfile } from './CompanionProfile';
import { DEFAULT_AGENT_PROMPT, MAX_AGENT_PROMPT_LENGTH } from '../../shared/agent-policy.mjs';
import type { CompanionProfile as Profile } from '../utils/music';
import { X, Server, Cpu, Mic, Sliders, ShieldCheck } from 'lucide-react';

interface ProviderSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ServiceSettings;
  onUpdateSettings: (newSettings: Partial<ServiceSettings>) => void;
  profile?: Profile;
  onUpdateProfile?: (profile: Profile) => void;
  listeningCount?: number;
  onClearListening?: () => void;
  agentPrompt?: string;
  onUpdateAgentPrompt?: (prompt: string) => void;
}

export const ProviderSettingsModal: React.FC<ProviderSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  profile,
  onUpdateProfile,
  listeningCount = 0,
  onClearListening,
  agentPrompt = DEFAULT_AGENT_PROMPT,
  onUpdateAgentPrompt,
}) => {
  const [tab, setTab] = useState<'services' | 'personal' | 'agent'>('services');
  const [modelStatus, setModelStatus] = useState('正在检查陪伴模型…');
  const [voiceStatus, setVoiceStatus] = useState('正在检查语音服务…');
  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    setModelStatus('正在检查陪伴模型…');
    apiFetch('/api/agent/config', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw Error();
      const config = await response.json();
      if (!controller.signal.aborted) setModelStatus(config.configured ? 'MiniMax M3 已配置' : '尚未配置陪伴模型，当前使用规则回复');
    }).catch(() => { if (!controller.signal.aborted) setModelStatus('暂时无法确认陪伴模型状态，请检查连接'); });
    setVoiceStatus('正在检查语音服务…');
    apiFetch('/api/voice/config', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw Error();
      const config = await response.json();
      if (!controller.signal.aborted) setVoiceStatus(config.configured ? 'MiniMax 已配置 · AI 合成声音' : '尚未配置语音服务，请在后端设置 MiniMax API Key');
    }).catch(() => { if (!controller.signal.aborted) setVoiceStatus('暂时无法确认语音服务状态，请检查连接'); });
    return () => controller.abort();
  }, [isOpen]);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div role="dialog" aria-modal="true" aria-labelledby="settings-title" className="w-full max-w-lg bg-stone-900 border border-stone-800 rounded-2xl p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-800">
          <div>
            <h3 id="settings-title" className="text-base font-bold text-stone-100">设置</h3>
            <p className="text-xs text-stone-400 mt-0.5">
              管理音乐账号、语音与个人偏好
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭设置"
            className="p-1 rounded-lg text-stone-400 hover:text-stone-200 hover:bg-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div role="tablist" aria-label="设置分类" className="flex gap-2 border-b border-stone-800 pb-3">
          <button role="tab" aria-selected={tab === 'services'} className={`rounded-lg px-4 py-2 text-sm ${tab === 'services' ? 'bg-amber-400/10 text-amber-300' : 'text-stone-400'}`} onClick={() => setTab('services')}>音乐与语音</button>
          <button role="tab" aria-selected={tab === 'personal'} className={`rounded-lg px-4 py-2 text-sm ${tab === 'personal' ? 'bg-amber-400/10 text-amber-300' : 'text-stone-400'}`} onClick={() => setTab('personal')}>个人设置</button>
          <button role="tab" aria-selected={tab === 'agent'} className={`rounded-lg px-4 py-2 text-sm ${tab === 'agent' ? 'bg-amber-400/10 text-amber-300' : 'text-stone-400'}`} onClick={() => setTab('agent')}>Agent 设置</button>
        </div>

        {tab === 'agent' ? <div role="tabpanel" aria-label="Agent 设置" className="space-y-4">
          <div><label htmlFor="agent-prompt" className="text-sm font-semibold text-stone-200">Agent 提示词</label><p className="mt-2 text-xs leading-relaxed text-stone-400">设置阿屿的交流方式、选歌习惯和处理意图的规则。先理解你的要求，再查找真实歌曲、编排歌单，并用 MiniMax 语音回应。</p></div>
          <textarea id="agent-prompt" aria-label="Agent 提示词" maxLength={MAX_AGENT_PROMPT_LENGTH} rows={14} value={agentPrompt} onChange={e=>onUpdateAgentPrompt?.(e.target.value)} className="w-full resize-y rounded-xl border border-stone-700 bg-stone-950 p-3 text-sm leading-relaxed text-stone-200 focus:border-amber-400 focus:outline-none"/>
          <div className="flex items-center justify-between gap-3 text-xs"><button type="button" className="text-amber-300" onClick={()=>onUpdateAgentPrompt?.(DEFAULT_AGENT_PROMPT)}>恢复默认提示词</button><span className="text-stone-500">{agentPrompt.length} / {MAX_AGENT_PROMPT_LENGTH}</span></div>
          <p className="text-xs leading-relaxed text-stone-400">自动保存在当前浏览器，下次对话生效。留空使用默认提示词。歌曲来自 QQ 音乐；MiniMax 负责理解和朗读，不生成电子音乐。</p>
        </div> : tab === 'personal' ? <div role="tabpanel" aria-label="个人设置" className="space-y-4">
          {profile && onUpdateProfile && <CompanionProfile profile={profile} onChange={onUpdateProfile}/>}
          <div className="text-xs text-stone-400 space-y-2"><p>本机近期听歌记录 · {listeningCount} 首</p><button disabled={!listeningCount} className="text-amber-300 disabled:opacity-40" onClick={onClearListening}>清除本机近期听歌记录</button></div>
        </div> : <div role="tabpanel" aria-label="音乐与语音" className="space-y-6">

        {/* 1. Music Source Provider */}
        <div className="space-y-2.5">
          <label className="text-xs font-semibold text-stone-300 flex items-center gap-2">
            <Server className="w-4 h-4 text-amber-400" />
            <span>音乐源协议 (Music Source)</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              { id: 'qq-music', title: 'QQ 音乐', desc: '搜索、个人推荐与阿屿编排歌单' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => onUpdateSettings({ musicSource: item.id as any })}
                className={`p-3 rounded-xl border text-left transition-all ${
                  settings.musicSource === item.id
                    ? 'bg-amber-400/10 border-amber-400/80 text-stone-100 shadow-sm'
                    : 'bg-stone-800/40 border-stone-800 text-stone-400 hover:border-stone-700'
                }`}
              >
                <div className="text-xs font-semibold text-stone-200 mb-1">{item.title}</div>
                <div className="text-[11px] text-stone-400 leading-tight">{item.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <QQMusicSettings/>

        {/* 2. Chat Model Provider */}
        <div className="space-y-2.5">
          <label className="text-xs font-semibold text-stone-300 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-amber-400" />
            <span>陪伴模型引擎 (AI Model Engine)</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              { id: 'MiniMax-M3', title: 'MiniMax M3', desc: '场景感知与温暖文字陪伴' },
              { id: 'local-heuristic', title: '离线启发式引擎', desc: '本地零延迟，无网络时安全保障' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => onUpdateSettings({ chatModel: item.id as any })}
                className={`p-3 rounded-xl border text-left transition-all ${
                  settings.chatModel === item.id
                    ? 'bg-amber-400/10 border-amber-400/80 text-stone-100 shadow-sm'
                    : 'bg-stone-800/40 border-stone-800 text-stone-400 hover:border-stone-700'
                }`}
              >
                <div className="text-xs font-semibold text-stone-200 mb-1">{item.title}</div>
                <div className="text-[11px] text-stone-400 leading-tight">{item.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <p role="status" className="text-[11px] text-stone-400">{modelStatus}</p>

        {/* 3. Voice TTS Provider */}
        <div className="space-y-2.5">
          <label className="text-xs font-semibold text-stone-300 flex items-center gap-2">
            <Mic className="w-4 h-4 text-amber-400" />
            <span>语音陪伴服务 (Voice Speech Service)</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { id: 'minimax', title: 'MiniMax 自然语音', desc: '温暖陪伴，支持音色与语速选择' },
              { id: 'silent', title: '静音文字模式', desc: '仅保留气泡文本，无语音播报' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => onUpdateSettings({ voiceTts: item.id as ServiceSettings['voiceTts'] })}
                className={`p-3 rounded-xl border text-left transition-all ${
                  settings.voiceTts === item.id
                    ? 'bg-amber-400/10 border-amber-400/80 text-stone-100 shadow-sm'
                    : 'bg-stone-800/40 border-stone-800 text-stone-400 hover:border-stone-700'
                }`}
              >
                <div className="text-xs font-semibold text-stone-200 mb-1">{item.title}</div>
                <div className="text-[11px] text-stone-400 leading-tight">{item.desc}</div>
              </button>
            ))}
          </div>
          {settings.voiceTts === 'minimax' && (
            <div className="space-y-3 p-3 bg-stone-800/40 rounded-xl border border-stone-800 text-xs text-stone-300">
              <p role="status" className="text-stone-400">{voiceStatus}</p>
              <label className="block">陪伴音色
                <select aria-label="陪伴音色" value={settings.voiceId} onChange={e => onUpdateSettings({ voiceId: e.target.value })} className="mt-1 w-full p-2 rounded-lg bg-stone-900 border border-stone-700">
                  {SPEECH_VOICES.map(voice => <option key={voice.id} value={voice.id}>{voice.name}</option>)}
                </select>
              </label>
              <label className="block">声音质量
                <select aria-label="声音质量" value={settings.voiceModel} onChange={e => onUpdateSettings({ voiceModel: e.target.value })} className="mt-1 w-full p-2 rounded-lg bg-stone-900 border border-stone-700">
                  {SPEECH_MODELS.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
                </select>
              </label>
              <label className="block">朗读语速 · {settings.voiceSpeed.toFixed(2)} 倍
                <input aria-label="朗读语速" type="range" min="0.8" max="1.2" step="0.05" value={settings.voiceSpeed} onChange={e => onUpdateSettings({ voiceSpeed: Number(e.target.value) })} className="mt-2 w-full accent-amber-400" />
              </label>
              <label className="flex items-center justify-between gap-2">自动朗读新回复
                <input type="checkbox" checked={settings.voiceAutoPlay} onChange={e => onUpdateSettings({ voiceAutoPlay: e.target.checked })} className="accent-amber-400" />
              </label>
              <p className="text-[11px] text-stone-400">朗读的文字会发送至 MiniMax，按用量计费。也可关闭自动朗读，点击消息旁的喇叭按需收听。</p>
            </div>
          )}
        </div>

        {/* 4. User Playback Control Toggles */}
        <div className="space-y-3 pt-3 border-t border-stone-800">
          <label className="text-xs font-semibold text-stone-300 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-amber-400" />
            <span>自主控制权开关</span>
          </label>
          <div className="space-y-2.5 text-xs">
            <label className="block p-3 rounded-xl bg-stone-800/50 border border-stone-800">
              <span className="font-medium text-stone-200 block mb-2">播放模式</span>
              <select aria-label="播放模式" value={settings.playbackMode} onChange={e => onUpdateSettings({ playbackMode: e.target.value as ServiceSettings['playbackMode'] })} className="w-full rounded-lg border border-stone-700 bg-stone-900 p-2">
                <option value="sequential">顺序播放</option><option value="shuffle">随机播放</option><option value="repeat-one">单曲循环</option>
              </select>
            </label>


          </div>
        </div>

        </div>}

        {/* Footer */}
        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-stone-950 font-semibold text-xs transition-colors"
          >
            完成设置
          </button>
        </div>
      </div>
    </div>
  );
};
