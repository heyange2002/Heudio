import React from 'react';
import { AmbientMix } from '../types/music';
import { CloudRain, Waves, Flame, Wind, Coffee, X, RotateCcw, VolumeX } from 'lucide-react';

interface AmbientMixerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  mix: AmbientMix;
  onChangeMix: (newMix: Partial<AmbientMix>) => void;
  onResetToSceneDefaults: () => void;
}

export const AmbientMixerDrawer: React.FC<AmbientMixerDrawerProps> = ({
  isOpen,
  onClose,
  mix,
  onChangeMix,
  onResetToSceneDefaults,
}) => {
  if (!isOpen) return null;

  const sliders = [
    { key: 'rain' as const, label: '微雨窗扉', icon: CloudRain, val: mix.rain },
    { key: 'waves' as const, label: '海湾潮涌', icon: Waves, val: mix.waves },
    { key: 'fire' as const, label: '柴火壁炉', icon: Flame, val: mix.fire },
    { key: 'wind' as const, label: '林间微风', icon: Wind, val: mix.wind },
    { key: 'cafe' as const, label: '午后咖啡', icon: Coffee, val: mix.cafe },
  ];

  const handleMuteAll = () => {
    onChangeMix({ rain: 0, waves: 0, fire: 0, wind: 0, cafe: 0 });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full sm:max-w-md bg-stone-900 border border-stone-800 rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-stone-800">
          <div className="flex items-center gap-2">
            <span className="font-bold text-stone-100 text-base">自然声景混音台</span>
            <span aria-hidden="true" className="text-stone-600">·</span>
            <span className="text-xs text-stone-400">实时环境合成层</span>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭混音台"
            className="p-1 rounded-lg text-stone-400 hover:text-stone-200 hover:bg-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Ambient sliders */}
        <div className="space-y-4">
          {sliders.map(({ key, label, icon: Icon, val }) => (
            <div key={key} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-stone-300">
                  <Icon className="w-4 h-4 text-amber-400/80" />
                  <span>{label}</span>
                </div>
                <span className="font-mono text-stone-400 tabular-nums">
                  {Math.round(val * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={val}
                onChange={(e) => onChangeMix({ [key]: parseFloat(e.target.value) })}
                className="w-full h-1.5 bg-stone-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
              />
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-between pt-3 border-t border-stone-800 text-xs">
          <button
            onClick={handleMuteAll}
            className="px-3 py-1.5 rounded-lg text-stone-400 hover:text-stone-200 hover:bg-stone-800 flex items-center gap-1.5 transition-colors"
          >
            <VolumeX className="w-4 h-4" />
            <span>静音所有自然声</span>
          </button>
          <button
            onClick={onResetToSceneDefaults}
            className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>恢复当前场景预设</span>
          </button>
        </div>
      </div>
    </div>
  );
};
