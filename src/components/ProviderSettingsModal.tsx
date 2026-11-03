import React from 'react';
import { ServiceSettings } from '../types/music';
import { X, Server, Cpu, Mic, Sliders, ShieldCheck } from 'lucide-react';

interface ProviderSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ServiceSettings;
  onUpdateSettings: (newSettings: Partial<ServiceSettings>) => void;
}

export const ProviderSettingsModal: React.FC<ProviderSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-stone-900 border border-stone-800 rounded-2xl p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-800">
          <div>
            <h3 className="text-base font-bold text-stone-100">服务解耦与偏好协议</h3>
            <p className="text-xs text-stone-400 mt-0.5">
              音乐源、聊天模型与语音服务自由可替换，不绑定单一供应商
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

        {/* 1. Music Source Provider */}
        <div className="space-y-2.5">
          <label className="text-xs font-semibold text-stone-300 flex items-center gap-2">
            <Server className="w-4 h-4 text-amber-400" />
            <span>音乐源协议 (Music Source)</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              { id: 'soundisle-builtin', title: '声屿内建合成源', desc: '432Hz自适应Web Audio纯净渲染' },
              { id: 'open-archive', title: '开放知识库音频', desc: '开放知识共享环境音源与器乐流' },
              { id: 'local-stems', title: '本地音频扩展', desc: '支持用户本地导入的分轨无损伴奏' },
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

        {/* 2. Chat Model Provider */}
        <div className="space-y-2.5">
          <label className="text-xs font-semibold text-stone-300 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-amber-400" />
            <span>陪伴模型引擎 (AI Model Engine)</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              { id: 'gemini-3.8-flash', title: 'Gemini 3.8 Flash', desc: '推荐 · 极速场景感知与轻量陪伴' },
              { id: 'gemini-4-argon', title: 'Gemini 4 Argon', desc: '深度情感共鸣与复杂长周期推导' },
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

        {/* 3. Voice TTS Provider */}
        <div className="space-y-2.5">
          <label className="text-xs font-semibold text-stone-300 flex items-center gap-2">
            <Mic className="w-4 h-4 text-amber-400" />
            <span>语音陪伴服务 (Voice Speech Service)</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              { id: 'browser-speech', title: '系统本地语音', desc: '零网络消耗，原生低延迟朗读' },
              { id: 'gemini-tts', title: 'Gemini Flash TTS', desc: '温和自然多模态情感声学表达' },
              { id: 'silent', title: '静音文字模式', desc: '仅保留气泡文本，无语音播报' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => onUpdateSettings({ voiceTts: item.id as any })}
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
        </div>

        {/* 4. User Playback Control Toggles */}
        <div className="space-y-3 pt-3 border-t border-stone-800">
          <label className="text-xs font-semibold text-stone-300 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-amber-400" />
            <span>自主控制权开关</span>
          </label>
          <div className="space-y-2.5 text-xs">
            <label className="flex items-center justify-between p-3 rounded-xl bg-stone-800/50 border border-stone-800 hover:bg-stone-800/80 cursor-pointer transition-colors">
              <div>
                <span className="font-medium text-stone-200 block">限制自动切歌 (单曲驻留)</span>
                <span className="text-stone-400 text-[11px] block mt-0.5">
                  开启后当前曲目结束不再自动跳到下一首，保持相同氛围循环
                </span>
              </div>
              <input
                type="checkbox"
                checked={!settings.autoAdvance}
                onChange={(e) => onUpdateSettings({ autoAdvance: !e.target.checked })}
                className="w-4 h-4 rounded text-amber-400 accent-amber-400 bg-stone-700 border-stone-600"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-xl bg-stone-800/50 border border-stone-800 hover:bg-stone-800/80 cursor-pointer transition-colors">
              <div>
                <span className="font-medium text-stone-200 block">开启律动动画 (音频响应动效)</span>
                <span className="text-stone-400 text-[11px] block mt-0.5">
                  关闭后切换为极简静态留白模式，保护专注度与降低电量
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.motionEnabled}
                onChange={(e) => onUpdateSettings({ motionEnabled: e.target.checked })}
                className="w-4 h-4 rounded text-amber-400 accent-amber-400 bg-stone-700 border-stone-600"
              />
            </label>
          </div>
        </div>

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
