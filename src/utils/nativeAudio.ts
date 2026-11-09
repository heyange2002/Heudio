import type { MusicTrack, PlaybackMode } from "../types/music";
import type { EqualizerSettings } from "./equalizer";
import { qqTrack, type QQSong } from "./music";
export type NativePlaybackState = {
  clientId: string;
  revision: number;
  queueVersion?: number;
  songs: QQSong[];
  mid: string;
  title: string;
  position: number;
  playing: boolean;
  confirmed: boolean;
  mode: PlaybackMode;
  error: string;
  timerMinutes: number;
  eqSupported: boolean | null;
  locked?: boolean;
};
export type AudioBridge = {
  postMessage: (message: string) => void;
  onmessage?: (event: { data: string }) => void;
};
export function nativeAudioBridge(): AudioBridge | undefined {
  if (typeof window === "undefined") return;
  const bridge = (window as Window & { SoundisleAudio?: AudioBridge })
    .SoundisleAudio;
  return typeof bridge?.postMessage === "function" ? bridge : undefined;
}
export class AndroidAudioEngine {
  readonly isNative = true as const;
  private clientId = crypto.randomUUID();
  private revision = 0;
  private queue: MusicTrack[] = [];
  private title = "阿屿为你选的歌";
  private mode: PlaybackMode = "sequential";
  private signature = "";
  private position = 0;
  private playing = false;
  private volume = 0.85;
  private muted = false;
  private ducked = false;
  private timerSelection: number | null = null;
  private seen = false;
  private last?: NativePlaybackState;
  private started?: (track: MusicTrack) => void;
  private error?: (
    text: string,
    failure?: { kind: "unavailable" | "other"; trackId: string },
  ) => void;
  private time?: (seconds: number) => void;
  private state?: (value: NativePlaybackState) => void;
  constructor(private bridge: AudioBridge) {
    bridge.onmessage = (event) => {
      let value: NativePlaybackState;
      try {
        value = JSON.parse(event.data);
      } catch {
        return;
      }
      if (value.clientId !== this.clientId || value.revision < this.revision)
        return;
      if ((value as NativePlaybackState & { type?: string }).type === "error") {
        this.error?.(value.error);
        return;
      }
      const previous = this.last;
      const receivedQueue = Array.isArray(value.songs);
      if (!Array.isArray(value.songs)) {
        if (!previous) return;
        value.songs = previous.songs;
      }
      this.last = value;
      this.position = value.position;
      this.playing = value.playing;
      if (!this.seen) {
        this.timerSelection = value.timerMinutes || null;
        this.seen = true;
      }
      if (!value.timerMinutes) this.timerSelection = null;
      if (value.songs !== previous?.songs) {
        const existing = new Map(
          this.queue.map((track) => [track.qqMid, track]),
        );
        this.queue = value.songs.map(
          (song) => existing.get(song.mid) || qqTrack(song, "focus"),
        );
      }
      this.title = value.title;
      this.mode = value.mode;
      this.state?.(value);
      this.time?.(value.position);
      if (
        value.confirmed &&
        (!previous?.confirmed || previous.mid !== value.mid)
      ) {
        const track = this.queue.find((t) => t.qqMid === value.mid);
        if (track) this.started?.(track);
      }
      if (value.error && value.error !== previous?.error)
        this.error?.(value.error);
      if (
        receivedQueue && typeof value.queueVersion === "number"
      )
        this.send("ack");
    };
  }
  private send(action: string, payload: object = {}) {
    this.bridge.postMessage(
      JSON.stringify({
        ...payload,
        action,
        clientId: this.clientId,
        revision: ++this.revision,
        queueVersion: this.last?.queueVersion ?? -1,
      }),
    );
  }
  attach(callback: (value: NativePlaybackState) => void) {
    this.seen = false;
    this.state = callback;
    this.send("state");
  }
  detach() {
    this.state = undefined;
  }
  private key(tracks: MusicTrack[], title: string, mode: PlaybackMode) {
    return JSON.stringify([tracks.map((t) => t.qqMid), title, mode]);
  }
  syncQueue(
    tracks: MusicTrack[],
    title: string,
    mid: string | undefined,
    position: number,
    mode: PlaybackMode,
  ) {
    tracks = tracks.filter((t) => t.qqMid);
    const key = this.key(tracks, title, mode);
    if (key === this.signature) return;
    this.signature = key;
    this.queue = tracks;
    this.title = title;
    this.mode = mode;
    if (
      this.last &&
      this.key(
        this.last.songs.map((s) => qqTrack(s, "focus")),
        this.last.title,
        this.last.mode,
      ) === key
    )
      return;
    this.send("queue", {
      songs: this.songs(),
      title,
      mid: mid || "",
      position,
      mode,
    });
  }
  installQueue(
    tracks: MusicTrack[],
    title: string,
    mid: string,
    position: number,
    mode: PlaybackMode,
    playing: boolean,
  ) {
    this.queue = tracks.filter((t) => t.qqMid);
    this.title = title;
    this.mode = mode;
    this.signature = this.key(this.queue, title, mode);
    this.send("queue", {
      songs: this.songs(),
      title,
      mid,
      position,
      mode,
      playing,
      restart: true,
    });
  }
  private songs(): QQSong[] {
    return this.queue.map((t) => ({
      mid: t.qqMid!,
      title: t.title,
      artist: t.artist,
      album: t.album,
      duration: t.duration,
      coverUrl: t.coverUrl,
    }));
  }
  onStarted(callback: (track: MusicTrack) => void) {
    this.started = callback;
  }
  onError(
    callback: (
      text: string,
      failure?: { kind: "unavailable" | "other"; trackId: string },
    ) => void,
  ) {
    this.error = callback;
  }
  onTimeUpdate(callback: (seconds: number) => void) {
    this.time = callback;
  }
  onTrackEnded(_callback: () => void) {}
  playTrack(track: MusicTrack, start = 0) {
    if (!this.queue.some((t) => t.qqMid === track.qqMid))
      this.installQueue(
        [...this.queue, track],
        this.title,
        track.qqMid!,
        start,
        this.mode,
        true,
      );
    else this.send("play", {
      mid: track.qqMid,
      position: start,
      resume: this.last?.mid === track.qqMid && Math.abs(start - this.position) < 1,
    });
  }
  pause() {
    this.send("pause");
  }
  resume() {
    this.send("play", { mid: this.last?.mid, position: this.position, resume: true });
  }
  next() {
    this.send("next");
  }
  previous() {
    this.send("previous");
  }
  resetQueue() {
    this.queue = [];
    this.signature = "";
    this.send("clear");
  }
  seek(position: number) {
    this.send("seek", { position });
  }
  setSleepTimer(minutes: number | null) {
    if (minutes === this.timerSelection) return;
    this.timerSelection = minutes;
    this.send("timer", { minutes: minutes || 0 });
  }
  setEqualizer(settings: EqualizerSettings) {
    this.send("eq", settings);
  }
  private applyVolume() {
    this.send("volume", {
      value: this.volume,
      muted: this.muted,
      ducked: this.ducked,
    });
  }
  setMasterVolume(value: number) {
    this.volume = value;
    this.applyVolume();
  }
  setInputMuted(value: boolean) {
    this.muted = value;
    this.applyVolume();
  }
  setSpeechDucking(value: boolean) {
    this.ducked = value;
    this.applyVolume();
  }
  clearPreload() {}
  preloadTrack(_track: MusicTrack | null) {}
  async transitionToTrack(track: MusicTrack, _durationMs = 800) {
    this.playTrack(track);
  }
  getFrequencyData(output: Uint8Array<ArrayBuffer>) {
    output.fill(0);
  }
  getTimeDomainData(output: Uint8Array<ArrayBuffer>) {
    output.fill(128);
  }
  getIsPlaying() {
    return this.playing;
  }
  getElapsedSeconds() {
    return this.position;
  }
}
