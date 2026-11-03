export function normalizeSongs(raw) {
  const list = raw?.cdlist?.[0]?.songlist ?? raw?.response?.cdlist?.[0]?.songlist ?? raw?.items ?? raw?.data?.songs ?? raw?.data?.songlist ?? raw?.data?.list ?? raw?.songs ?? raw?.songlist ?? [];
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list.map(item => item.songInfo ?? item.song ?? item).flatMap(s => {
    const mid = s.mid ?? s.songmid;
    if (typeof mid !== 'string' || !/^[a-zA-Z0-9]+$/.test(mid) || seen.has(mid)) return [];
    seen.add(mid);
    const album = s.album ?? {};
    const albumMid = album.mid ?? s.albummid;
    return [{ mid, id: s.id ?? s.songid, title: String(s.title ?? s.name ?? s.songname ?? '未命名歌曲').slice(0, 200),
      artist: (Array.isArray(s.singer) ? s.singer.map(a => a.name).join(' / ') : String(s.artist ?? '')).slice(0, 200),
      album: String(album.title ?? album.name ?? s.albumname ?? ''), duration: Number(s.interval ?? s.duration) || 0,
      coverUrl: typeof albumMid === 'string' && /^[a-zA-Z0-9]+$/.test(albumMid) ? `https://y.gtimg.cn/music/photo_new/T002R500x500M000${albumMid}.jpg` : '',
    }];
  }).slice(0, 30);
}
