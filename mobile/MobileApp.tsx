import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  AudioLines,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Heart,
  Headphones,
  ListMusic,
  MessageCircle,
  Mic,
  Moon,
  MoreHorizontal,
  Music2,
  Pause,
  Play,
  Plus,
  Repeat,
  Search,
  Send,
  Settings2,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  Sun,
  UserRound,
} from "lucide-react";
import { useSoundisle } from "../src/hooks/useSoundisle";
import { readLocal, saveLocal, type QQSong } from "../src/utils/music";
import { audioEngine } from "../src/utils/audioEngine";
import { nextPlaybackMode } from "../src/utils/playbackOrder";
import { VoiceInput, type VoiceInputState } from "../src/utils/voiceInput";
import { EQ_PRESETS } from "../src/utils/equalizer";
import { TrackCover } from "../src/components/TrackCover";
import { DEFAULT_AGENT_PROMPT } from "../shared/agent-policy.mjs";
import { SPEECH_MODELS, SPEECH_VOICES } from "../shared/speech.mjs";
import { newAgentSession } from "../src/utils/agentSession";
import type { SceneMode, ServiceSettings } from "../src/types/music";
import { scenes, formatTime } from "./scenes";
import { QQSettings, MiniMaxSettings } from "./ServiceSettings";
import { request, music } from "./api";
import { playlistSongs, type Playlist } from "./library";
import { IconButton, Modal, Toast } from "./ui";
import { useTrackSwipe } from "./useTrackSwipe";

