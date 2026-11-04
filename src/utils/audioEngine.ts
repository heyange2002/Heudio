import { apiFetch } from '../api';
import { MusicTrack } from '../types/music';
import { DEFAULT_EQ, EQ_BANDS, normalizeEqualizer, type EqualizerSettings } from './equalizer';

export class SoundIsleAudioEngine {
  private remoteAudio: HTMLAudioElement | null = null;
  private playGeneration = 0;
  private playbackController?: AbortController;
  private volume = 0.85;
  private ducked = false;
  private inputMuted = false;
  private ctx: AudioContext | null = null;
  private filters: BiquadFilterNode[] = [];
  private panner: StereoPannerNode | null = null;
  private headroom: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaSource: MediaElementAudioSourceNode | null = null;
  private equalizer: EqualizerSettings = DEFAULT_EQ;
  private isPlaying = false;
  private currentTrack: MusicTrack | null = null;
  private elapsedSeconds = 0;
  private onStartedCallback?: (track: MusicTrack) => void;
  private onErrorCallback?: (message: string) => void;
  private onTimeUpdateCallback?: (seconds: number) => void;
  private onTrackEndedCallback?: () => void;
  public onStarted(callback: (track: MusicTrack) => void) { this.onStartedCallback = callback; }
  public onError(callback: (message: string) => void) { this.onErrorCallback = callback; }
  public setInputMuted(active: boolean) { this.inputMuted = active; this.applyVolume(); }
  public setSpeechDucking(active: boolean) { this.ducked = active; this.applyVolume(); }
  private applyVolume() {
    if (this.remoteAudio) this.remoteAudio.volume = this.inputMuted ? 0 : this.volume * (this.ducked ? 0.3 : 1);
  }
  private initContext() {
    const Context = window.AudioContext || (window as any).webkitAudioContext;
    if (!Context) return;
    if (!this.ctx) {
      this.ctx = new Context();
      this.filters = EQ_BANDS.map((band, index) => {
        const filter = this.ctx!.createBiquadFilter();
        filter.type = index === 0 ? 'lowshelf' : index === EQ_BANDS.length - 1 ? 'highshelf' : 'peaking';
        filter.frequency.value = band.frequency; filter.Q.value = 0.8;
        return filter;
      });
      this.panner = this.ctx.createStereoPanner();
      this.headroom = this.ctx.createGain();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256; this.analyser.smoothingTimeConstant = 0.82;
      this.filters.forEach((filter, i) => filter.connect(this.filters[i + 1] || this.panner!));
      this.panner.connect(this.headroom); this.headroom.connect(this.analyser); this.analyser.connect(this.ctx.destination);
      this.applyEqualizer();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
  }
  public setEqualizer(settings: EqualizerSettings) { this.equalizer = normalizeEqualizer(settings); this.applyEqualizer(); }
  private applyEqualizer() {
    if (!this.ctx) return;
    const { enabled, gains, balance } = this.equalizer;
    this.filters.forEach((filter, i) => filter.gain.setTargetAtTime(enabled ? gains[i] : 0, this.ctx!.currentTime, 0.03));
    this.panner?.pan.setTargetAtTime(enabled ? balance : 0, this.ctx.currentTime, 0.03);
    // Reserve headroom for boosted bands, avoiding clipping on loud tracks.
    this.headroom?.gain.setTargetAtTime(Math.pow(10, -(enabled ? Math.max(0, ...gains) : 0) / 20), this.ctx.currentTime, 0.03);
  }
  public setMasterVolume(vol: number) { this.volume = Math.max(0, Math.min(1, vol)); this.applyVolume(); }
  public playTrack(track: MusicTrack, start = 0) {
    this.pause();
    this.mediaSource?.disconnect(); this.mediaSource = null;
    if (this.remoteAudio) { this.remoteAudio.removeAttribute('src'); this.remoteAudio.load(); this.remoteAudio = null; }
    if (!track.qqMid) { this.onErrorCallback?.('请先让阿屿选歌，或在音乐侧栏选择一首 QQ 音乐。'); return; }
    this.initContext();
    this.currentTrack = track; this.elapsedSeconds = start; this.isPlaying = true;
    void this.playQQTrack(track, start, this.playGeneration);
  }
  public pause() {
    this.playGeneration++; this.playbackController?.abort(); this.playbackController = undefined;
    if (this.remoteAudio) { this.remoteAudio.pause(); this.remoteAudio.ontimeupdate = null; this.remoteAudio.onended = null; this.remoteAudio.onerror = null; }
    this.isPlaying = false;
  }
  public resume() { if (this.currentTrack) this.playTrack(this.currentTrack, this.elapsedSeconds); }
  public seek(seconds: number) {
    this.elapsedSeconds = Math.max(0, Math.min(this.currentTrack?.duration || 0, seconds));
    if (this.remoteAudio) this.remoteAudio.currentTime = this.elapsedSeconds;
    this.onTimeUpdateCallback?.(this.elapsedSeconds);
  }
  public getFrequencyData(output: Uint8Array<ArrayBuffer>) { if (this.analyser && this.isPlaying) this.analyser.getByteFrequencyData(output); else output.fill(0); }
  public getTimeDomainData(output: Uint8Array<ArrayBuffer>) { if (this.analyser && this.isPlaying) this.analyser.getByteTimeDomainData(output); else output.fill(128); }
  public getIsPlaying() { return this.isPlaying; }
  public getElapsedSeconds() { return this.elapsedSeconds; }
  public onTimeUpdate(callback: (seconds: number) => void) { this.onTimeUpdateCallback = callback; }
  public onTrackEnded(callback: () => void) { this.onTrackEndedCallback = callback; }
  private async playQQTrack(track: MusicTrack, start: number, generation: number) {
    const controller = new AbortController(); this.playbackController = controller;
    try {
      const response = await apiFetch('/api/music/getMusicPlay/' + encodeURIComponent(track.qqMid!) + '?quality=128', { signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || '无法获取播放链接，请检查 QQ 授权');
      const entry = data.data?.playUrl?.[track.qqMid!];
      if (!entry?.url) throw Error('这首歌暂时没有可用的播放链接，可以换一首试试');
      const url = new URL(entry.url, location.href);
      if (url.origin !== location.origin || !/^\/api\/music\/stream\/[a-f0-9]{48}$/.test(url.pathname) || url.search || url.hash) throw Error('音乐服务仍在返回旧版播放链接，请更新后端后重试');
      if (generation !== this.playGeneration) return;
      const audio = new Audio(url.toString()); this.remoteAudio = audio;
      audio.currentTime = start;
      if (this.ctx && this.filters.length) {
        this.mediaSource = this.ctx.createMediaElementSource(audio);
        this.mediaSource.connect(this.filters[0]);
      }
      this.applyVolume();
      audio.ontimeupdate = () => { if (generation === this.playGeneration) { this.elapsedSeconds = audio.currentTime; this.onTimeUpdateCallback?.(audio.currentTime); } };
      audio.onended = () => { if (generation === this.playGeneration) { this.isPlaying = false; this.onTrackEndedCallback?.(); } };
      audio.onerror = () => { if (generation === this.playGeneration) {
        const code = audio.error?.code;
        this.pause();
        this.onErrorCallback?.(code === 3 ? '浏览器无法解码这首歌的音频，请换一首歌' : '音乐下载连接失败，请重试以重新获取可用的 HTTPS 播放线路');
      } };
      await audio.play();
      if (generation !== this.playGeneration) audio.pause();
      else this.onStartedCallback?.(track);
    } catch (error) {
      if (generation !== this.playGeneration) return;
      this.pause(); this.onErrorCallback?.(error instanceof Error && error.name === 'NotAllowedError' ? '歌曲已准备好，请点击播放继续' : error instanceof Error ? error.message : '歌曲播放失败');
    }
  }
}
export const audioEngine = new SoundIsleAudioEngine();
