import { mergeSongs, type QQSong } from "../src/utils/music";
import { normalizeSongs } from "../shared/music-normalize.mjs";
import { music } from "./api";
export type Playlist = {
  tid?: string | number;
  dissid?: string | number;
  dirid?: string | number;
  title?: string;
  dissname?: string;
  cover?: string;
};
export async function playlistSongs(
  playlist: Playlist,
  signal: AbortSignal,
): Promise<QQSong[]> {
  const tid = playlist.tid ?? playlist.dissid;
  if (!tid && playlist.dirid === undefined) throw Error("这张歌单缺少可用编号");
  const path =
    "/user/playlist-detail?" +
    (tid
      ? "tid=" + encodeURIComponent(tid)
      : "dirid=" + encodeURIComponent(playlist.dirid!));
  let data;
  try {
    data = await music(path, { signal });
  } catch (e) {
    if (!tid || signal.aborted) throw e;
    data = await music(
      "/getSongListDetail?disstid=" + encodeURIComponent(tid),
      { signal },
    );
  }
  let loaded: QQSong[] = normalizeSongs(data),
    offset = Array.isArray(data.songs) ? data.songs.length : loaded.length;
  const pages = new Set([JSON.stringify(loaded.map((s) => s.mid))]);
  while (
    data.more === true ||
    data.more === 1 ||
    (Number.isFinite(data.total) && offset < data.total)
  ) {
    if (!offset) throw Error("歌单未读取完整，请稍后重试");
    data = await music(path + "&offset=" + offset + "&limit=100", { signal });
    const next = normalizeSongs(data),
      count = Array.isArray(data.songs) ? data.songs.length : next.length,
      fingerprint = JSON.stringify(next.map((s: QQSong) => s.mid));
    if (!count || pages.has(fingerprint))
      throw Error("歌单未读取完整，请稍后重试");
    pages.add(fingerprint);
    offset += count;
    loaded = mergeSongs(loaded, next);
  }
  if (!loaded.length) throw Error("这张歌单暂无可用歌曲");
  return loaded;
}
