export const LYRIC_STYLES = [
  ['flow', '云阶'], ['luminous', '流光'], ['floating', '浮游'],
  ['tilt', '倾诉'], ['chorus', '群唱'], ['fume', '浮名'], ['clock', '时计'],
] as const;
export type LyricStyle = typeof LYRIC_STYLES[number][0];
export type SceneLyricStyle = Exclude<LyricStyle, 'flow' | 'luminous' | 'floating'>;
export const LYRIC_STYLE_DESCRIPTIONS: Record<LyricStyle, string> = {
  flow: '跟随滚动，远处的歌词渐渐虚化', luminous: '单句居中，文字随句内进度渐亮', floating: '文字错落，轻旋入场',
  tilt: '水平主句与斜向副句交替倾诉', chorus: '歌词化为左右交替的对话气泡', fume: '巨幅字影与前后文叠成文字海报', clock: '时间表盘与歌词轨道随播放推进',
};
export function normalizeLyricStyle(value: unknown): LyricStyle {
  return LYRIC_STYLES.some(([id]) => id === value) ? value as LyricStyle : 'flow';
}
export function isSceneStyle(style: LyricStyle): style is SceneLyricStyle {
  return style === 'tilt' || style === 'chorus' || style === 'fume' || style === 'clock';
}
