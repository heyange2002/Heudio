// Tag/keyword retrieval over the authorized catalog. No synthetic tracks or inferred metadata.
const moodTags = {
  melancholic: '舒缓 治愈', sad: '舒缓 治愈', stressed: '舒缓 钢琴', anxious: '平静 轻音乐',
  '烦躁': '舒缓 钢琴', '焦虑': '平静 轻音乐', '失恋': '舒缓 治愈', '疲惫': '舒缓 钢琴',
  calm: '安静', happy: '轻快', focus: '专注 纯音乐', sleep: '睡眠 轻音乐',
};
export function boundedCount(value, fallback = 10) {
  return Number.isInteger(value) ? Math.max(1, Math.min(15, value)) : fallback;
}
export async function recommendByMood(search, { mood, style = '', scene = '', count = 5 }, signal) {
  if (typeof mood !== 'string' || !mood.trim()) throw Error('请提供情绪');
  const moodQuery = moodTags[mood.trim().toLowerCase()] || mood.trim();
  const query = [moodQuery, style, scene].filter(v => typeof v === 'string' && v.trim()).join(' ').slice(0, 60);
  let songs = await search(query, boundedCount(count, 5), signal);
  // A catalog keyword search is not a semantic index. If the full description
  // matches nothing, keep the requested style and let the agent curate candidates.
  const fallback = (typeof style === 'string' && style.trim() ? style.trim() : moodQuery.split(/\s+/).at(-1)).slice(0,60);
  if (!songs.length && fallback !== query) {
    signal?.throwIfAborted();
    songs = await search(fallback, boundedCount(count, 5), signal);
  }
  return songs.slice(0, boundedCount(count, 5));
}
