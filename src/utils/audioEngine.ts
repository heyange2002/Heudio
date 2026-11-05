import { apiFetch } from '../api';
import { MusicTrack } from '../types/music';
import { DEFAULT_EQ, EQ_BANDS, normalizeEqualizer, type EqualizerSettings } from './equalizer';

export interface PlaybackFailure { kind: 'unavailable' | 'other'; trackId: string; }
class UnavailableTrackError extends Error {}

export class SoundIsleAudioEngine {
  private remoteAudio: HTMLAudioElement | null = null;
  private playGeneration = 0;
  private playbackController?: AbortController;
  private preloaded?: { mid: string; controller: AbortController; ready: Promise<HTMLAudioElement | null>; audio?: HTMLAudioElement; createdAt: number };
  private transitionGain = 1;
  private transitionRevision = 0;
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
  private onErrorCallback?: (message: string, failure?: PlaybackFailure) => void;
  private onTimeUpdateCallback?: (seconds: number) => void;
  private onTrackEndedCallback?: () => void;
  public onStarted(callback: (track: MusicTrack) => void) { this.onStartedCallback = callback; }
  public onError(callback: (message: string, failure?: PlaybackFailure) => void) { this.onErrorCallback = callback; }
  public setInputMuted(active: boolean) { this.inputMuted = active; this.applyVolume(); }
  public setSpeechDucking(active: boolean) { this.ducked = active; this.applyVolume(); }
  private applyVolume() {
    if (this.remoteAudio) this.remoteAudio.volume = this.inputMuted ? 0 : (this.ducked ? Math.min(this.volume, 0.05) : this.volume) * this.transitionGain;
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
  private releaseAudio(audio: HTMLAudioElement) {
    audio.pause(); audio.ontimeupdate = null; audio.onended = null; audio.onerror = null;
    audio.removeAttribute('src'); audio.load();
  }
  public clearPreload() {
    const saved = this.preloaded; this.preloaded = undefined;
    saved?.controller.abort();
    if (saved?.audio) this.releaseAudio(saved.audio);
  }
  public preloadTrack(track: MusicTrack | null) {
    if (!track?.qqMid) { this.clearPreload(); return; }
    if (this.preloaded?.mid === track.qqMid && Date.now() - this.preloaded.createdAt < 25 * 60000) return;
    this.clearPreload();
    const controller = new AbortController();
    const saved = { mid: track.qqMid, controller, createdAt: Date.now(), audio: undefined as HTMLAudioElement | undefined, ready: Promise.resolve(null) as Promise<HTMLAudioElement | null> };
    this.preloaded = saved;
    saved.ready = this.playbackUrl(track, controller.signal).then(url => {
      if (controller.signal.aborted) return null;
      const audio = new Audio(url); saved.audio = audio;
      audio.preload = 'auto'; audio.load();
      return audio;
    }).catch(() => null); // A speculative failure must never interrupt the current song.
  }
  public async transitionToTrack(track: MusicTrack, durationMs = 800) {
    const generation = this.playGeneration;
    const revision = ++this.transitionRevision;
    const duration = Math.max(0, Math.min(2000, durationMs));
    if (this.remoteAudio && this.isPlaying && duration > 0) {
      // The UI has selected the new track; old progress/end events must not advance its queue.
      this.remoteAudio.ontimeupdate = null; this.remoteAudio.onended = null;
      this.preloadTrack(track);
      const started = Date.now();
      while (Date.now() - started < duration) {
        if (generation !== this.playGeneration || revision !== this.transitionRevision) return;
        this.transitionGain = Math.max(0, 1 - (Date.now() - started) / duration);
        this.applyVolume();
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      if (generation !== this.playGeneration || revision !== this.transitionRevision) return;
    }
    this.playTrack(track);
  }
  public playTrack(track: MusicTrack, start = 0) {
    const saved = this.preloaded;
    const prepared = saved && saved.mid === track.qqMid && Date.now() - saved.createdAt < 25 * 60000 ? saved : undefined;
    if (prepared) this.preloaded = undefined;
    else this.clearPreload();
    this.pause();
    this.mediaSource?.disconnect(); this.mediaSource = null;
    if (this.remoteAudio) { this.releaseAudio(this.remoteAudio); this.remoteAudio = null; }
    if (!track.qqMid) { this.onErrorCallback?.('请先让阿屿选歌，或在音乐侧栏选择一首 QQ 音乐。'); return; }
    this.initContext();
    this.currentTrack = track; this.elapsedSeconds = start; this.isPlaying = true;
    void this.playQQTrack(track, start, this.playGeneration, prepared);
  }
  public pause() {
    this.transitionRevision++;
    this.playGeneration++; this.playbackController?.abort(); this.playbackController = undefined;
    if (this.remoteAudio) { this.remoteAudio.pause(); this.remoteAudio.ontimeupdate = null; this.remoteAudio.onended = null; this.remoteAudio.onerror = null; }
    this.isPlaying = false; this.transitionGain = 1; this.applyVolume();
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
  private async playbackUrl(track: MusicTrack, signal: AbortSignal) {
    const response = await apiFetch('/api/music/getMusicPlay/' + encodeURIComponent(track.qqMid!) + '?quality=128', { signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]) });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || '无法获取播放链接，请检查 QQ 授权');
    const entry = data.data?.playUrl?.[track.qqMid!];
    if (!entry?.url) throw new UnavailableTrackError('这首歌暂时没有可用的播放链接，可以换一首试试');
    const url = new URL(entry.url, location.href);
    if (url.origin !== location.origin || !/^\/api\/music\/stream\/[a-f0-9]{48}$/.test(url.pathname) || url.search || url.hash) throw Error('音乐服务仍在返回旧版播放链接，请更新后端后重试');
    return url.toString();
  }
  private async playQQTrack(track: MusicTrack, start: number, generation: number, prepared?: NonNullable<SoundIsleAudioEngine['preloaded']>) {
    const controller = prepared?.controller || new AbortController(); this.playbackController = controller;
    let audio: HTMLAudioElement | null = null;
    try {
      if (prepared) audio = await prepared.ready;
      if (generation !== this.playGeneration) { if (audio) this.releaseAudio(audio); return; }
      if (!audio || audio.error) {
        if (audio) this.releaseAudio(audio);
        const url = await this.playbackUrl(track, controller.signal);
        if (generation !== this.playGeneration) return;
        audio = new Audio(url);
      }
      if (generation !== this.playGeneration) return;
      const activeAudio = audio;
      this.remoteAudio = activeAudio;
      activeAudio.currentTime = start;
      if (this.ctx && this.filters.length) {
        this.mediaSource = this.ctx.createMediaElementSource(activeAudio);
        this.mediaSource.connect(this.filters[0]);
      }
      this.applyVolume();
      activeAudio.ontimeupdate = () => { if (generation === this.playGeneration) { this.elapsedSeconds = activeAudio.currentTime; this.onTimeUpdateCallback?.(activeAudio.currentTime); } };
      activeAudio.onended = () => { if (generation === this.playGeneration) { this.isPlaying = false; this.onTrackEndedCallback?.(); } };
      activeAudio.onerror = () => { if (generation === this.playGeneration) {
        const code = activeAudio.error?.code;
        this.pause();
        this.onErrorCallback?.(code === 3 ? '浏览器无法解码这首歌的音频，请换一首歌' : '音乐下载连接失败，请重试以重新获取可用的 HTTPS 播放线路');
      } };
      await activeAudio.play();
      if (generation !== this.playGeneration) activeAudio.pause();
      else this.onStartedCallback?.(track);
    } catch (error) {
      if (generation !== this.playGeneration) return;
      this.pause(); this.onErrorCallback?.(error instanceof Error && error.name === 'NotAllowedError' ? '歌曲已准备好，请点击播放继续' : error instanceof Error ? error.message : '歌曲播放失败', { kind: error instanceof UnavailableTrackError ? 'unavailable' : 'other', trackId: track.id });
    }
  }
}
export const audioEngine = new SoundIsleAudioEngine();
