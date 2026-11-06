import { DEFAULT_AGENT_PROMPT, normalizeAgentPrompt, musicIntentHint } from '../../shared/agent-policy.mjs';
import { qqTrack, mergeSongs, parseLyrics, readLocal, saveLocal, type QQSong, type CompanionProfile as Profile } from '../utils/music';
import { apiFetch } from '../api';
import { currentAgentSession, newAgentSession } from '../utils/agentSession';
import { boundedHistory, MEMORY_LIMITS } from '../../shared/agent-memory.mjs';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { DEFAULT_SPEECH } from '../../shared/speech.mjs';
import { SpeechPlayer, type SpeechState } from '../utils/speechPlayer';
import {
  MusicTrack,
  SceneMode,
  AgentMessage,
  ServiceSettings,
} from '../types/music';
import { EMPTY_TRACK } from '../data/sceneThemes';
import { DEFAULT_EQ, normalizeEqualizer, type EqualizerSettings } from '../utils/equalizer';
import { audioEngine } from '../utils/audioEngine';
import { PlaybackOrder, normalizePlaybackMode, nextPlaybackMode } from '../utils/playbackOrder';
import { PLAYBACK_SESSION_KEY, DEFAULT_QUEUE_TITLE, restorePlaybackSession, trackSong } from '../utils/playbackSession';
import type { LyricStyle } from '../components/LyricsView';
import { normalizeLyricStyle } from '../components/lyrics/styles';
export function useSoundisle(initialSettings: Partial<ServiceSettings> = {}, emptyMusicMessage = '请先让阿屿选歌，或在音乐侧栏选择一首 QQ 音乐。') {
  const [restored] = useState(() => restorePlaybackSession(readLocal(PLAYBACK_SESSION_KEY, null)));
  const [tracks, setTracks] = useState<MusicTrack[]>(restored.tracks);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(restored.currentTrackIndex);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackConfirmed, setPlaybackConfirmed] = useState(false);
  const [currentTime, setCurrentTime] = useState(restored.currentTime);
  const [currentScene, setCurrentScene] = useState<SceneMode>(restored.scene);
  const [volume, setVolume] = useState(0.85);
  const [nativeReady, setNativeReady] = useState(!audioEngine.isNative);
  const [nativeEqSupported, setNativeEqSupported] = useState<boolean | null>(null);
  const nativeInitialized = useRef(false);
  const nativeSongs = useRef<QQSong[] | null>(null);

  const [equalizer, setEqualizer] = useState<EqualizerSettings>(() => normalizeEqualizer(readLocal('soundisle:eq', DEFAULT_EQ)));
  const [isEqualizerOpen, setIsEqualizerOpen] = useState(false);
  useEffect(() => { saveLocal('soundisle:eq', equalizer); audioEngine.setEqualizer(equalizer); }, [equalizer]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMusicOpen, setIsMusicOpen] = useState(false);
  const [isLyricsOpen, setIsLyricsOpen] = useState(false);
  const [lyricStyle, setLyricStyle] = useState<LyricStyle>(() => {
    const saved = readLocal<string>('soundisle:lyric-style', 'flow');
    return normalizeLyricStyle(saved);
  });
  useEffect(() => { saveLocal('soundisle:lyric-style', lyricStyle); }, [lyricStyle]);
  const [agentPrompt, setAgentPrompt] = useState<string>(()=>normalizeAgentPrompt(readLocal('soundisle:agent-prompt', DEFAULT_AGENT_PROMPT)));
  useEffect(()=>{saveLocal('soundisle:agent-prompt',agentPrompt);},[agentPrompt]);

  // User controls & providers
  const [settings, setSettings] = useState<ServiceSettings>({
    musicSource: 'qq-music',
    chatModel: 'MiniMax-M3',
    voiceTts: 'minimax',
    voiceModel: DEFAULT_SPEECH.model,
    voiceId: DEFAULT_SPEECH.voiceId,
    voiceSpeed: DEFAULT_SPEECH.speed,
    voiceAutoPlay: true,
    playbackMode: normalizePlaybackMode(readLocal('soundisle:playback-mode', 'sequential')),
    motionEnabled: true,
    pureMusicMode: false,
    sleepTimerMinutes: null,
    ...initialSettings,
  });

  const failedTracks = useRef(new Set<string>());
  const playbackCursor = useRef({ tracks, index: currentTrackIndex, mode: settings.playbackMode });
  playbackCursor.current = { tracks, index: currentTrackIndex, mode: settings.playbackMode };
  const playbackOrder = useRef(new PlaybackOrder());
  useEffect(() => { saveLocal('soundisle:playback-mode', settings.playbackMode); }, [settings.playbackMode]);

  const [speechState, setSpeechState] = useState<SpeechState>({ status: 'idle', text: '' });
  const speechPlayer = useMemo(() => new SpeechPlayer(setSpeechState), []);
  const speechMounted = useRef(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  useEffect(() => {
    speechPlayer.stop();
  }, [speechPlayer, settings.voiceTts, settings.voiceModel, settings.voiceId, settings.voiceSpeed, settings.voiceAutoPlay, settings.pureMusicMode]);
  useEffect(() => {
    speechMounted.current = true;
    return () => { speechMounted.current = false; speechPlayer.stop(); };
  }, [speechPlayer]);
  const autoSpeak = (text: string) => {
    if (audioEngine.isNative && document.hidden) return;
    const latest = settingsRef.current;
    if (speechMounted.current && latest.voiceTts === 'minimax' && latest.voiceAutoPlay && !latest.pureMusicMode) void speechPlayer.speak(text, latest);
  };

  // Agent chat state
  const [messages, setMessages] = useState<AgentMessage[]>([
    {
      id: 'welcome',
      role: 'agent',
      content: '我是阿屿。想聊聊今天，还是一起找首合心意的歌？你慢慢说，我在听。',
      timestamp: '刚刚',
    },
  ]);
  const [isLoadingAgent, setIsLoadingAgent] = useState(false);
  const [agentSessionId, setAgentSessionId] = useState(currentAgentSession);
  const conversationRevision = useRef(0);
  const agentPlaybackPending = useRef(false);

  const [profile, setProfile] = useState<Profile>(() => readLocal('soundisle:profile', { name: '', city: '', preferences: '', workState: '未知' }));
  const [listeningHistory, setListeningHistory] = useState<QQSong[]>(() => readLocal('soundisle:listening', []));
  const [qqQueue, setQqQueue] = useState<QQSong[]>(restored.queue);
  const [queueTitle, setQueueTitle] = useState(restored.title);
  const [musicError, setMusicError] = useState('');
  const [agentStatus, setAgentStatus] = useState('');
  const chatController = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController(), revision = conversationRevision.current;
    apiFetch('/api/agent/memory?sessionId=' + encodeURIComponent(agentSessionId), { signal: controller.signal }).then(async response => {
      if (!response.ok) throw Error();
      const data = await response.json();
      if (!controller.signal.aborted && conversationRevision.current === revision && Array.isArray(data.shortTerm) && data.shortTerm.length) {
        setMessages(boundedHistory(data.shortTerm).map((message, i) => ({ id: `restored-${i}`, role: message.role === 'assistant' ? 'agent' : 'user', content: message.content, timestamp: '本次对话' })));
      }
    }).catch(() => { if (!controller.signal.aborted) setAgentStatus('暂时无法恢复对话记忆，发送消息时将重试'); });
    return () => controller.abort();
  }, [agentSessionId]);
  const [weatherText, setWeatherText] = useState('未设置城市，天气未知');
  const [now, setNow] = useState(() => new Date());
  const timeContextText = now.toLocaleString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }) + ' · ' + profile.workState;
  useEffect(() => { saveLocal('soundisle:profile', profile); }, [profile]);
  useEffect(() => { saveLocal('soundisle:listening', listeningHistory); }, [listeningHistory]);
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    const controller = new AbortController();
    const load = () => apiFetch('/api/context/weather?city=' + encodeURIComponent(profile.city), { signal: controller.signal }).then(async r => {
      if (!r.ok) throw Error(); const data = await r.json(); if (!controller.signal.aborted) setWeatherText(data.summary);
    }).catch(() => { if (!controller.signal.aborted) setWeatherText('天气暂时不可用'); });
    setWeatherText(profile.city ? '正在获取天气…' : '未设置城市，天气未知');
    const timer = setTimeout(load, 600); const interval = setInterval(load, 10 * 60000);
    return () => { controller.abort(); clearTimeout(timer); clearInterval(interval); };
  }, [profile.city]);
  useEffect(() => {
    audioEngine.onError((message, failure) => {
      if (failure?.kind === 'unavailable') {
        const cursor = playbackCursor.current;
        if (cursor.tracks[cursor.index]?.id !== failure.trackId) return;
        failedTracks.current.add(failure.trackId);
        setMusicError(''); setPlaybackConfirmed(false); setCurrentTime(0);
        // Skip unavailable songs even in repeat-one, without retrying failed
        // candidates until a song starts or the user requests playback again.
        const candidates = cursor.tracks.filter(track => track.qqMid && (track.id === failure.trackId || !failedTracks.current.has(track.id)));
        if (candidates.length > 1) {
          const next = playbackOrder.current.select(candidates.map(track => track.id), candidates.findIndex(track => track.id === failure.trackId), cursor.mode, 'next');
          const candidate = candidates[next], index = cursor.tracks.findIndex(track => track.id === candidate.id);
          playbackCursor.current = { ...cursor, index };
          setCurrentTrackIndex(index); setIsPlaying(true);
          audioEngine.playTrack(candidate, 0); return;
        }
        audioEngine.pause(); audioEngine.clearPreload(); setIsPlaying(false);
        agentPlaybackPending.current = false; setAgentStatus(''); return;
      }
      setMusicError(message); setIsPlaying(false); setPlaybackConfirmed(false);
      if (agentPlaybackPending.current) { setAgentStatus('播放尚未成功 · ' + message); agentPlaybackPending.current = false; }
    });
    audioEngine.onStarted(track => { if (track.qqMid) {
      failedTracks.current.clear();
      setIsPlaying(true);
      setPlaybackConfirmed(true);
      if (agentPlaybackPending.current) { setAgentStatus('正在播放 · ' + track.title); agentPlaybackPending.current = false; }
      const song = { mid: track.qqMid, title: track.title, artist: track.artist, album: track.album, duration: track.duration, coverUrl: track.coverUrl };
      setListeningHistory(prev => [...prev.filter(s => s.mid !== song.mid), song].slice(-15));
    } });
    return () => { chatController.current?.abort(); if (!audioEngine.isNative) audioEngine.pause(); audioEngine.clearPreload(); audioEngine.onError(() => {}); audioEngine.onStarted(() => {}); audioEngine.onTimeUpdate(() => {}); audioEngine.onTrackEnded(() => {}); };
  }, []);
  useEffect(() => { audioEngine.setSpeechDucking(speechState.status === 'playing'); return () => audioEngine.setSpeechDucking(false); }, [speechState.status]);
  const currentTrack = tracks[currentTrackIndex] || EMPTY_TRACK;
  useEffect(() => {
    if (!audioEngine.isNative) return;
    audioEngine.attach(state => {
      const first = !nativeInitialized.current;
      nativeInitialized.current = true;
      if (first && !state.songs.length) setMusicError('');
      if (state.songs.length || !first) {
        if (state.songs !== nativeSongs.current) {
          nativeSongs.current = state.songs;
          const existing = new Map(playbackCursor.current.tracks.map(track => [track.qqMid, track]));
          const restored = state.songs.map(song => existing.get(song.mid) || qqTrack(song, currentScene));
          setTracks(restored.length ? restored : [EMPTY_TRACK]);
          setQqQueue(state.songs); setQueueTitle(state.title);
        }
        setCurrentTrackIndex(Math.max(0, state.songs.findIndex(song => song.mid === state.mid)));
        setCurrentTime(state.position); setIsPlaying(state.playing); setPlaybackConfirmed(state.confirmed);
        if (state.error || state.songs.length) setMusicError(state.error || '');
      }
      setNativeEqSupported(state.eqSupported);
      setSettings(previous => {
        const minutes = first ? state.timerMinutes || null : state.timerMinutes ? previous.sleepTimerMinutes : null;
        const mode = first && !state.songs.length ? previous.playbackMode : state.mode;
        return previous.playbackMode === mode && previous.sleepTimerMinutes === minutes ? previous : { ...previous, playbackMode: mode, sleepTimerMinutes: minutes };
      });
      setNativeReady(true);
      if (state.locked) window.dispatchEvent(new Event('soundisle:locked'));
    });
    return () => { if (audioEngine.isNative) audioEngine.detach(); };
  }, []);
  useEffect(() => {
    if (audioEngine.isNative && nativeReady) audioEngine.syncQueue(tracks, queueTitle, currentTrack.qqMid, currentTime, settings.playbackMode);
  }, [tracks, queueTitle, settings.playbackMode, nativeReady]);
  const view = settings.pureMusicMode ? 'music' : 'companion';

  const session = useMemo(() => ({ songs: tracks.filter(track => track.qqMid).map(trackSong),
    queue: qqQueue, title: queueTitle, currentMid: currentTrack.qqMid, scene: currentScene,
  }), [tracks, qqQueue, queueTitle, currentTrack.qqMid, currentScene]);
  const sessionRef = useRef({ ...session, position: currentTime });
  sessionRef.current = { ...session, position: currentTime };
  const savedSecond = Math.floor(currentTime);
  useEffect(() => { saveLocal(PLAYBACK_SESSION_KEY, sessionRef.current); }, [session, savedSecond]);
  useEffect(() => {
    const save = () => saveLocal(PLAYBACK_SESSION_KEY, sessionRef.current);
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', save);
    return () => { save(); window.removeEventListener('pagehide', save); document.removeEventListener('visibilitychange', save); };
  }, []);

  const preloadContext = JSON.stringify([tracks.map(track => track.id), currentTrackIndex, settings.playbackMode]);
  useEffect(() => { audioEngine.clearPreload(); }, [preloadContext]);
  useEffect(() => {
    if (audioEngine.isNative) return;
    if (!currentTrack.qqMid) { audioEngine.clearPreload(); return; }
    if (!isPlaying || currentTrack.duration <= 0 || currentTime < currentTrack.duration * 0.5) return;
    const nextIndex = playbackOrder.current.peek(tracks.map(track => track.id), currentTrackIndex, settings.playbackMode);
    audioEngine.preloadTrack(tracks[nextIndex]);
  }, [tracks, currentTrackIndex, currentTime, isPlaying, settings.playbackMode]);

  // Sync audio engine callbacks
  useEffect(() => {
    if (audioEngine.isNative) return;
    audioEngine.onTimeUpdate((sec) => {
      setCurrentTime(sec);
    });

    audioEngine.onTrackEnded(() => {
      handleNext(true);
    });
  }, [currentTrackIndex, settings.playbackMode, tracks, isPlaying]);

  // Handle sleep timer countdown
  const timerIntervalRef = useRef<number | null>(null);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  useEffect(() => {
    if (audioEngine.isNative) {
      if (nativeReady) audioEngine.setSleepTimer(settings.sleepTimerMinutes);
      return;
    }
    if (settings.sleepTimerMinutes && settings.sleepTimerMinutes > 0) {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      const deadline = Date.now() + settings.sleepTimerMinutes * 60000;

      timerIntervalRef.current = window.setInterval(() => {
        const remainingSecs = Math.max(0, (deadline - Date.now()) / 1000);
        if (remainingSecs <= 0) {
          audioEngine.pause();
          setIsPlaying(false);
          setSettings((prev) => ({ ...prev, sleepTimerMinutes: null }));
          audioEngine.setMasterVolume(volumeRef.current);
          if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        } else if (remainingSecs <= 30) {
          // Smooth volume fade-out in final 30 seconds
          const fadeVol = (remainingSecs / 30) * volumeRef.current;
          audioEngine.setMasterVolume(fadeVol);
        }
      }, 1000);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      audioEngine.setMasterVolume(volumeRef.current);
    };
  }, [settings.sleepTimerMinutes, nativeReady]);

  const handleTogglePlay = () => {
    if (audioEngine.isNative && !nativeReady) { setMusicError('正在连接播放器，请稍候再试'); return; }
    if (isPlaying) {
      audioEngine.pause();
      setIsPlaying(false);
    } else {
      if(settings.musicSource==='qq-music'&&!currentTrack.qqMid){setMusicError(emptyMusicMessage);return;}
      failedTracks.current.clear();
      setMusicError(''); setPlaybackConfirmed(false); audioEngine.playTrack(currentTrack, currentTime);
      setIsPlaying(true);
    }
  };

  const moveTrack = (action: 'next' | 'previous' | 'ended') => {
    if (audioEngine.isNative) { if (action === 'previous') audioEngine.previous(); else audioEngine.next(); return; }
    const cursor = playbackCursor.current;
    if (!cursor.tracks.some(track => track.qqMid)) return;
    const index = playbackOrder.current.select(cursor.tracks.map(track => track.id), cursor.index, cursor.mode, action);
    const selected = cursor.tracks[index];
    if (!selected?.qqMid) return;
    failedTracks.current.clear();
    playbackCursor.current = { ...cursor, index };
    setCurrentTrackIndex(index); setCurrentTime(0); setMusicError('');
    setPlaybackConfirmed(false); setIsPlaying(true);
    audioEngine.playTrack(selected, 0);
  };
  const handleNext = (fromAuto = false) => moveTrack(fromAuto ? 'ended' : 'next');
  const handlePrev = () => moveTrack('previous');

  const handleSeek = (sec: number) => {
    setCurrentTime(sec);
    if (isPlaying || audioEngine.isNative) audioEngine.seek(sec);
  };

  const handleVolumeChange = (vol: number) => {
    setVolume(vol);
    audioEngine.setMasterVolume(vol);
  };

  const handleSelectScene = (scene: SceneMode) => setCurrentScene(scene);

  const clearQueue = () => {
    failedTracks.current.clear();
    playbackCursor.current = { tracks: [EMPTY_TRACK], index: 0, mode: settings.playbackMode };
    if (audioEngine.isNative) audioEngine.resetQueue(); else { audioEngine.pause(); audioEngine.clearPreload(); } agentPlaybackPending.current = false;
    setIsPlaying(false); setPlaybackConfirmed(false); setCurrentTime(0); setCurrentTrackIndex(0);
    setTracks([EMPTY_TRACK]); setQqQueue([]); setQueueTitle(DEFAULT_QUEUE_TITLE); setMusicError('');
    setAgentStatus('播放列表已清空');
  };
  const appendQueue = (songs: QQSong[], title: string, scene: SceneMode = currentScene) => {
    const existing = tracks.filter(track => track.qqMid);
    const merged = mergeSongs(existing.map(trackSong), songs);
    const byMid = new Map(existing.map(track => [track.qqMid, track]));
    setTracks(merged.map(song => byMid.get(song.mid) || qqTrack(song, scene)));
    setQqQueue(merged);
    if (!existing.length) { setQueueTitle(title); setCurrentTrackIndex(0); }
    const added = merged.length - existing.length;
    setAgentStatus(added ? `已追加 ${added} 首到当前歌单，共 ${merged.length} 首` : '这些歌曲已在当前歌单中');
  };
  const playQQSong = (song: QQSong) => {
    const existing = tracks.filter(track => track.qqMid);
    const selected = existing.find(track => track.qqMid === song.mid) || qqTrack(song, currentScene);
    const nextTracks = existing.some(track => track.qqMid === song.mid) ? existing : [...existing, selected];
    setSettings(prev => ({ ...prev, musicSource: 'qq-music' }));
    setTracks(nextTracks); setQqQueue(nextTracks.map(trackSong));
    setCurrentTrackIndex(nextTracks.findIndex(track => track.qqMid === song.mid)); setCurrentTime(0); setMusicError('');
    failedTracks.current.clear();
    playbackCursor.current = { tracks: nextTracks, index: nextTracks.findIndex(track => track.qqMid === song.mid), mode: settings.playbackMode };
    setPlaybackConfirmed(false);
    if (audioEngine.isNative) audioEngine.installQueue(nextTracks, queueTitle, song.mid, 0, settings.playbackMode, true); else audioEngine.playTrack(selected);
    setIsPlaying(true);
  };
  const installQueue = (songs: QQSong[], title: string, scene: SceneMode = currentScene, autoPlay = false, fadeMs = 0) => {
    if (!songs.length) return;
    songs = mergeSongs([], songs);
    const queueTracks = songs.map(song => qqTrack(song, scene));
    failedTracks.current.clear();
    playbackCursor.current = { tracks: queueTracks, index: 0, mode: settings.playbackMode };
    if (!audioEngine.isNative && (!autoPlay || !fadeMs)) audioEngine.pause();
    setSettings(prev => ({ ...prev, musicSource: 'qq-music' }));
    setQqQueue(songs); setQueueTitle(title); setTracks(queueTracks);
    setCurrentTrackIndex(0); setCurrentTime(0); setMusicError(''); setPlaybackConfirmed(false);
    if (audioEngine.isNative) audioEngine.installQueue(queueTracks, title, songs[0].mid, 0, settings.playbackMode, autoPlay);
    else if (autoPlay) { if (fadeMs) void audioEngine.transitionToTrack(queueTracks[0], fadeMs); else audioEngine.playTrack(queueTracks[0]); }
    setIsPlaying(autoPlay);
  };
  useEffect(() => {
    if (!currentTrack.qqMid) return;
    const mid = currentTrack.qqMid, controller = new AbortController();
    apiFetch('/api/music/getLyric?songmid=' + encodeURIComponent(mid), { signal: controller.signal }).then(async r => {
      if (!r.ok) return; const data = await r.json(); const lyrics = parseLyrics(data.response?.lyric);
      if (!controller.signal.aborted) setTracks(prev => prev.map(t => t.qqMid === mid ? { ...t, lyrics } : t));
    }).catch(() => {});
    return () => controller.abort();
  }, [currentTrack.id]);

  // Agent message handling via server API with fallback
  const handleSendMessage = async (text: string, musicSource = 'qq-music', intent: 'chat' | 'playlist' = 'chat') => {
    if (chatController.current) return;
    conversationRevision.current++;
    const wantsMusic = intent==='playlist'||musicIntentHint(text)==='music';
    if(wantsMusic&&!currentTrack.qqMid){audioEngine.pause();setIsPlaying(false);}
    const controller = new AbortController(); chatController.current = controller;
    speechPlayer.stop(); setAgentStatus(intent === 'playlist' ? '阿屿正在结合你的偏好和此刻状态编排 QQ 音乐歌单…' : '阿屿正在听你说、为你想一想…');
    const userMsg: AgentMessage = {
      id: String(Date.now()),
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg].slice(-MEMORY_LIMITS.messages));
    setIsLoadingAgent(true);

    try {
      let resultData;
      // Send the selected engine to the backend.
      const response = await apiFetch('/api/agent/chat', {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          sessionId: agentSessionId,
          playback: { state: musicError ? 'error' : isPlaying ? (playbackConfirmed ? 'playing' : 'loading') : currentTrack.qqMid ? 'paused' : 'idle', error: musicError },
          profile, musicSource, listeningHistory, intent, agentPrompt: normalizeAgentPrompt(agentPrompt),
          currentQueue: qqQueue.map(song=>({title:song.title,artist:song.artist})),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          chatModel: settings.chatModel,
          currentScene,
          currentTrack: currentTrack.qqMid ? currentTrack.title : '',
          weather: weatherText,
          timeOfDay: timeContextText,
          userPreferences: {
            motionEnabled: settings.motionEnabled,
            autoAdvance: settings.playbackMode !== 'repeat-one',
            playbackMode: settings.playbackMode,
          },
        }),
      });

      if (response.ok) {
        resultData = await response.json();
      } else {
        throw Error(wantsMusic?'这次没能完成歌单编排，请稍后重试。':'暂时无法连接阿屿，请稍后再试。');
      }

      if (controller.signal.aborted) return;
      if (resultData.playlistError || (wantsMusic && !resultData.playlist?.songs?.length && !['pause','resume','next','previous'].includes(resultData.playbackAction))) throw Error(resultData.playlistError || '这次没有找到合适的歌曲，请检查 QQ 音乐连接或稍后重试。');
      setAgentStatus(resultData.mode === 'local' || !response.ok ? (resultData.fallbackReason || '当前为规则回复，尚未连接陪伴模型') : resultData.playbackAction === 'offer_queue' ? '歌单已准备好' : resultData.playlist ? '正在开始播放…' : '阿屿 · MiniMax M3');
      if (resultData.memoryStatus === 'unavailable') setAgentStatus('本次记忆未能保存，音乐与对话仍可继续');
      if (resultData.playlist?.songs?.length && resultData.playbackAction !== 'offer_queue') {
        agentPlaybackPending.current = true;
        installQueue(resultData.playlist.songs, resultData.playlist.title, resultData.recommendedSceneId, true, resultData.fadeMs || 0);
      }
      if (resultData.playbackAction === 'pause') { audioEngine.pause(); setIsPlaying(false); setAgentStatus('音乐已暂停'); }
      if (resultData.playbackAction === 'resume') {
        if (currentTrack.qqMid) { agentPlaybackPending.current = true; audioEngine.playTrack(currentTrack, currentTime); setIsPlaying(true); setPlaybackConfirmed(false); setAgentStatus('正在继续播放…'); }
        else setAgentStatus('当前没有可播放的歌曲，请先选歌');
      }
      if (resultData.playbackAction === 'next') { agentPlaybackPending.current = tracks.some(track => track.qqMid); handleNext(); }
      if (resultData.playbackAction === 'previous') { agentPlaybackPending.current = tracks.some(track => track.qqMid); handlePrev(); }
      const agentMsg: AgentMessage = {
        id: String(Date.now() + 1),
        role: 'agent',
        content: resultData.reply,
        playlist: resultData.playlist,
        playlistScene: resultData.recommendedSceneId,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sceneAdjustment: resultData.recommendedSceneId as SceneMode,
        recommendedTrackId: resultData.recommendedTrackId,
      };

      setMessages((prev) => [...prev, agentMsg].slice(-MEMORY_LIMITS.messages));

      // Apply recommended scene and track if changed
      if (resultData.recommendedSceneId && resultData.recommendedSceneId !== currentScene) {
        setCurrentScene(resultData.recommendedSceneId as SceneMode);
      }

      autoSpeak(resultData.reply);
    } catch (e) {
      if (controller.signal.aborted) return;
      const error = e instanceof Error ? e.message : '这次没能完成请求，请稍后重试。';
      setAgentStatus(error);
      setMessages(prev => [...prev, { id: String(Date.now() + 1), role: 'agent', content: error, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } as AgentMessage].slice(-MEMORY_LIMITS.messages));
      autoSpeak(error);
    } finally {
      if (!controller.signal.aborted) setIsLoadingAgent(false);
      if (chatController.current === controller) chatController.current = null;
    }
  };

  const handleSpeak = (text: string) => {
    if (settings.voiceTts === 'silent') return;
    if (speechPlayer.state.text === text) {
      if (speechPlayer.state.status === 'ready') { void speechPlayer.resume(); return; }
      if (['loading', 'playing'].includes(speechPlayer.state.status)) { speechPlayer.stop(); return; }
    }
    void speechPlayer.speak(text, settings);
  };

  return { nativeEqSupported,nativeReady,tracks,currentTrackIndex,currentTrack,currentTime,currentScene,volume,isPlaying,playbackConfirmed,settings,setSettings,equalizer,setEqualizer,isEqualizerOpen,setIsEqualizerOpen,isSettingsOpen,setIsSettingsOpen,isMusicOpen,setIsMusicOpen,isLyricsOpen,setIsLyricsOpen,lyricStyle,setLyricStyle,agentPrompt,setAgentPrompt,speechState,speechPlayer,messages,setMessages,isLoadingAgent,agentSessionId,setAgentSessionId,conversationRevision,agentPlaybackPending,profile,setProfile,listeningHistory,setListeningHistory,qqQueue,queueTitle,musicError,agentStatus,setAgentStatus,weatherText,timeContextText,view,handleTogglePlay,handleNext,handlePrev,handleSeek,handleVolumeChange,handleSelectScene,clearQueue,appendQueue,playQQSong,installQueue,handleSendMessage,handleSpeak };
}
