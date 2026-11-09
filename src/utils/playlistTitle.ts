export function playlistTitle(playlist: Record<string, unknown>): string {
  for (const field of ['title', 'dissname', 'name', 'dirName', 'dir_name']) {
    const value = playlist[field];
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 200);
  }
  return '未命名歌单';
}
