import { QQMusicPanel } from './components/QQMusicPanel';
import { MusicSidebar } from './components/MusicSidebar';
import { LyricsModal } from './components/LyricsModal';
import { DEFAULT_AGENT_PROMPT, normalizeAgentPrompt, musicIntentHint } from '../shared/agent-policy.mjs';
import { qqTrack, mergeSongs, parseLyrics, readLocal, saveLocal, type QQSong, type CompanionProfile as Profile } from './utils/music';
import { apiFetch } from './api';
import { currentAgentSession, newAgentSession } from './utils/agentSession';
import { boundedHistory, MEMORY_LIMITS } from '../shared/agent-memory.mjs';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { DEFAULT_SPEECH } from '../shared/speech.mjs';
import { SpeechPlayer, type SpeechState } from './utils/speechPlayer';
import {
  MusicTrack,
  SceneMode,
  AgentMessage,
  ServiceSettings,
} from './types/music';
import { EMPTY_TRACK } from './data/sceneThemes';
import { DEFAULT_EQ, normalizeEqualizer, type EqualizerSettings } from './utils/equalizer';
import { audioEngine } from './utils/audioEngine';
import { PlaybackOrder, normalizePlaybackMode, nextPlaybackMode } from './utils/playbackOrder';
import { PLAYBACK_SESSION_KEY, DEFAULT_QUEUE_TITLE, restorePlaybackSession, trackSong } from './utils/playbackSession';
import { TopBar } from './components/TopBar';
import { AudioVisualizer } from './components/AudioVisualizer';
import { LyricsView, type LyricStyle } from './components/LyricsView';
import { normalizeLyricStyle } from './components/lyrics/styles';
import { AgentCompanion } from './components/AgentCompanion';
import { PlayerControls } from './components/PlayerControls';
import { EqualizerDrawer } from './components/EqualizerDrawer';
import { ProviderSettingsModal } from './components/ProviderSettingsModal';
export default function App() {
  const [restored] = useState(() => restorePlaybackSession(readLocal(PLAYBACK_SESSION_KEY, null)));
  const [tracks, setTracks] = useState<MusicTrack[]>(restored.tracks);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(restored.currentTrackIndex);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackConfirmed, setPlaybackConfirmed] = useState(false);
  const [currentTime, setCurrentTime] = useState(restored.currentTime);
  const [currentScene, setCurrentScene] = useState<SceneMode>(restored.scene);
  const [volume, setVolume] = useState(0.85);

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
    return () => { chatController.current?.abort(); audioEngine.pause(); audioEngine.clearPreload(); audioEngine.onError(() => {}); audioEngine.onStarted(() => {}); audioEngine.onTimeUpdate(() => {}); audioEngine.onTrackEnded(() => {}); };
  }, []);
  useEffect(() => { audioEngine.setSpeechDucking(speechState.status === 'playing'); return () => audioEngine.setSpeechDucking(false); }, [speechState.status]);
  const currentTrack = tracks[currentTrackIndex] || EMPTY_TRACK;
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
    if (!currentTrack.qqMid) { audioEngine.clearPreload(); return; }
    if (!isPlaying || currentTrack.duration <= 0 || currentTime < currentTrack.duration * 0.5) return;
    const nextIndex = playbackOrder.current.peek(tracks.map(track => track.id), currentTrackIndex, settings.playbackMode);
    audioEngine.preloadTrack(tracks[nextIndex]);
  }, [tracks, currentTrackIndex, currentTime, isPlaying, settings.playbackMode]);

  // Sync audio engine callbacks
  useEffect(() => {
    audioEngine.onTimeUpdate((sec) => {
      setCurrentTime(sec);
    });

    audioEngine.onTrackEnded(() => {
      handleNext(true);
    });
  }, [currentTrackIndex, settings.playbackMode, tracks, isPlaying]);

  // Handle sleep timer countdown
  const timerIntervalRef = useRef<number | null>(null);
  useEffect(() => {
    if (settings.sleepTimerMinutes && settings.sleepTimerMinutes > 0 && isPlaying) {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      let remainingSecs = settings.sleepTimerMinutes * 60;

      timerIntervalRef.current = window.setInterval(() => {
        remainingSecs -= 1;
        if (remainingSecs <= 0) {
          audioEngine.pause();
          setIsPlaying(false);
          setSettings((prev) => ({ ...prev, sleepTimerMinutes: null }));
          if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        } else if (remainingSecs <= 30) {
          // Smooth volume fade-out in final 30 seconds
          const fadeVol = (remainingSecs / 30) * volume;
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
    };
  }, [settings.sleepTimerMinutes, isPlaying, volume]);

  const handleTogglePlay = () => {
    if (isPlaying) {
      audioEngine.pause();
      setIsPlaying(false);
    } else {
      if(settings.musicSource==='qq-music'&&!currentTrack.qqMid){setMusicError('请先让阿屿选歌，或在音乐侧栏选择一首 QQ 音乐。');return;}
      failedTracks.current.clear();
      setMusicError(''); setPlaybackConfirmed(false); audioEngine.playTrack(currentTrack, currentTime);
      setIsPlaying(true);
    }
  };

  const moveTrack = (action: 'next' | 'previous' | 'ended') => {
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
    if (isPlaying) audioEngine.seek(sec);
  };

  const handleVolumeChange = (vol: number) => {
    setVolume(vol);
    audioEngine.setMasterVolume(vol);
  };

  const handleSelectScene = (scene: SceneMode) => setCurrentScene(scene);

  const clearQueue = () => {
    failedTracks.current.clear();
    playbackCursor.current = { tracks: [EMPTY_TRACK], index: 0, mode: settings.playbackMode };
    audioEngine.pause(); audioEngine.clearPreload(); agentPlaybackPending.current = false;
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
    setPlaybackConfirmed(false); audioEngine.playTrack(selected); setIsPlaying(true);
  };
  const installQueue = (songs: QQSong[], title: string, scene: SceneMode = currentScene, autoPlay = false, fadeMs = 0) => {
    if (!songs.length) return;
    songs = mergeSongs([], songs);
    const queueTracks = songs.map(song => qqTrack(song, scene));
    failedTracks.current.clear();
    playbackCursor.current = { tracks: queueTracks, index: 0, mode: settings.playbackMode };
    if (!autoPlay || !fadeMs) audioEngine.pause();
    setSettings(prev => ({ ...prev, musicSource: 'qq-music' }));
    setQqQueue(songs); setQueueTitle(title); setTracks(queueTracks);
    setCurrentTrackIndex(0); setCurrentTime(0); setMusicError(''); setPlaybackConfirmed(false);
    if (autoPlay) { if (fadeMs) void audioEngine.transitionToTrack(queueTracks[0], fadeMs); else audioEngine.playTrack(queueTracks[0]); }
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

  return (
    <div
      className="app-shell min-h-screen bg-stone-950 text-stone-100 flex flex-col font-sans transition-colors duration-700 selection:bg-amber-400/30 selection:text-amber-200"
      style={{
        background: `radial-gradient(ellipse at 50% 0%, ${currentTrack.themeColors.bgTint} 0%, #0c0a09 100%)`,
      }}
    >
      {/* Top Bar Navigation */}
      <TopBar onHome={() => setSettings(prev => ({ ...prev, pureMusicMode: false }))}
        pureMusicMode={settings.pureMusicMode}
        onTogglePureMusic={() => setSettings(prev => ({ ...prev, pureMusicMode: !prev.pureMusicMode }))}
        onOpenSettings={() => setIsSettingsOpen(true)} />

      {/* Main Container */}
      <MusicSidebar isOpen={isMusicOpen} onToggle={()=>setIsMusicOpen(prev=>!prev)} onClose={()=>setIsMusicOpen(false)} count={qqQueue.length}>
        <QQMusicPanel
          onPlay={playQQSong} onQueue={(songs, title) => installQueue(songs, title, currentScene, true)} onAppend={appendQueue} onClear={clearQueue} queue={qqQueue} queueTitle={queueTitle} currentMid={currentTrack.qqMid} isPlaying={isPlaying}
          onRecommend={() => { setIsMusicOpen(false); setSettings(prev => ({ ...prev, musicSource: 'qq-music', pureMusicMode: false })); void handleSendMessage('结合我的音乐偏好、当前时间、天气和工作状态，为我编排一张适合现在听的 QQ 音乐歌单。', 'qq-music', 'playlist'); }}/>
        {settings.musicSource === 'qq-music' && !currentTrack.qqMid && <p className="px-2 text-xs leading-relaxed text-stone-500">还未选择歌曲。搜索歌曲或让阿屿选歌后，即可播放 QQ 音乐。</p>}
      </MusicSidebar>

      <main className={`flex-1 max-w-7xl w-full mx-auto pl-16 pr-4 sm:pr-6 2xl:pl-6 py-6 pb-36 space-y-6 ${settings.pureMusicMode ? 'pure-music-main' : 'md:h-[calc(100dvh-4rem)] md:min-h-[640px] md:flex md:flex-col md:flex-none md:pb-32'}`}>
        {musicError && <p role="alert" className="text-sm text-rose-300">{musicError}</p>}
        {/* 2. Core Workspace Layout */}
        <div id="music-workspace" tabIndex={-1} className={`scroll-mt-32 lg:scroll-mt-24 outline-none ${settings.pureMusicMode ? 'pure-music-workspace' : 'md:flex-1 md:min-h-0'}`} data-view={view}>
        {view === 'music' ? (
          /* Pure Music / Zen Mode (Expanded Visualizer + Lyrics Center Stage) */
          <div className="pure-music-layout grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            <div className="pure-music-artwork lg:col-span-7">
              <AudioVisualizer
                currentTrack={currentTrack}
                isPlaying={isPlaying && playbackConfirmed}
                motionEnabled={settings.motionEnabled && !isLyricsOpen}
                onToggleMotion={() =>
                  setSettings((prev) => ({ ...prev, motionEnabled: !prev.motionEnabled }))
                }
                pureMusicMode={true}
              />
            </div>
            <div className="pure-music-lyrics lg:col-span-5">
              <LyricsView
                lyrics={currentTrack.lyrics}
                currentTime={currentTime}
                onSeek={handleSeek}
                accentColor={currentTrack.themeColors.accent}
                onExpand={()=>setIsLyricsOpen(true)}
                lyricStyle={lyricStyle} onStyleChange={setLyricStyle} motionEnabled={settings.motionEnabled} isPlaying={isPlaying && playbackConfirmed} duration={currentTrack.duration}
              />
            </div>
          </div>
        ) : (
          /* Companion Mode (Split: Left Agent Dialogue, Right Visualizer & Synced Lyrics) */
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start md:items-stretch md:h-full md:min-h-0">
            {/* Left Column: Agent Companion & Measured Dialogue */}
            <div className="md:col-span-6 xl:col-span-5 space-y-4 md:flex md:flex-col md:min-h-0">
              {agentStatus && <p role="status" className="text-xs text-stone-400">{agentStatus}</p>}
              <AgentCompanion
                onPlaylistAction={(playlist, action, scene) => {
                  if (action === 'play') { agentPlaybackPending.current = true; installQueue(playlist.songs, playlist.title, scene, true, 800); }
                  else appendQueue(playlist.songs, playlist.title, scene);
                }}
                messages={messages}
                onSendMessage={handleSendMessage}
                isLoading={isLoadingAgent}
                onApplyScene={handleSelectScene}
                currentScene={currentScene}
                weatherText={weatherText}
                timeContextText={timeContextText}
                onSpeakMessage={settings.voiceTts === 'silent' ? undefined : handleSpeak}
                speechState={speechState}
                onStopSpeech={() => speechPlayer.stop()}
                onListeningChange={active => audioEngine.setInputMuted(active)}
              />

            </div>

            {/* Right Column: Visualizer & Synced Lyrics */}
            <div className="md:col-span-6 xl:col-span-7 space-y-4 md:flex md:flex-col md:min-h-0">
              <AudioVisualizer
                currentTrack={currentTrack}
                isPlaying={isPlaying && playbackConfirmed}
                motionEnabled={settings.motionEnabled && !isLyricsOpen}
                onToggleMotion={() =>
                  setSettings((prev) => ({ ...prev, motionEnabled: !prev.motionEnabled }))
                }
                pureMusicMode={false}
              />

              <LyricsView
                lyrics={currentTrack.lyrics}
                currentTime={currentTime}
                onSeek={handleSeek}
                accentColor={currentTrack.themeColors.accent}
                onExpand={()=>setIsLyricsOpen(true)}
                lyricStyle={lyricStyle} onStyleChange={setLyricStyle} motionEnabled={settings.motionEnabled} isPlaying={isPlaying && playbackConfirmed} duration={currentTrack.duration}
              />
            </div>
          </div>
        )}

        </div>


      </main>

      <LyricsModal isOpen={isLyricsOpen} onClose={()=>setIsLyricsOpen(false)} title={currentTrack.title} artist={currentTrack.artist}
        lyrics={currentTrack.lyrics} currentTime={currentTime} onSeek={handleSeek} accentColor={currentTrack.themeColors.accent}
        coverUrl={currentTrack.coverUrl} trackId={currentTrack.id} duration={currentTrack.duration} isPlaying={isPlaying} motionEnabled={settings.motionEnabled}
        onTogglePlay={handleTogglePlay} lyricStyle={lyricStyle} onStyleChange={setLyricStyle}/>

      {/* Floating Bottom Player Controls Dock */}
      <PlayerControls
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        onTogglePlay={handleTogglePlay}
        onNext={() => handleNext(false)}
        onPrev={handlePrev}
        currentTime={currentTime}
        onSeek={handleSeek}
        volume={volume}
        onChangeVolume={handleVolumeChange}
        playbackMode={settings.playbackMode}
        onCyclePlaybackMode={() => setSettings(prev => ({ ...prev, playbackMode: nextPlaybackMode(prev.playbackMode) }))}
        onOpenEqualizer={() => setIsEqualizerOpen(true)}
        sleepTimerMinutes={settings.sleepTimerMinutes}
        onSetSleepTimer={(mins) =>
          setSettings((prev) => ({ ...prev, sleepTimerMinutes: mins }))
        }
      />

      <EqualizerDrawer isOpen={isEqualizerOpen} onClose={() => setIsEqualizerOpen(false)} settings={equalizer} onChange={setEqualizer} />

      {/* Provider & Service Settings Modal */}
      <ProviderSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        profile={profile} onUpdateProfile={setProfile}
        agentPrompt={agentPrompt} onUpdateAgentPrompt={setAgentPrompt}
        agentSessionId={agentSessionId} agentBusy={isLoadingAgent} onNewConversation={() => {
          conversationRevision.current++;
          speechPlayer.stop();
          setAgentSessionId(newAgentSession());
          setMessages([{ id: 'welcome', role: 'agent', content: '新的对话开始了。想听点什么，或者先聊聊？', timestamp: '刚刚' }]);
          setAgentStatus('');
        }}
        listeningCount={listeningHistory.length} onClearListening={() => setListeningHistory([])}
        onUpdateSettings={(newSettings) =>
          setSettings((prev) => ({ ...prev, ...newSettings }))
        }
      />
    </div>
  );
}
