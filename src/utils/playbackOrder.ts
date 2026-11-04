import type { PlaybackMode } from '../types/music';
export const PLAYBACK_MODES: { id: PlaybackMode; label: string }[] = [
  { id: 'sequential', label: '顺序播放' },
  { id: 'shuffle', label: '随机播放' },
  { id: 'repeat-one', label: '单曲循环' },
];
export function normalizePlaybackMode(value: unknown): PlaybackMode {
  return PLAYBACK_MODES.some(mode => mode.id === value) ? value as PlaybackMode : 'sequential';
}
export function nextPlaybackMode(mode: PlaybackMode): PlaybackMode {
  return PLAYBACK_MODES[(PLAYBACK_MODES.findIndex(item => item.id === mode) + 1) % PLAYBACK_MODES.length].id;
}

// A shuffled round contains each remaining song once; previous follows listening history.
export class PlaybackOrder {
  private signature = '';
  private remaining: string[] = [];
  private history: string[] = [];
  private position = 0;
  private roundStarted = false;
  private preview?: { key: string; index: number; order: PlaybackOrder };
  constructor(private random: () => number = Math.random) {}
  public select(ids: string[], currentIndex: number, mode: PlaybackMode, action: 'next' | 'previous' | 'ended'): number {
    const preview = this.preview;
    this.preview = undefined;
    if (preview?.key === JSON.stringify([ids, currentIndex, mode, action === 'next' && mode !== 'repeat-one' ? 'ended' : action])) {
      const order = preview.order;
      this.signature = order.signature; this.remaining = order.remaining; this.history = order.history;
      this.position = order.position; this.roundStarted = order.roundStarted;
      return preview.index;
    }
    return this.advance(ids, currentIndex, mode, action);
  }
  // Reserve the automatic successor without moving the listening history.
  public peek(ids: string[], currentIndex: number, mode: PlaybackMode): number {
    const key = JSON.stringify([ids, currentIndex, mode, 'ended']);
    if (this.preview?.key === key) return this.preview.index;
    const order = new PlaybackOrder(this.random);
    order.signature = this.signature; order.remaining = [...this.remaining]; order.history = [...this.history];
    order.position = this.position; order.roundStarted = this.roundStarted;
    const index = order.advance(ids, currentIndex, mode, 'ended');
    this.preview = { key, index, order };
    return index;
  }
  private advance(ids: string[], currentIndex: number, mode: PlaybackMode, action: 'next' | 'previous' | 'ended'): number {
    if (!ids.length) return 0;
    const current = Math.max(0, Math.min(ids.length - 1, currentIndex));
    const signature = JSON.stringify([ids, mode]);
    if (signature !== this.signature || this.history[this.position] !== ids[current]) {
      this.signature = signature; this.remaining = []; this.history = [ids[current]]; this.position = 0; this.roundStarted = false;
    }
    if (action === 'ended' && mode === 'repeat-one') return current;
    if (mode !== 'shuffle') return (current + (action === 'previous' ? ids.length - 1 : 1)) % ids.length;
    if (action === 'previous') {
      if (this.position > 0) this.position--;
      return ids.indexOf(this.history[this.position]);
    }
    if (this.position < this.history.length - 1) return ids.indexOf(this.history[++this.position]);
    if (!this.remaining.length) {
      this.remaining = [...new Set(ids)].filter(id => this.roundStarted || id !== ids[current]);
      for (let i = this.remaining.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [this.remaining[i], this.remaining[j]] = [this.remaining[j], this.remaining[i]];
      }
      const last = this.remaining.length - 1;
      if (last > 0 && this.remaining[last] === ids[current]) [this.remaining[0], this.remaining[last]] = [this.remaining[last], this.remaining[0]];
      this.roundStarted = true;
    }
    const next = this.remaining.pop();
    if (!next) return current;
    this.history.push(next); this.position++;
    if (this.history.length > 1000) { this.history.shift(); this.position--; }
    return ids.indexOf(next);
  }
}
