export const EQ_BANDS = [
  { frequency: 60, label: '60 Hz', name: '低频' },
  { frequency: 250, label: '250 Hz', name: '中低频' },
  { frequency: 1000, label: '1 kHz', name: '中频' },
  { frequency: 4000, label: '4 kHz', name: '中高频' },
  { frequency: 12000, label: '12 kHz', name: '高频' },
] as const;
export type EqualizerSettings = { enabled: boolean; gains: number[]; balance: number };
export const DEFAULT_EQ: EqualizerSettings = { enabled: true, gains: [0, 0, 0, 0, 0], balance: 0 };
export const EQ_PRESETS = [
  { name: '原声', gains: [0, 0, 0, 0, 0] },
  { name: '温暖', gains: [3, 2, 0, -1, -2] },
  { name: '人声', gains: [-2, -1, 3, 2, 0] },
  { name: '清亮', gains: [-1, 0, 1, 3, 3] },
  { name: '低音', gains: [6, 3, 0, -1, 0] },
];
export function normalizeEqualizer(value: unknown): EqualizerSettings {
  const input = value as Partial<EqualizerSettings> | null;
  const clamp = (v: unknown, limit: number) => typeof v === 'number' && Number.isFinite(v) ? Math.max(-limit, Math.min(limit, v)) : 0;
  return { enabled: input?.enabled !== false, gains: EQ_BANDS.map((_, i) => clamp(input?.gains?.[i], 12)), balance: clamp(input?.balance, 1) };
}