const sceneModes: SceneMode[] = ["rest", "focus", "sleep", "workout"];
function initialSettings(): Partial<ServiceSettings> {
  const value = readLocal<Partial<ServiceSettings>>(
    "soundisle:mobile-settings",
    {},
  );
  return {
    chatModel:
      value.chatModel === "local-heuristic" ? "local-heuristic" : "MiniMax-M3",
    voiceTts: value.voiceTts === "silent" ? "silent" : "minimax",
    voiceModel: SPEECH_MODELS.some((v) => v.id === value.voiceModel)
      ? value.voiceModel
      : SPEECH_MODELS[0].id,
    voiceId: SPEECH_VOICES.some((v) => v.id === value.voiceId)
      ? value.voiceId
      : SPEECH_VOICES[0].id,
    voiceSpeed:
      typeof value.voiceSpeed === "number"
        ? Math.max(0.8, Math.min(1.2, value.voiceSpeed))
        : 0.95,
    voiceAutoPlay: value.voiceAutoPlay !== false,
    motionEnabled: value.motionEnabled !== false,
  };
}
export default function MobileApp() {
  const [savedSettings] = useState(initialSettings);
  const core = useSoundisle(
    savedSettings,
    "请先搜索一首歌，或让阿屿为你选歌。",
  );
  const trackSwipe = useTrackSwipe(core.handlePrev, core.handleNext);
  const {
    currentTrack: track,
    settings,
    isPlaying: playing,
    currentTime: progress,
    qqQueue: queue,
    queueTitle,
    messages,
    isLoadingAgent,
  } = core;
  const [tab, setTab] = useState<"listen" | "companion" | "library">("listen"),
    [scene, setScene] = useState(
      Math.max(0, sceneModes.indexOf(core.currentScene)),
    ),
    [route, setRoute] = useState(location.hash.slice(1)),
    [toast, setToast] = useState(""),
    [draft, setDraft] = useState(""),
    [lyrics, setLyrics] = useState(false);
  const [favorites, setFavorites] = useState<QQSong[]>(() =>
    readLocal("soundisle:mobile-favorites", []),
  );
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [songs, setSongs] = useState<QQSong[]>([]),
    [title, setTitle] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  const [playlists, setPlaylists] = useState<Playlist[]>([]),
    [selected, setSelected] = useState<Playlist | null>(null),
    [offered, setOffered] = useState<{
      title: string;
      songs: QQSong[];
      scene?: SceneMode;
    } | null>(null);
  const [serviceStatus, setServiceStatus] = useState({
    qq: "正在检查…",
    minimax: "正在检查…",
  });
  const [voiceState, setVoiceState] = useState<VoiceInputState>({
    status: "idle",
  });
  const lyricRail = useRef<HTMLDivElement>(null);
  const activeLyric = track.lyrics.reduce(
    (active, line, index) => (progress >= line.timeSec ? index : active),
    -1,
  );
  const main = useRef<HTMLElement>(null),
    chatEnd = useRef<HTMLDivElement>(null);
  const hasPlayer = route.split("/")[0] === "player",
    sheet = hasPlayer ? route.split("/")[1] : route;
  const currentScene = scenes[scene],
    isLiked = favorites.some((s) => s.mid === track.qqMid);
  const voice = useMemo(
    () =>
      new VoiceInput(setVoiceState, (text) => {
        setDraft(text);
        setTab("companion");
        setToast("语音已转成文字，请确认后发送");
        if (location.hash === "#voice") history.back();
      }),
    [],
  );
  const updateSettings = (next: Partial<ServiceSettings>) =>
    core.setSettings((p) => ({ ...p, ...next }));
  const open = (next: string) => {
    history.pushState({ mobileOverlay: true }, "", `#${next}`);
    setRoute(next);
  };
  const openSheet = (next: string) => open(hasPlayer ? `player/${next}` : next);
  const close = () => {
    if (history.state?.mobileOverlay) history.back();
    else {
      history.replaceState(null, "", location.pathname);
      setRoute("");
    }
  };
  useEffect(() => {
    const update = () => setRoute(location.hash.slice(1));
    window.addEventListener("popstate", update);
    window.addEventListener("hashchange", update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener("hashchange", update);
    };
  }, []);
  useEffect(() => {
    saveLocal("soundisle:mobile-settings", {
      chatModel: settings.chatModel,
      voiceTts: settings.voiceTts,
      voiceId: settings.voiceId,
      voiceModel: settings.voiceModel,
      voiceSpeed: settings.voiceSpeed,
      voiceAutoPlay: settings.voiceAutoPlay,
      motionEnabled: settings.motionEnabled,
    });
  }, [settings]);
  useEffect(() => {
    saveLocal("soundisle:mobile-favorites", favorites);
  }, [favorites]);
  useEffect(() => {
    setScene(Math.max(0, sceneModes.indexOf(core.currentScene)));
  }, [core.currentScene]);
  useEffect(() => {
    main.current?.scrollTo({ top: 0 });
  }, [tab]);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "nearest" });
  }, [messages, isLoadingAgent]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => () => voice.cancel(false), [voice]);
  useEffect(() => {
    const background = () => {
      if (audioEngine.isNative && document.hidden) {
        voice.cancel();
        core.speechPlayer.stop();
      }
    };
    document.addEventListener("visibilitychange", background);
    return () => document.removeEventListener("visibilitychange", background);
  }, [voice, core.speechPlayer]);
  useEffect(() => {
    if (sheet !== "voice") voice.cancel();
  }, [sheet, voice]);
  useEffect(() => {
    audioEngine.setInputMuted(
      ["requesting", "recording", "processing"].includes(voiceState.status),
    );
    return () => audioEngine.setInputMuted(false);
  }, [voiceState.status]);
  useEffect(() => {
    const c = new AbortController();
    const refresh = () => {
      music("/login/status", { signal: c.signal })
        .then((d) =>
          setServiceStatus((p) => ({
            ...p,
            qq: d.data?.profile ? "已授权" : "待授权",
          })),
        )
        .catch(() => {
          if (!c.signal.aborted)
            setServiceStatus((p) => ({ ...p, qq: "连接待检查" }));
        });
      request("/api/voice/config", { signal: c.signal })
        .then((d) =>
          setServiceStatus((p) => ({
            ...p,
            minimax: d.configured ? "已配置" : "尚未配置",
          })),
        )
        .catch(() => {
          if (!c.signal.aborted)
            setServiceStatus((p) => ({ ...p, minimax: "连接待检查" }));
        });
    };
    refresh();
    window.addEventListener("soundisle:music-auth-changed", refresh);
    return () => {
      c.abort();
      window.removeEventListener("soundisle:music-auth-changed", refresh);
    };
  }, [revision]);
  useEffect(() => {
    setError("");
    setBusy(false);
    if (
      !["search", "daily", "qq-favorites", "my-playlists", "playlist"].includes(
        sheet,
      )
    )
      return;
    setSongs([]);
    if (sheet === "search" && !query.trim()) {
      setBusy(false);
      return;
    }
    const c = new AbortController();
    setBusy(true);
    const load = async () => {
      if (sheet === "my-playlists") {
        const d = await music("/user/playlist", { signal: c.signal });
        if (!c.signal.aborted) setPlaylists(d.playlist || []);
        return;
      }
      if (sheet === "playlist" && offered) {
        setSongs(offered.songs);
        setTitle(offered.title);
        return;
      }
      if (sheet === "playlist" && selected) {
        const list = await playlistSongs(selected, c.signal);
        if (!c.signal.aborted) {
          setSongs(list);
          setTitle(selected.title || selected.dissname || "我的歌单");
        }
        return;
      }
      const path =
        sheet === "search"
          ? "/search?keyword=" + encodeURIComponent(query.trim())
          : sheet === "daily"
            ? "/user/daily-songs"
            : "/user/liked-songs";
      const d = await music(path, { signal: c.signal });
      if (!c.signal.aborted) {
        setSongs(d.songs || []);
        setTitle(
          sheet === "search"
            ? query
            : sheet === "daily"
              ? "每日推荐"
              : "QQ 音乐 · 我喜欢",
        );
      }
    };
    load()
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setBusy(false);
      });
    return () => c.abort();
  }, [sheet, query, selected, offered, revision]);
  useEffect(() => {
    if (audioEngine.isNative || !("mediaSession" in navigator) || !track.qqMid)
      return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album,
      artwork: [{ src: track.coverUrl }],
    });
    const handlers: Partial<
      Record<MediaSessionAction, MediaSessionActionHandler>
    > = {
      play: () => {
        if (!playing) core.handleTogglePlay();
      },
      pause: () => {
        if (playing) core.handleTogglePlay();
      },
      nexttrack: () => core.handleNext(),
      previoustrack: core.handlePrev,
      seekto: (d) => {
        if (d.seekTime !== undefined) core.handleSeek(d.seekTime);
      },
    };
    for (const [action, handler] of Object.entries(handlers)) {
      try {
        navigator.mediaSession.setActionHandler(
          action as MediaSessionAction,
          handler,
        );
      } catch {}
    }
    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
    return () => {
      for (const action of Object.keys(handlers)) {
        try {
          navigator.mediaSession.setActionHandler(
            action as MediaSessionAction,
            null,
          );
        } catch {}
      }
    };
  }, [track, playing]);
  useEffect(() => {
    const rail = lyricRail.current;
    const line = rail?.querySelector<HTMLElement>(".current-lyric");
    if (rail && line)
      rail.scrollTo({
        top: line.offsetTop - rail.clientHeight / 2 + line.offsetHeight / 2,
        behavior: settings.motionEnabled ? "smooth" : "auto",
      });
  }, [activeLyric, lyrics, hasPlayer, track.id]);
  const toggleLike = () => {
    if (!track.qqMid) return;
    const song = {
      mid: track.qqMid,
      title: track.title,
      artist: track.artist,
      album: track.album,
      duration: track.duration,
      coverUrl: track.coverUrl,
    };
    setFavorites((p) =>
      isLiked ? p.filter((s) => s.mid !== song.mid) : [song, ...p],
    );
  };
  const send = (text: string) => {
    if (!text.trim() || isLoadingAgent) return;
    setDraft("");
    void core.handleSendMessage(text);
  };
  const recommend = (index = scene) => {
    core.handleSelectScene(sceneModes[index]);
    setTab("companion");
    void core.handleSendMessage(
      `请为我编排适合${scenes[index].name}的真实 QQ 音乐歌单，${scenes[index].label}。`,
      "qq-music",
      "playlist",
    );
  };
  const songRows = (list: QQSong[]) =>
    list.length ? (
      list.map((song) => (
        <div
          className={`track-row ${track.qqMid === song.mid ? "selected-track" : ""}`}
          key={song.mid}
        >
          <button
            className="track-select"
            aria-label={`播放 ${song.title} · ${song.artist}`}
            onClick={() => core.playQQSong(song)}
          >
            <TrackCover
              trackId={song.mid}
              src={song.coverUrl}
              alt=""
              className="song-cover"
            />
            <span>
              <strong>{song.title}</strong>
              <small>{song.artist}</small>
            </span>
            {track.qqMid === song.mid && (
              <AudioLines size={18} className="gold" />
            )}
          </button>
          <IconButton
            label={`追加 ${song.title} 到队列`}
            onClick={() => {
              core.appendQueue([song], title || "我的歌单");
              setToast("已追加到播放队列");
            }}
          >
            <Plus size={19} />
          </IconButton>
        </div>
      ))
    ) : (
      <div className="empty-state">
        <Music2 />
        <h3>这里还没有歌曲</h3>
        <p>搜索一首歌，或让阿屿为你选歌。</p>
      </div>
    );
  const showOffer = (
    playlist: { title: string; songs: QQSong[] },
    scene?: SceneMode,
  ) => {
    setSelected(null);
    setOffered({ ...playlist, scene });
    open("playlist");
  };
  const newConversation = () => {
    if (isLoadingAgent) return;
    core.conversationRevision.current++;
    core.speechPlayer.stop();
    core.setAgentSessionId(newAgentSession());
    core.setMessages([
      {
        id: "welcome",
        role: "agent",
        content: "新的对话开始了。想听点什么，或者先聊聊？",
        timestamp: "刚刚",
      },
    ]);
    core.setAgentStatus("");
    setToast("已开始新的对话");
  };
  const shown =
    sheet === "queue"
      ? queue
      : sheet === "favorites"
        ? favorites
        : sheet === "recent"
          ? [...core.listeningHistory].reverse()
          : songs;
  return (
    <div className="mobile-stage" data-motion={settings.motionEnabled}>
      <aside className="desktop-note">
        <img src="/brand/soundisle.svg" alt="声屿" />
        <span>SOUNDISLE / ANDROID</span>
        <h1>
          把一座声屿，
          <br />
          放进口袋。
        </h1>
        <p>音乐与心境陪伴</p>
        <div className="note-rule" />
        <p className="note-detail">
          移动端 · 开发版
          <br />
          暖黑 / 琥珀 / 留白
        </p>
      </aside>
      <div className="phone-app">
        <header className="mobile-header">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setTab("listen");
            }}
            className="brand"
          >
            <img src="/brand/soundisle.svg" alt="" />
            <span>
              声屿<small>SOUNDISLE</small>
            </span>
          </a>
          <div className="header-actions">
            <IconButton label="打开设置" onClick={() => open("settings")}>
              <Settings2 size={20} />
            </IconButton>
          </div>
        </header>
        <main className="mobile-main" ref={main}>
          {tab === "listen" && (
            <div className="page-enter">
              <div className="greeting">
                <div>
                  <p className="eyebrow">YOUR LITTLE ISLAND</p>
                  <h1>此刻，听从自己的心。</h1>
                  <p>把世界调轻一点，把自己听清一点。</p>
                </div>
                <span className="sun-mark">
                  <Sun size={25} />
                </span>
              </div>
              <button className="search-entry" onClick={() => open("search")}>
                <Search size={18} />
                <span>找一首歌，或一种心情</span>
                <span className="search-end">搜索</span>
              </button>
              <div className="scene-tabs" aria-label="聆听场景">
                {scenes.map((item, i) => (
                  <button
                    key={item.name}
                    aria-pressed={scene === i}
                    className={scene === i ? "active" : ""}
                    onClick={() => {
                      setScene(i);
                      core.handleSelectScene(sceneModes[i]);
                    }}
                  >
                    {
                      [
                        <Headphones key="r" />,
                        <Sun key="f" />,
                        <Moon key="s" />,
                        <AudioLines key="w" />,
                      ][i]
                    }
                    {item.name}
                  </button>
                ))}
              </div>
              <section
                className="hero-card"
                style={{ backgroundImage: `url(${currentScene.cover})` }}
              >
                <div className="hero-top">
                  <span className="glass-label">
                    此刻的心境 · {currentScene.name}
                  </span>
                  <span className="hero-number">0{scene + 1} / 04</span>
                </div>
                <div className="hero-bottom">
                  <span className="eyebrow">A MOMENT FOR YOURSELF</span>
                  <h2>{currentScene.title}</h2>
                  <p>{currentScene.subtitle}</p>
                  <button
                    className="hero-play"
                    disabled={isLoadingAgent}
                    onClick={() => recommend()}
                  >
                    <Play size={17} fill="currentColor" />
                    听听这一刻
                    <ArrowRight size={17} />
                  </button>
                </div>
              </section>
              <button
                className="companion-invite"
                onClick={() => setTab("companion")}
              >
                <span className="ayu-avatar">
                  <AudioLines size={23} />
                </span>
                <span>
                  <strong>不知道听什么？让阿屿陪你选。</strong>
                  <small>聊聊心情，遇见合拍的旋律</small>
                </span>
                <ChevronRight size={18} />
              </button>
              <section className="section-block">
                <div className="section-heading">
                  <h2>留给自己的时间</h2>
                  <button className="text-button" onClick={() => open("daily")}>
                    每日推荐
                    <ChevronRight size={15} />
                  </button>
                </div>
                <div className="playlist-grid">
                  {scenes
                    .filter((_, i) => i !== scene)
                    .map((item) => (
                      <button
                        className="playlist-card"
                        key={item.name}
                        disabled={isLoadingAgent}
                        onClick={() => recommend(scenes.indexOf(item))}
                      >
                        <div className="playlist-art">
                          <img src={item.cover} alt="" />
                          <span>
                            <Play size={16} fill="currentColor" />
                          </span>
                        </div>
                        <strong>{item.label}</strong>
                        <small>{item.name} · 让阿屿选歌</small>
                      </button>
                    ))}
                </div>
              </section>
              <div className="page-footnote">
                <span />
                音乐响起的地方，也是你的岛。
              </div>
            </div>
          )}
          {tab === "companion" && (
            <div className="companion-page page-enter">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">ALWAYS HERE FOR YOU</p>
                  <h1>和阿屿，待一会儿。</h1>
                </div>
                <span className="online-dot" />
              </div>
              <div className="chat-greeting">
                <div className="ayu-orbit">
                  <AudioLines size={36} />
                </div>
                <h2>你慢慢说，我在听。</h2>
                <p>
                  想聊聊今天，
                  <br />
                  还是一起找首合心意的歌？
                </p>
              </div>
              <div className="chat-messages" aria-live="polite">
                {messages.map((message) => (
                  <div
                    className={`chat-message ${message.role}`}
                    key={message.id}
                  >
                    {message.role === "agent" && (
                      <span className="chat-author">阿屿</span>
                    )}
                    <p>{message.content}</p>
                    {message.playlist && (
                      <button
                        className="chat-playlist"
                        onClick={() =>
                          showOffer(message.playlist!, message.playlistScene)
                        }
                      >
                        <span>
                          <strong>{message.playlist.title}</strong>
                          <small>
                            {message.playlist.songs.length} 首歌曲 · 查看歌单
                          </small>
                        </span>
                        <Play size={19} />
                      </button>
                    )}
                    {message.role === "agent" &&
                      settings.voiceTts !== "silent" && (
                        <button
                          className="text-button"
                          onClick={() => core.handleSpeak(message.content)}
                        >
                          {core.speechState.text === message.content &&
                          ["playing", "loading"].includes(
                            core.speechState.status,
                          )
                            ? "停止朗读"
                            : "朗读"}
                        </button>
                      )}
                  </div>
                ))}
                {isLoadingAgent && (
                  <p className="service-notice" role="status">
                    阿屿正在想一想…
                  </p>
                )}
                <div ref={chatEnd} />
              </div>
              {messages.length <= 1 && (
                <div className="chat-prompts">
                  {[
                    "今天有点累，想放松一下",
                    "陪我专注一会儿",
                    "睡前，想听点温柔的歌",
                  ].map((text) => (
                    <button
                      disabled={isLoadingAgent}
                      key={text}
                      onClick={() => send(text)}
                    >
                      {text}
                      <Plus size={16} />
                    </button>
                  ))}
                </div>
              )}
              {core.agentStatus && (
                <p className="demo-caption" role="status">
                  {core.agentStatus}
                </p>
              )}
              {core.speechState.error && (
                <p className="service-error" role="alert">
                  {core.speechState.error}
                </p>
              )}
            </div>
          )}
          {tab === "library" && (
            <div className="library-page page-enter">
              <p className="eyebrow">MY LITTLE COLLECTION</p>
              <h1>我的声音角落</h1>
              <button
                className="profile-card profile-button"
                onClick={() => open("personal")}
              >
                <span className="profile-avatar">
                  <UserRound size={28} />
                </span>
                <div>
                  <h2>{core.profile.name || "每一种心情，都有回响"}</h2>
                  <p>{core.profile.city || "设置你的个人偏好"}</p>
                </div>
                <ChevronRight size={18} />
              </button>
              <div className="library-shortcuts">
                <button onClick={() => open("favorites")}>
                  <Heart />
                  <strong>本机收藏</strong>
                  <small>
                    {favorites.length} 首歌曲
                    <ChevronRight size={14} />
                  </small>
                </button>
                <button onClick={() => open("recent")}>
                  <Clock3 />
                  <strong>最近聆听</strong>
                  <small>
                    {core.listeningHistory.length} 首歌曲
                    <ChevronRight size={14} />
                  </small>
                </button>
              </div>
              <section className="section-block">
                <div className="section-heading">
                  <h2>QQ 音乐</h2>
                  <button
                    className="text-button"
                    onClick={() => open("qq-settings")}
                  >
                    {serviceStatus.qq}
                    <ChevronRight size={15} />
                  </button>
                </div>
                <div className="choice-list">
                  <button onClick={() => open("my-playlists")}>
                    <ListMusic />
                    我的歌单
                    <ChevronRight size={18} />
                  </button>
                  <button onClick={() => open("qq-favorites")}>
                    <Heart />
                    QQ 音乐 · 我喜欢
                    <ChevronRight size={18} />
                  </button>
                  <button onClick={() => open("daily")}>
                    <Sun />
                    每日推荐
                    <ChevronRight size={18} />
                  </button>
                </div>
              </section>
              <div className="settings-list">
                <button onClick={() => open("timer")}>
                  <Moon />
                  <span>睡眠定时</span>
                  <small>
                    {settings.sleepTimerMinutes
                      ? `${settings.sleepTimerMinutes} 分钟`
                      : "未开启"}
                  </small>
                  <ChevronRight />
                </button>
                <button onClick={() => open("eq")}>
                  <SlidersHorizontal />
                  <span>听感与音效</span>
                  <ChevronRight />
                </button>
                <button onClick={() => open("settings")}>
                  <Settings2 />
                  <span>偏好设置</span>
                  <ChevronRight />
                </button>
              </div>
            </div>
          )}
        </main>
        <div className="bottom-dock">
          {core.musicError && (
            <p className="playback-error" role="alert">
              {core.musicError}
            </p>
          )}
          {tab === "companion" && (
            <form
              className="chat-composer"
              onSubmit={(e) => {
                e.preventDefault();
                send(draft);
              }}
            >
              <IconButton label="语音输入" onClick={() => open("voice")}>
                <Mic size={21} />
              </IconButton>
              <input
                aria-label="给阿屿的消息"
                placeholder="说说你此刻的心情…"
                value={draft}
                maxLength={8000}
                onChange={(e) => setDraft(e.target.value)}
              />
              <button
                className="send-button"
                type="submit"
                aria-label="发送消息"
                disabled={!draft.trim() || isLoadingAgent}
              >
                <Send size={18} />
              </button>
            </form>
          )}
          <div className="mini-player" role="group" aria-label="当前播放，左滑下一首，右滑上一首" {...trackSwipe}>
            <button
              className="mini-track"
              onClick={() => {
                setLyrics(false);
                open("player");
              }}
              aria-label={`展开播放器：${track.title}`}
            >
              <TrackCover
                src={track.coverUrl}
                trackId={track.id}
                alt=""
                className="mini-cover"
              />
              <span>
                <strong>{track.title}</strong>
                <small>
                  {playing && !core.playbackConfirmed
                    ? "正在连接音频…"
                    : track.artist}
                </small>
              </span>
            </button>
            <IconButton
              label={playing ? "暂停" : "播放"}
              onClick={core.handleTogglePlay}
            >
              {playing ? (
                <Pause fill="currentColor" />
              ) : (
                <Play fill="currentColor" />
              )}
            </IconButton>
            <IconButton label="打开播放队列" onClick={() => open("queue")}>
              <ListMusic size={21} />
            </IconButton>
            <div
              className="mini-progress"
              style={{
                width: `${track.duration ? (progress / track.duration) * 100 : 0}%`,
              }}
            />
          </div>
          <nav className="bottom-nav" aria-label="主导航">
            {(
              [
                { id: "listen", label: "听见", icon: Headphones },
                { id: "companion", label: "阿屿", icon: AudioLines },
                { id: "library", label: "我的", icon: UserRound },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                aria-current={tab === item.id ? "page" : undefined}
                onClick={() => setTab(item.id)}
              >
                <span>
                  <item.icon size={22} />
                </span>
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </div>
      {hasPlayer && (
        <Modal title="完整播放器" full onClose={close}>
          <div
            className="full-player"
            style={
              { "--cover": `url(${track.coverUrl})` } as React.CSSProperties
            }
          >
            <div className="player-header">
              <IconButton label="收起播放器" onClick={close}>
                <ChevronDown />
              </IconButton>
              <div>
                <small>正在聆听</small>
                <strong>{queueTitle}</strong>
              </div>
              <IconButton
                label="播放器更多选项"
                onClick={() => openSheet("options")}
              >
                <MoreHorizontal />
              </IconButton>
            </div>
            <div className="player-body">
              <div className="player-segment">
                <button
                  className={!lyrics ? "active" : ""}
                  onClick={() => setLyrics(false)}
                >
                  封面
                </button>
                <button
                  className={lyrics ? "active" : ""}
                  onClick={() => setLyrics(true)}
                >
                  歌词
                </button>
              </div>
              {lyrics ? (
                <div className="live-lyrics" ref={lyricRail}>
                  {track.lyrics.length ? (
                    track.lyrics.map((line, i) => (
                      <button
                        key={i}
                        className={
                          progress >= line.timeSec &&
                          (!track.lyrics[i + 1] ||
                            progress < track.lyrics[i + 1].timeSec)
                            ? "current-lyric"
                            : ""
                        }
                        onClick={() => core.handleSeek(line.timeSec)}
                      >
                        {line.text}
                      </button>
                    ))
                  ) : (
                    <p>这首歌暂时没有歌词</p>
                  )}
                </div>
              ) : (
                <div className="player-art">
                  <TrackCover
                    src={track.coverUrl}
                    trackId={track.id}
                    alt={`${track.title}封面`}
                  />
                  <span className="art-caption">
                    SOUNDISLE · A MOMENT OF PEACE
                  </span>
                </div>
              )}
              <div className="player-meta">
                <div>
                  <h1>{track.title}</h1>
                  <p>{track.artist}</p>
                </div>
                <IconButton
                  label={isLiked ? "取消本机收藏" : "收藏到本机"}
                  pressed={isLiked}
                  className={isLiked ? "gold" : ""}
                  onClick={toggleLike}
                >
                  <Heart fill={isLiked ? "currentColor" : "none"} />
                </IconButton>
              </div>
              <div className="player-timeline">
                <input
                  type="range"
                  min={0}
                  max={track.duration || 1}
                  disabled={!track.qqMid}
                  value={Math.min(progress, track.duration || 1)}
                  aria-label="播放进度"
                  onChange={(e) => core.handleSeek(Number(e.target.value))}
                />
                <div>
                  <span>{formatTime(progress)}</span>
                  <span>{formatTime(track.duration)}</span>
                </div>
              </div>
              <div className="player-controls">
                <IconButton
                  label={`播放模式：${settings.playbackMode}`}
                  onClick={() =>
                    updateSettings({
                      playbackMode: nextPlaybackMode(settings.playbackMode),
                    })
                  }
                >
                  {settings.playbackMode === "shuffle" ? (
                    <Shuffle />
                  ) : (
                    <>
                      <Repeat />
                      {settings.playbackMode === "repeat-one" && <sup>1</sup>}
                    </>
                  )}
                </IconButton>
                <IconButton label="上一首" onClick={core.handlePrev}>
                  <SkipBack fill="currentColor" />
                </IconButton>
                <IconButton
                  className="main-play"
                  label={playing ? "暂停" : "播放"}
                  onClick={core.handleTogglePlay}
                >
                  {playing ? (
                    <Pause size={30} fill="currentColor" />
                  ) : (
                    <Play size={30} fill="currentColor" />
                  )}
                </IconButton>
                <IconButton label="下一首" onClick={() => core.handleNext()}>
                  <SkipForward fill="currentColor" />
                </IconButton>
                <IconButton
                  label="打开播放队列"
                  onClick={() => openSheet("queue")}
                >
                  <ListMusic />
                </IconButton>
              </div>
              <div className="player-tools">
                <button onClick={() => openSheet("eq")}>
                  <SlidersHorizontal size={18} />
                  听感
                </button>
                <button onClick={() => openSheet("timer")}>
                  <Moon size={18} />
                  {settings.sleepTimerMinutes
                    ? `${settings.sleepTimerMinutes} 分钟`
                    : "定时"}
                </button>
                <button
                  onClick={() => {
                    close();
                    setTab("companion");
                  }}
                >
                  <MessageCircle size={18} />
                  聊聊
                </button>
              </div>
              {core.musicError && (
                <p className="service-error" role="alert">
                  {core.musicError}
                </p>
              )}
            </div>
          </div>
        </Modal>
      )}
      {sheet && (
        <Modal
          key={sheet}
          back={[
            "qq-settings",
            "minimax-settings",
            "personal",
            "agent",
          ].includes(sheet)}
          title={
            (
              {
                queue: `播放队列 · ${queue.length} 首`,
                search: "找一首合心意的歌",
                daily: "每日推荐",
                "qq-favorites": "QQ 音乐 · 我喜欢",
                "my-playlists": "我的歌单",
                playlist:
                  offered?.title ||
                  selected?.title ||
                  selected?.dissname ||
                  "歌单",
                favorites: "本机收藏",
                recent: "最近聆听",
                timer: "睡眠定时",
                eq: "听感与音效",
                settings: "偏好设置",
                "qq-settings": "QQ 音乐",
                "minimax-settings": "MiniMax",
                personal: "个人偏好",
                agent: "阿屿与记忆",
                voice: "语音输入",
                options: "更多选项",
              } as Record<string, string>
            )[sheet] || "声屿"
          }
          onClose={close}
        >
          {sheet === "search" && (
            <form
              className="sheet-search"
              onSubmit={(e) => {
                e.preventDefault();
                setQuery(search.trim());
                setRevision((p) => p + 1);
              }}
            >
              <Search size={18} />
              <input
                autoFocus
                aria-label="搜索 QQ 音乐"
                placeholder="搜索歌曲、歌手或心情"
                value={search}
                maxLength={60}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button
                className="text-button gold"
                disabled={!search.trim() || busy}
              >
                搜索
              </button>
            </form>
          )}
          {[
            "search",
            "daily",
            "qq-favorites",
            "my-playlists",
            "playlist",
          ].includes(sheet) && (
            <>
              {busy && (
                <p className="service-status" role="status">
                  正在读取音乐…
                </p>
              )}
              {error && (
                <div className="empty-state">
                  <p role="alert">{error}</p>
                  <button
                    className="text-button gold"
                    onClick={() => setRevision((p) => p + 1)}
                  >
                    重新加载
                  </button>
                  <button
                    className="text-button"
                    onClick={() => open("qq-settings")}
                  >
                    检查 QQ 音乐配置
                  </button>
                </div>
              )}
            </>
          )}
          {sheet === "my-playlists" &&
            !busy &&
            !error &&
            (playlists.length ? (
              <div className="choice-list">
                {playlists.map((p, i) => (
                  <button
                    key={p.tid || p.dissid || p.dirid || i}
                    onClick={() => {
                      setSelected(p);
                      setOffered(null);
                      open("playlist");
                    }}
                  >
                    {p.title || p.dissname || "未命名歌单"}
                    <ChevronRight size={17} />
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <ListMusic />
                <h3>还没有歌单</h3>
                <p>授权 QQ 音乐后，你的歌单会出现在这里。</p>
              </div>
            ))}
          {[
            "queue",
            "favorites",
            "recent",
            "search",
            "daily",
            "qq-favorites",
            "playlist",
          ].includes(sheet) &&
            !busy &&
            !error && (
              <>
                <div className="list-toolbar">
                  <span>
                    {shown.length} 首歌曲
                    {sheet === "favorites" ? " · 仅保存在本机" : ""}
                  </span>
                  <div className="list-actions">
                    {shown.length > 0 && (
                      <button
                        className="text-button gold"
                        onClick={() =>
                          core.installQueue(
                            shown,
                            sheet === "queue"
                              ? queueTitle
                              : title || "我的歌单",
                            offered?.scene || core.currentScene,
                            true,
                          )
                        }
                      >
                        <Play size={14} />
                        播放全部
                      </button>
                    )}
                    {sheet === "queue" && shown.length > 0 && (
                      <button className="text-button" onClick={core.clearQueue}>
                        清空
                      </button>
                    )}
                    {sheet === "playlist" && shown.length > 0 && (
                      <button
                        className="text-button"
                        onClick={() => {
                          core.appendQueue(shown, title);
                          setToast("已追加到当前队列");
                        }}
                      >
                        追加
                      </button>
                    )}
                  </div>
                </div>
                <div className="sheet-track-list">{songRows(shown)}</div>
              </>
            )}
          {sheet === "timer" && (
            <>
              <p className="sheet-description">让音乐陪你慢慢入睡。</p>
              <div className="timer-grid">
                {[15, 30, 45, 60].map((n) => (
                  <button
                    key={n}
                    className={settings.sleepTimerMinutes === n ? "chosen" : ""}
                    onClick={() => updateSettings({ sleepTimerMinutes: n })}
                  >
                    <strong>{n}</strong>分钟
                  </button>
                ))}
              </div>
              <button
                className="wide-button secondary"
                onClick={() => updateSettings({ sleepTimerMinutes: null })}
              >
                关闭定时{!settings.sleepTimerMinutes && <Check size={17} />}
              </button>
            </>
          )}
          {sheet === "eq" && (
            <>
              <p className="sheet-description">找到你喜欢的声音质感。</p>
              {audioEngine.isNative && (
                <p className="demo-caption">
                  {core.nativeEqSupported === null
                    ? "开始播放后检测设备音效能力。"
                    : core.nativeEqSupported
                      ? "设备均衡器已就绪。"
                      : "当前设备没有可用均衡器，音乐将保持原声。"}
                </p>
              )}
              <div className="choice-list">
                {EQ_PRESETS.map((p) => (
                  <button
                    key={p.name}
                    aria-pressed={
                      JSON.stringify(core.equalizer.gains) ===
                      JSON.stringify(p.gains)
                    }
                    onClick={() =>
                      core.setEqualizer((previous) => ({
                        ...previous,
                        enabled: true,
                        gains: [...p.gains],
                      }))
                    }
                  >
                    {p.name}
                    {JSON.stringify(core.equalizer.gains) ===
                      JSON.stringify(p.gains) && <Check size={18} />}
                  </button>
                ))}
              </div>
            </>
          )}
          {sheet === "settings" && (
            <>
              <p className="settings-label">服务与账户</p>
              <div className="service-entry-list">
                {[
                  {
                    name: "QQ 音乐",
                    icon: Music2,
                    desc: "音乐服务 · 账号授权",
                    status: serviceStatus.qq,
                    route: "qq-settings",
                  },
                  {
                    name: "MiniMax",
                    icon: Sparkles,
                    desc: "API Key · 对话与语音",
                    status: serviceStatus.minimax,
                    route: "minimax-settings",
                  },
                ].map((item) => (
                  <button key={item.name} onClick={() => open(item.route)}>
                    <span className="service-symbol">
                      <item.icon size={22} />
                    </span>
                    <span className="service-entry-copy">
                      <strong>{item.name}</strong>
                      <small>{item.desc}</small>
                      <span className="service-entry-status">
                        {item.status}
                      </span>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                ))}
              </div>
              <p className="settings-label">陪伴与体验</p>
              <div className="choice-list">
                <button
                  role="switch"
                  aria-checked={settings.voiceAutoPlay}
                  onClick={() =>
                    updateSettings({ voiceAutoPlay: !settings.voiceAutoPlay })
                  }
                >
                  <span>
                    阿屿语音回复<small>自动朗读新回复</small>
                  </span>
                  <span
                    className={`toggle ${settings.voiceAutoPlay ? "on" : ""}`}
                  />
                </button>
                <button
                  role="switch"
                  aria-checked={settings.motionEnabled}
                  onClick={() =>
                    updateSettings({ motionEnabled: !settings.motionEnabled })
                  }
                >
                  <span>
                    界面动效<small>关闭后减少界面过渡</small>
                  </span>
                  <span
                    className={`toggle ${settings.motionEnabled ? "on" : ""}`}
                  />
                </button>
                <button onClick={() => open("personal")}>
                  个人偏好
                  <ChevronRight size={17} />
                </button>
                <button onClick={() => open("agent")}>
                  阿屿与记忆
                  <ChevronRight size={17} />
                </button>
              </div>
              <div className="about-preview">
                <img src="/brand/soundisle.svg" alt="" />
                <strong>声屿 SoundIsle</strong>
                <span>Android · 开发版</span>
              </div>
            </>
          )}
          {sheet === "qq-settings" && (
            <QQSettings onUpdate={() => setRevision((p) => p + 1)} />
          )}
          {sheet === "minimax-settings" && (
            <MiniMaxSettings
              settings={settings}
              onChange={updateSettings}
              onUpdate={() => setRevision((p) => p + 1)}
              onSpeak={core.handleSpeak}
              speechState={core.speechState}
            />
          )}
          {sheet === "personal" && (
            <>
              {(
                [
                  ["name", "称呼"],
                  ["city", "城市"],
                  ["preferences", "音乐偏好"],
                  ["workState", "当前状态"],
                ] as const
              ).map(([key, label]) => (
                <label className="service-field" key={key}>
                  {label}
                  <input
                    value={core.profile[key]}
                    maxLength={key === "preferences" ? 1000 : 100}
                    onChange={(e) =>
                      core.setProfile((p) => ({ ...p, [key]: e.target.value }))
                    }
                  />
                </label>
              ))}
              <p className="demo-caption">
                自动保存在本机，用于阿屿理解你的偏好。
              </p>
            </>
          )}
          {sheet === "agent" && (
            <>
              <p className="service-copy">短期对话与长期偏好由当前服务保存。</p>
              <button
                className="wide-button"
                disabled={isLoadingAgent}
                onClick={newConversation}
              >
                开始新对话
              </button>
              <label className="service-field">
                阿屿的交流方式
                <textarea
                  aria-label="Agent 提示词"
                  rows={10}
                  maxLength={12000}
                  value={core.agentPrompt}
                  onChange={(e) => core.setAgentPrompt(e.target.value)}
                />
              </label>
              <button
                className="text-button"
                onClick={() => core.setAgentPrompt(DEFAULT_AGENT_PROMPT)}
              >
                恢复默认提示词
              </button>
              <button
                className="wide-button secondary"
                disabled={isLoadingAgent}
                onClick={async () => {
                  if (
                    !window.confirm(
                      "清除当前服务保存的对话与长期记忆？此操作无法撤销。",
                    )
                  )
                    return;
                  try {
                    await request(
                      "/api/agent/memory?scope=all&sessionId=" +
                        encodeURIComponent(core.agentSessionId),
                      { method: "DELETE" },
                    );
                    newConversation();
                    setToast("已清除对话与长期记忆");
                  } catch (e) {
                    setToast(e instanceof Error ? e.message : "清除失败");
                  }
                }}
              >
                清除对话与长期记忆
              </button>
            </>
          )}
          {sheet === "voice" && (
            <div className="voice-preview">
              <div className="ayu-orbit">
                <Mic size={36} />
              </div>
              <h3>
                {voiceState.status === "recording"
                  ? "我在听，你慢慢说。"
                  : voiceState.status === "processing"
                    ? "正在识别…"
                    : "想说什么，都可以。"}
              </h3>
              <p>每段最多 60 秒，识别后可编辑再发送。</p>
              {voiceState.error && (
                <p className="service-error" role="alert">
                  {voiceState.error}
                </p>
              )}
              <button
                className="wide-button"
                disabled={["processing", "requesting"].includes(
                  voiceState.status,
                )}
                onClick={() =>
                  voiceState.status === "recording"
                    ? voice.stop()
                    : voice.start()
                }
              >
                {voiceState.status === "recording" ? "结束并识别" : "开始录音"}
              </button>
            </div>
          )}
          {sheet === "options" && (
            <div className="choice-list">
              <button onClick={toggleLike}>
                <Heart size={19} />
                {isLiked ? "取消本机收藏" : "收藏到本机"}
              </button>
              <button onClick={() => openSheet("timer")}>
                <Moon size={19} />
                睡眠定时
                <ChevronRight size={17} />
              </button>
              <button onClick={() => openSheet("eq")}>
                <SlidersHorizontal size={19} />
                听感与音效
                <ChevronRight size={17} />
              </button>
            </div>
          )}
        </Modal>
      )}
      {toast && <Toast text={toast} />}
    </div>
  );
}
