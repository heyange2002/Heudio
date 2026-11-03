import { apiFetch } from '../api';
import { AmbientMix, MusicTrack } from '../types/music';

class SoundIsleAudioEngine {
  private remoteAudio: HTMLAudioElement | null = null;
  private playGeneration = 0;
  private playbackController?: AbortController;
  private volume = 0.85;
  private ducked = false;
  private onStartedCallback?: (track: MusicTrack) => void;
  public onStarted(callback: (track: MusicTrack) => void) { this.onStartedCallback = callback; }
  private onErrorCallback?: (message: string) => void;
  public onError(callback: (message: string) => void) { this.onErrorCallback = callback; }
  public setSpeechDucking(active: boolean) { this.ducked = active; this.applyVolume(); }
  private applyVolume() {
    const volume = this.volume * (this.ducked ? 0.25 : 1);
    if (this.remoteAudio) this.remoteAudio.volume = volume;
    if (this.masterGain && this.ctx) this.masterGain.gain.setValueAtTime(volume, this.ctx.currentTime);
  }
  private async playQQTrack(track: MusicTrack, start: number, generation: number) {
    const controller = new AbortController(); this.playbackController = controller;
    try {
      const response = await apiFetch('/api/music/getMusicPlay/' + encodeURIComponent(track.qqMid!) + '?quality=128', { signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || '无法获取播放链接，请检查 QQ 授权');
      const entry = data.data?.playUrl?.[track.qqMid!];
      if (!entry?.url) throw Error('这首歌暂时没有可用的播放链接，可以换一首试试');
      const url = new URL(entry.url);
      if (url.protocol === 'http:' && /(?:^|\.)qq\.com$/.test(url.hostname)) url.protocol = 'https:';
      if (url.protocol !== 'https:' || url.username || url.password) throw Error('音乐播放链接格式无效');
      if (generation !== this.playGeneration) return;
      const audio = new Audio(url.toString()); this.remoteAudio = audio;
      audio.currentTime = start; this.applyVolume();
      audio.ontimeupdate = () => { if (generation === this.playGeneration) { this.elapsedSeconds = audio.currentTime; this.onTimeUpdateCallback?.(audio.currentTime); } };
      audio.onended = () => { if (generation === this.playGeneration) { this.isPlaying = false; this.onTrackEndedCallback?.(); } };
      audio.onerror = () => { if (generation === this.playGeneration) { this.pause(); this.onErrorCallback?.('歌曲播放失败，请重试或换一首歌'); } };
      await audio.play();
      if (generation !== this.playGeneration) audio.pause();
      else this.onStartedCallback?.(track);
    } catch (error) {
      if (generation !== this.playGeneration) return;
      this.pause(); this.onErrorCallback?.(error instanceof Error && error.name === 'NotAllowedError' ? '歌曲已准备好，请点击播放继续' : error instanceof Error ? error.message : '歌曲播放失败');
    }
  }
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;

  // Track synthesis state
  private isPlaying: boolean = false;
  private currentTrack: MusicTrack | null = null;
  private trackTimer: number | null = null;
  private elapsedSeconds: number = 0;
  private chordInterval: number | null = null;
  private beatInterval: number | null = null;

  // Ambient sound nodes & gains
  private ambientGains: {
    rain: GainNode | null;
    waves: GainNode | null;
    fire: GainNode | null;
    wind: GainNode | null;
    cafe: GainNode | null;
  } = {
    rain: null,
    waves: null,
    fire: null,
    wind: null,
    cafe: null,
  };

  private ambientSources: {
    rainNode?: AudioNode;
    wavesNode?: AudioNode;
    fireNode?: AudioNode;
    windNode?: AudioNode;
    cafeNode?: AudioNode;
  } = {};

  // Listeners
  private onTimeUpdateCallback?: (seconds: number) => void;
  private onTrackEndedCallback?: () => void;

  private currentMix: AmbientMix = {
    rain: 0.3,
    waves: 0.1,
    fire: 0.05,
    wind: 0.1,
    cafe: 0.05,
  };

  constructor() {
    // AudioContext will be initialized on first user gesture
  }

  private initContext() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContextClass();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.85, this.ctx.currentTime);

      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.82;

      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);

      this.setupAmbientGenerators();
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Setup generative ambient noise nodes
  private setupAmbientGenerators() {
    if (!this.ctx || !this.masterGain) return;

    // 1. Rain Generator (Filtered pink noise with gentle resonant dips)
    const rainGain = this.ctx.createGain();
    rainGain.gain.setValueAtTime(this.currentMix.rain * 0.4, this.ctx.currentTime);
    rainGain.connect(this.masterGain);
    this.ambientGains.rain = rainGain;

    const rainBuffer = this.createNoiseBuffer(5);
    const rainSource = this.ctx.createBufferSource();
    rainSource.buffer = rainBuffer;
    rainSource.loop = true;

    const rainFilter = this.ctx.createBiquadFilter();
    rainFilter.type = 'lowpass';
    rainFilter.frequency.value = 1200;

    rainSource.connect(rainFilter);
    rainFilter.connect(rainGain);
    rainSource.start();
    this.ambientSources.rainNode = rainSource;

    // 2. Waves Generator (Slow LFO sweeping bandpass surf)
    const wavesGain = this.ctx.createGain();
    wavesGain.gain.setValueAtTime(this.currentMix.waves * 0.45, this.ctx.currentTime);
    wavesGain.connect(this.masterGain);
    this.ambientGains.waves = wavesGain;

    const waveBuffer = this.createNoiseBuffer(6);
    const waveSource = this.ctx.createBufferSource();
    waveSource.buffer = waveBuffer;
    waveSource.loop = true;

    const waveFilter = this.ctx.createBiquadFilter();
    waveFilter.type = 'bandpass';
    waveFilter.frequency.value = 350;
    waveFilter.Q.value = 1.2;

    // LFO for surf swelling
    const waveLfo = this.ctx.createOscillator();
    waveLfo.type = 'sine';
    waveLfo.frequency.value = 0.12; // 8 seconds per wave cycle
    const waveLfoGain = this.ctx.createGain();
    waveLfoGain.gain.value = 250;
    waveLfo.connect(waveLfoGain);
    waveLfoGain.connect(waveFilter.frequency);
    waveLfo.start();

    waveSource.connect(waveFilter);
    waveFilter.connect(wavesGain);
    waveSource.start();
    this.ambientSources.wavesNode = waveSource;

    // 3. Fireplace Generator (Low rumble + pop clicks)
    const fireGain = this.ctx.createGain();
    fireGain.gain.setValueAtTime(this.currentMix.fire * 0.35, this.ctx.currentTime);
    fireGain.connect(this.masterGain);
    this.ambientGains.fire = fireGain;

    const fireBuffer = this.createCrackleBuffer(4);
    const fireSource = this.ctx.createBufferSource();
    fireSource.buffer = fireBuffer;
    fireSource.loop = true;
    fireSource.connect(fireGain);
    fireSource.start();
    this.ambientSources.fireNode = fireSource;

    // 4. Forest Wind (Swept airy resonance)
    const windGain = this.ctx.createGain();
    windGain.gain.setValueAtTime(this.currentMix.wind * 0.3, this.ctx.currentTime);
    windGain.connect(this.masterGain);
    this.ambientGains.wind = windGain;

    const windBuffer = this.createNoiseBuffer(5);
    const windSource = this.ctx.createBufferSource();
    windSource.buffer = windBuffer;
    windSource.loop = true;

    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 500;
    windFilter.Q.value = 3.0;

    const windLfo = this.ctx.createOscillator();
    windLfo.frequency.value = 0.08;
    const windLfoGain = this.ctx.createGain();
    windLfoGain.gain.value = 220;
    windLfo.connect(windLfoGain);
    windLfoGain.connect(windFilter.frequency);
    windLfo.start();

    windSource.connect(windFilter);
    windFilter.connect(windGain);
    windSource.start();
    this.ambientSources.windNode = windSource;

    // 5. Cafe Murmur (Warm filtered murmur)
    const cafeGain = this.ctx.createGain();
    cafeGain.gain.setValueAtTime(this.currentMix.cafe * 0.25, this.ctx.currentTime);
    cafeGain.connect(this.masterGain);
    this.ambientGains.cafe = cafeGain;

    const cafeBuffer = this.createNoiseBuffer(4);
    const cafeSource = this.ctx.createBufferSource();
    cafeSource.buffer = cafeBuffer;
    cafeSource.loop = true;

    const cafeFilter = this.ctx.createBiquadFilter();
    cafeFilter.type = 'lowpass';
    cafeFilter.frequency.value = 450;

    cafeSource.connect(cafeFilter);
    cafeFilter.connect(cafeGain);
    cafeSource.start();
    this.ambientSources.cafeNode = cafeSource;
  }

  // Create noise buffer for water/rain/wind
  private createNoiseBuffer(seconds: number): AudioBuffer {
    if (!this.ctx) throw new Error('No context');
    const sampleRate = this.ctx.sampleRate;
    const bufferSize = sampleRate * seconds;
    const buffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);

    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      // Pink-like filter
      lastOut = (lastOut * 0.95) + (white * 0.05);
      data[i] = lastOut;
    }
    return buffer;
  }

  // Create crackle buffer for campfire
  private createCrackleBuffer(seconds: number): AudioBuffer {
    if (!this.ctx) throw new Error('No context');
    const sampleRate = this.ctx.sampleRate;
    const bufferSize = sampleRate * seconds;
    const buffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      if (Math.random() < 0.0015) {
        data[i] = (Math.random() * 2 - 1) * 0.7;
      } else {
        data[i] = (Math.random() * 2 - 1) * 0.02;
      }
    }
    return buffer;
  }

  // Update ambient volume mix
  public setAmbientMix(mix: Partial<AmbientMix>) {
    this.currentMix = { ...this.currentMix, ...mix };
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    if (this.ambientGains.rain && mix.rain !== undefined) {
      this.ambientGains.rain.gain.linearRampToValueAtTime(mix.rain * 0.4, now + 0.2);
    }
    if (this.ambientGains.waves && mix.waves !== undefined) {
      this.ambientGains.waves.gain.linearRampToValueAtTime(mix.waves * 0.45, now + 0.2);
    }
    if (this.ambientGains.fire && mix.fire !== undefined) {
      this.ambientGains.fire.gain.linearRampToValueAtTime(mix.fire * 0.35, now + 0.2);
    }
    if (this.ambientGains.wind && mix.wind !== undefined) {
      this.ambientGains.wind.gain.linearRampToValueAtTime(mix.wind * 0.3, now + 0.2);
    }
    if (this.ambientGains.cafe && mix.cafe !== undefined) {
      this.ambientGains.cafe.gain.linearRampToValueAtTime(mix.cafe * 0.25, now + 0.2);
    }
  }

  // Set Master Volume
  public setMasterVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol)); this.applyVolume();
  }

  // Play track
  public playTrack(track: MusicTrack, startFromSeconds: number = 0) {
    this.pause();
    if (this.remoteAudio) { this.remoteAudio.removeAttribute('src'); this.remoteAudio.load(); this.remoteAudio = null; }
    const generation = this.playGeneration;
    this.currentTrack = track;
    if (track.qqMid) {
      this.elapsedSeconds = startFromSeconds; this.isPlaying = true;
      void this.playQQTrack(track, startFromSeconds, generation); return;
    }
    this.initContext(); this.applyVolume();
    this.currentTrack = track;
    this.elapsedSeconds = startFromSeconds;
    this.isPlaying = true;

    this.stopSynthSchedule();
    this.startSynthSchedule(track);

    // Progress timer
    if (this.trackTimer) clearInterval(this.trackTimer);
    this.trackTimer = window.setInterval(() => {
      if (this.isPlaying) {
        this.elapsedSeconds += 1;
        if (this.onTimeUpdateCallback) {
          this.onTimeUpdateCallback(this.elapsedSeconds);
        }

        if (this.elapsedSeconds >= track.duration) {
          if (this.onTrackEndedCallback) {
            this.onTrackEndedCallback();
          }
        }
      }
    }, 1000);
  }

  public pause() {
    this.playGeneration++; this.playbackController?.abort();
    this.playbackController = undefined;
    if (this.remoteAudio) { this.remoteAudio.pause(); this.remoteAudio.ontimeupdate = null; this.remoteAudio.onended = null; this.remoteAudio.onerror = null; }
    this.isPlaying = false;
    this.stopSynthSchedule();
    if (this.trackTimer) {
      clearInterval(this.trackTimer);
      this.trackTimer = null;
    }
  }

  public resume() {
    if (this.currentTrack) {
      this.playTrack(this.currentTrack, this.elapsedSeconds);
    }
  }

  public seek(seconds: number) {
    this.elapsedSeconds = Math.max(0, Math.min(this.currentTrack ? this.currentTrack.duration : 180, seconds));
    if (this.remoteAudio) this.remoteAudio.currentTime = this.elapsedSeconds;
    if (this.onTimeUpdateCallback) {
      this.onTimeUpdateCallback(this.elapsedSeconds);
    }
  }

  // Synthesize musical sequences matched to preset
  private startSynthSchedule(track: MusicTrack) {
    if (!this.ctx || !this.masterGain) return;

    // Chords database for different moods
    const progressions: Record<string, number[][]> = {
      'lofi-code': [
        [293.66, 349.23, 440.0, 523.25], // Dm9
        [261.63, 329.63, 392.0, 493.88], // Cmaj7
        [220.0, 261.63, 329.63, 440.0],  // Am7
        [349.23, 440.0, 523.25, 659.25], // Fmaj7
      ],
      'gentle-piano': [
        [261.63, 329.63, 392.0],        // C
        [220.0, 261.63, 329.63],        // Am
        [174.61, 220.0, 261.63],        // F
        [196.0, 246.94, 293.66],        // G
      ],
      'coastal-rest': [
        [196.0, 293.66, 392.0, 440.0],  // Gsus2
        [164.81, 246.94, 329.63, 392.0],// Em7
        [174.61, 261.63, 329.63, 440.0],// Fmaj7#11
        [196.0, 293.66, 392.0, 587.33], // G add9
      ],
      'sunrise-stride': [
        [130.81, 196.0, 261.63, 329.63],// C
        [146.83, 220.0, 293.66, 349.23],// Dm
        [164.81, 246.94, 329.63, 392.0],// Em
        [174.61, 261.63, 349.23, 440.0],// F
      ],
      'sleep-drift': [
        [108.0, 162.0, 216.0, 432.0],   // 432Hz harmonic alignment
        [101.4, 152.0, 202.8, 405.6],   // Gentle sub drift
        [96.0, 144.0, 192.0, 384.0],
        [108.0, 162.0, 216.0, 432.0],
      ],
    };

    const chords = progressions[track.audioPreset] || progressions['lofi-code'];
    let chordStep = 0;

    const playChord = () => {
      if (!this.ctx || !this.masterGain || !this.isPlaying) return;
      const now = this.ctx.currentTime;
      const currentChordNotes = chords[chordStep % chords.length];
      chordStep++;

      currentChordNotes.forEach((freq, idx) => {
        if (!this.ctx || !this.masterGain) return;
        const osc = this.ctx.createOscillator();
        const noteGain = this.ctx.createGain();

        // Waveform styling based on scene
        if (track.scene === 'sleep') {
          osc.type = 'sine';
          noteGain.gain.setValueAtTime(0.001, now);
          noteGain.gain.exponentialRampToValueAtTime(0.04, now + 2.5);
          noteGain.gain.exponentialRampToValueAtTime(0.0001, now + 7.5);
        } else if (track.scene === 'focus') {
          osc.type = idx === 0 ? 'sine' : 'triangle';
          noteGain.gain.setValueAtTime(0.001, now);
          noteGain.gain.linearRampToValueAtTime(0.035, now + 0.3);
          noteGain.gain.exponentialRampToValueAtTime(0.0001, now + 3.8);
        } else if (track.scene === 'workout') {
          osc.type = 'sawtooth';
          const filter = this.ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(800, now);
          filter.frequency.exponentialRampToValueAtTime(2400, now + 0.2);
          osc.connect(filter);
          filter.connect(noteGain);
          noteGain.gain.setValueAtTime(0.03, now);
          noteGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
          osc.frequency.setValueAtTime(freq, now);
          noteGain.connect(this.masterGain);
          osc.start(now);
          osc.stop(now + 1.3);
          return;
        } else {
          // rest
          osc.type = 'sine';
          noteGain.gain.setValueAtTime(0.001, now);
          noteGain.gain.linearRampToValueAtTime(0.04, now + 0.8);
          noteGain.gain.exponentialRampToValueAtTime(0.0001, now + 4.5);
        }

        osc.frequency.setValueAtTime(freq, now);
        osc.connect(noteGain);
        noteGain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + (track.scene === 'sleep' ? 8.0 : 4.5));
      });
    };

    // Initial chord
    playChord();
    const chordIntervalMs = track.scene === 'workout' ? 2000 : (track.scene === 'sleep' ? 7000 : 4000);
    this.chordInterval = window.setInterval(playChord, chordIntervalMs);

    // Rhythmic pulse for focus & workout
    if (track.scene === 'focus' || track.scene === 'workout') {
      const beatMs = (60 / track.bpm) * 1000;
      let beatCount = 0;
      this.beatInterval = window.setInterval(() => {
        if (!this.ctx || !this.masterGain || !this.isPlaying) return;
        const now = this.ctx.currentTime;
        beatCount++;

        // Soft kick / rim pulse
        if (beatCount % 2 === 1 || track.scene === 'workout') {
          const kickOsc = this.ctx.createOscillator();
          const kickGain = this.ctx.createGain();
          kickOsc.frequency.setValueAtTime(track.scene === 'workout' ? 120 : 80, now);
          kickOsc.frequency.exponentialRampToValueAtTime(0.01, now + 0.2);

          kickGain.gain.setValueAtTime(track.scene === 'workout' ? 0.08 : 0.03, now);
          kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

          kickOsc.connect(kickGain);
          kickGain.connect(this.masterGain);
          kickOsc.start(now);
          kickOsc.stop(now + 0.25);
        }
      }, beatMs);
    }
  }

  private stopSynthSchedule() {
    if (this.chordInterval) {
      clearInterval(this.chordInterval);
      this.chordInterval = null;
    }
    if (this.beatInterval) {
      clearInterval(this.beatInterval);
      this.beatInterval = null;
    }
  }

  // Visualizer Analyser Frequency Data
  public getFrequencyData(outputArray: Uint8Array<ArrayBuffer>) {
    if (this.analyser && this.isPlaying) {
      this.analyser.getByteFrequencyData(outputArray);
    } else {
      outputArray.fill(0);
    }
  }

  public getTimeDomainData(outputArray: Uint8Array<ArrayBuffer>) {
    if (this.analyser && this.isPlaying) {
      this.analyser.getByteTimeDomainData(outputArray);
    } else {
      outputArray.fill(128);
    }
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getElapsedSeconds(): number {
    return this.elapsedSeconds;
  }

  public onTimeUpdate(cb: (seconds: number) => void) {
    this.onTimeUpdateCallback = cb;
  }

  public onTrackEnded(cb: () => void) {
    this.onTrackEndedCallback = cb;
  }
}

export const audioEngine = new SoundIsleAudioEngine();
