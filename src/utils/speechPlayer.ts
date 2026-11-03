import { apiFetch } from '../api';
import type { ServiceSettings } from '../types/music';

export type SpeechState = { status: 'idle' | 'loading' | 'playing' | 'ready' | 'error'; text: string; error?: string };
type VoiceSettings = Pick<ServiceSettings, 'voiceModel' | 'voiceId' | 'voiceSpeed'>;

export class SpeechPlayer {
  state: SpeechState = { status: 'idle', text: '' };
  private controller?: AbortController;
  private audio?: HTMLAudioElement;
  private url?: string;
  private generation = 0;
  constructor(private onChange: (state: SpeechState) => void, private deps = {
    request: apiFetch,
    createAudio: (url: string) => new Audio(url),
    createUrl: (blob: Blob) => URL.createObjectURL(blob),
    revokeUrl: (url: string) => URL.revokeObjectURL(url),
  }) {}
  private update(state: SpeechState) { this.state = state; this.onChange(state); }
  stop() {
    this.generation++;
    this.controller?.abort(); this.controller = undefined;
    if (this.audio) { this.audio.onended = null; this.audio.onerror = null; this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load(); this.audio = undefined; }
    if (this.url) { this.deps.revokeUrl(this.url); this.url = undefined; }
    this.update({ status: 'idle', text: '' });
  }
  async resume() {
    const audio = this.audio, generation = this.generation, text = this.state.text;
    if (!audio) return;
    try {
      await audio.play();
      if (generation === this.generation) this.update({ status: 'playing', text });
    } catch (err) {
      if (generation !== this.generation) return;
      if (err instanceof Error && err.name === 'NotAllowedError') {
        // Keep the generated audio so an explicit click can play it without another paid request.
        this.update({ status: 'ready', text, error: '语音已准备好，点击播放语音继续。' });
      } else { this.stop(); this.update({ status: 'error', text, error: '语音播放失败，请重试。' }); }
    }
  }
  async speak(text: string, settings: VoiceSettings) {
    this.stop();
    const generation = this.generation;
    const controller = new AbortController(); this.controller = controller;
    this.update({ status: 'loading', text });
    try {
      const response = await this.deps.request('/api/voice/synthesize', {
        method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, model: settings.voiceModel, voiceId: settings.voiceId, speed: settings.voiceSpeed }),
      });
      if (generation !== this.generation) return;
      if (!response.ok) { const data = await response.json(); throw Error(data.error || '语音生成失败，请重试。'); }
      if (!response.headers.get('Content-Type')?.startsWith('audio/')) throw Error('语音服务返回格式异常，请重试。');
      const blob = await response.blob();
      if (generation !== this.generation) return;
      this.url = this.deps.createUrl(blob); this.audio = this.deps.createAudio(this.url);
      this.audio.onended = () => { if (generation === this.generation) this.stop(); };
      this.audio.onerror = () => { if (generation === this.generation) { this.stop(); this.update({ status: 'error', text, error: '语音播放失败，请重试。' }); } };
      await this.resume();
    } catch (err) {
      if (generation !== this.generation) return;
      this.stop(); this.update({ status: 'error', text, error: err instanceof Error ? err.message : '语音服务暂不可用，请重试。' });
    }
  }
}
