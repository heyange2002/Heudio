import { QQMusicPanel } from './components/QQMusicPanel';
import { MusicSidebar } from './components/MusicSidebar';
import { LyricsModal } from './components/LyricsModal';
import { DEFAULT_AGENT_PROMPT, normalizeAgentPrompt, musicIntentHint } from '../shared/agent-policy.mjs';
import { qqTrack, parseLyrics, readLocal, saveLocal, type QQSong, type CompanionProfile as Profile } from './utils/music';
import { workspaceView, type AppSection } from './utils/navigation';
import { apiFetch } from './api';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { DEFAULT_SPEECH } from '../shared/speech.mjs';
import { SpeechPlayer, type SpeechState } from './utils/speechPlayer';
import {
  MusicTrack,
  SceneMode,
  AmbientMix,
  AgentMessage,
  ServiceSettings,
} from './types/music';
import { INITIAL_TRACKS, SCENE_CONFIGS } from './data/mockTracks';
import { audioEngine } from './utils/audioEngine';
import { calculateNextTrackIndex } from './utils/sceneAnalyzer';
import { TopBar } from './components/TopBar';
import { AudioVisualizer } from './components/AudioVisualizer';
import { LyricsView } from './components/LyricsView';
import { AgentCompanion } from './components/AgentCompanion';
import { PlayerControls } from './components/PlayerControls';
import { AmbientMixerDrawer } from './components/AmbientMixerDrawer';
import { ProviderSettingsModal } from './components/ProviderSettingsModal';
import {
  Brain,
  Headphones,
  Sparkles,
  Layers,
  ArrowRight,
  Flame,
  CloudRain,
  Waves,
  Wind,
  Coffee,
  CheckCircle2,
} from 'lucide-react';

export default function App() {
  const [tracks, setTracks] = useState<MusicTrack[]>(INITIAL_TRACKS);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentScene, setCurrentScene] = useState<SceneMode>('focus');
  const [activeSection, setActiveSection] = useState<AppSection>('home');
  const [volume, setVolume] = useState(0.85);

  const [ambientMix, setAmbientMix] = useState<AmbientMix>(SCENE_CONFIGS.focus.ambientDefaults);
  const [isMixerOpen, setIsMixerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMusicOpen, setIsMusicOpen] = useState(false);
  const [isLyricsOpen, setIsLyricsOpen] = useState(false);
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
    autoAdvance: true,
    motionEnabled: true,
    pureMusicMode: false,
    sleepTimerMinutes: null,
  });

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

  const [profile, setProfile] = useState<Profile>(() => readLocal('soundisle:profile', { name: '', city: '', preferences: '', workState: '未知' }));
  const [listeningHistory, setListeningHistory] = useState<QQSong[]>(() => readLocal('soundisle:listening', []));
  const [qqQueue, setQqQueue] = useState<QQSong[]>([]);
  const [queueTitle, setQueueTitle] = useState('阿屿为你选的歌');
  const [musicError, setMusicError] = useState('');
  const [agentStatus, setAgentStatus] = useState('');
  const chatController = useRef<AbortController | null>(null);
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
    audioEngine.onError(message => { setMusicError(message); setIsPlaying(false); });
    audioEngine.onStarted(track => { if (track.qqMid) {
      const song = { mid: track.qqMid, title: track.title, artist: track.artist, album: track.album, duration: track.duration, coverUrl: track.coverUrl };
      setListeningHistory(prev => [...prev.filter(s => s.mid !== song.mid), song].slice(-15));
    } });
    return () => { chatController.current?.abort(); audioEngine.pause(); audioEngine.onError(() => {}); audioEngine.onStarted(() => {}); };
  }, []);
  useEffect(() => { audioEngine.setSpeechDucking(speechState.status === 'playing'); return () => audioEngine.setSpeechDucking(false); }, [speechState.status]);
  useEffect(() => {
    if (settings.musicSource === 'soundisle-builtin') { audioEngine.pause(); setIsPlaying(false); setTracks(INITIAL_TRACKS); setCurrentTrackIndex(0); setCurrentTime(0); }
  }, [settings.musicSource]);

  const currentTrack = tracks[currentTrackIndex] || tracks[0];

  const workspaceRef = useRef<HTMLDivElement>(null);
  const view = workspaceView(activeSection, settings.pureMusicMode);
  useEffect(() => {
    if (activeSection === 'home') { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const target = workspaceRef.current;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }, [activeSection]);

  // Sync audio engine callbacks
  useEffect(() => {
    audioEngine.onTimeUpdate((sec) => {
      setCurrentTime(sec);
    });

    audioEngine.onTrackEnded(() => {
      handleNext(true);
    });
  }, [currentTrackIndex, settings.autoAdvance, tracks]);

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
      setMusicError(''); audioEngine.playTrack(currentTrack, currentTime);
      setIsPlaying(true);
    }
  };

  const handleNext = (fromAuto: boolean = false) => {
    const nextIdx = calculateNextTrackIndex(
      currentTrackIndex,
      tracks.length,
      fromAuto ? settings.autoAdvance : true,
      'advance'
    );
    setCurrentTrackIndex(nextIdx);
    setCurrentTime(0);
    if (isPlaying) {
      audioEngine.playTrack(tracks[nextIdx], 0);
    }
  };

  const handlePrev = () => {
    const prevIdx = calculateNextTrackIndex(currentTrackIndex, tracks.length, true, 'previous');
    setCurrentTrackIndex(prevIdx);
    setCurrentTime(0);
    if (isPlaying) {
      audioEngine.playTrack(tracks[prevIdx], 0);
    }
  };

  const handleSeek = (sec: number) => {
    setCurrentTime(sec);
    audioEngine.seek(sec);
  };

  const handleVolumeChange = (vol: number) => {
    setVolume(vol);
    audioEngine.setMasterVolume(vol);
  };

  const handleAmbientMixChange = (partialMix: Partial<AmbientMix>) => {
    const newMix = { ...ambientMix, ...partialMix };
    setAmbientMix(newMix);
    audioEngine.setAmbientMix(newMix);
  };

  const handleResetSceneAmbient = () => {
    const sceneConfig = SCENE_CONFIGS[currentScene];
    if (sceneConfig) {
      setAmbientMix(sceneConfig.ambientDefaults);
      audioEngine.setAmbientMix(sceneConfig.ambientDefaults);
    }
  };

  // Switch scene mode
  const handleSelectScene = (sceneId: SceneMode) => {
    setCurrentScene(sceneId);
    const sceneConfig = SCENE_CONFIGS[sceneId];
    if (sceneConfig) {
      // Find matching track
      const matchingTrackIndex = tracks.findIndex((t) => t.scene === sceneId);
      if (matchingTrackIndex !== -1) {
        setCurrentTrackIndex(matchingTrackIndex);
        setCurrentTime(0);
        if (isPlaying) {
          audioEngine.playTrack(tracks[matchingTrackIndex], 0);
        }
      }
      setAmbientMix(sceneConfig.ambientDefaults);
      audioEngine.setAmbientMix(sceneConfig.ambientDefaults);

      // Add gentle system acknowledgement
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now()),
          role: 'system',
          content: `已为你切换至「${sceneConfig.name}」场景，声景与律动已自然平移。`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }
  };

  const playQQSong = (song: QQSong) => {
    const next = qqTrack(song, currentScene);
    setSettings(prev => ({ ...prev, musicSource: 'qq-music' }));
    setTracks(prev => [next, ...prev.filter(t => t.qqMid && t.qqMid !== song.mid)]);
    setCurrentTrackIndex(0); setCurrentTime(0); setMusicError('');
    audioEngine.playTrack(next); setIsPlaying(true);
  };
  const installQueue = (songs: QQSong[], title: string, scene: SceneMode = currentScene, autoPlay = false) => {
    if (!songs.length) return;
    const queueTracks = songs.map(song => qqTrack(song, scene));
    audioEngine.pause();
    setSettings(prev => ({ ...prev, musicSource: 'qq-music' }));
    setQqQueue(songs); setQueueTitle(title); setTracks(queueTracks);
    setCurrentTrackIndex(0); setCurrentTime(0); setMusicError('');
    if (autoPlay) audioEngine.playTrack(queueTracks[0]);
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

    setMessages((prev) => [...prev, userMsg]);
    setIsLoadingAgent(true);

    try {
      let resultData;
      // Send the selected engine to the backend.
      const response = await apiFetch('/api/agent/chat', {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          profile, musicSource, listeningHistory, intent, agentPrompt: normalizeAgentPrompt(agentPrompt),
          currentQueue: qqQueue.map(song=>({title:song.title,artist:song.artist})),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          history: messages.filter(m => m.role !== 'system' && m.id !== 'welcome').slice(-12).map(m => ({ role: m.role === 'agent' ? 'assistant' : 'user', content: m.content })),
          chatModel: settings.chatModel,
          currentScene,
          currentTrack: currentTrack.qqMid ? currentTrack.title : '',
          weather: weatherText,
          timeOfDay: timeContextText,
          userPreferences: {
            motionEnabled: settings.motionEnabled,
            autoAdvance: settings.autoAdvance,
          },
        }),
      });

      if (response.ok) {
        resultData = await response.json();
      } else {
        throw Error(wantsMusic?'这次没能完成歌单编排，请稍后重试。':'暂时无法连接阿屿，请稍后再试。');
      }

      if (controller.signal.aborted) return;
      if (resultData.playlistError || (wantsMusic && !resultData.playlist?.songs?.length)) throw Error(resultData.playlistError || '这次没有找到合适的歌曲，请检查 QQ 音乐连接或稍后重试。');
      setAgentStatus(resultData.mode === 'local' || !response.ok ? (resultData.fallbackReason || '当前为规则回复，尚未连接陪伴模型') : '阿屿 · MiniMax M3' + (resultData.playlist ? ' · 已为你编排歌单' : ''));
      if (resultData.playlist?.songs?.length) installQueue(resultData.playlist.songs, resultData.playlist.title, resultData.recommendedSceneId, true);
      const agentMsg: AgentMessage = {
        id: String(Date.now() + 1),
        role: 'agent',
        content: resultData.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sceneAdjustment: resultData.recommendedSceneId as SceneMode,
        recommendedTrackId: resultData.recommendedTrackId,
      };

      setMessages((prev) => [...prev, agentMsg]);

      // Apply recommended scene and track if changed
      if (resultData.recommendedSceneId && resultData.recommendedSceneId !== currentScene) {
        setCurrentScene(resultData.recommendedSceneId as SceneMode);
      }

      // Apply ambient adjustments
      if (resultData.ambientAdjustments) {
        handleAmbientMixChange(resultData.ambientAdjustments);
      }

      autoSpeak(resultData.reply);
    } catch (e) {
      if (controller.signal.aborted) return;
      const error = e instanceof Error ? e.message : '这次没能完成请求，请稍后重试。';
      setAgentStatus(error);
      setMessages(prev => [...prev, { id: String(Date.now() + 1), role: 'agent', content: error, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
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
      className="min-h-screen bg-stone-950 text-stone-100 flex flex-col font-sans transition-colors duration-700 selection:bg-amber-400/30 selection:text-amber-200"
      style={{
        background: `radial-gradient(ellipse at 50% 0%, ${currentTrack.themeColors.bgTint} 0%, #0c0a09 100%)`,
      }}
    >
      {/* Top Bar Navigation */}
      <TopBar
        activeSection={activeSection}
        onSelectSection={(sec) => {
          if (sec === 'lyrics') { setIsLyricsOpen(true); return; }
          if (!['home', 'companion', 'visualizer', 'lyrics'].includes(sec)) return;
          setActiveSection(sec as AppSection);
          setSettings(prev => ({ ...prev, pureMusicMode: false }));
        }}
        pureMusicMode={settings.pureMusicMode}
        onTogglePureMusic={() =>
          setSettings((prev) => ({ ...prev, pureMusicMode: !prev.pureMusicMode }))
        }
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenMixer={() => setIsMixerOpen(true)}
        currentSceneName={SCENE_CONFIGS[currentScene].name}
      />

      {/* Main Container */}
      <MusicSidebar isOpen={isMusicOpen} onToggle={()=>setIsMusicOpen(prev=>!prev)} onClose={()=>setIsMusicOpen(false)} count={qqQueue.length}>
        <QQMusicPanel
          onPlay={playQQSong} onQueue={installQueue} queue={qqQueue} queueTitle={queueTitle} currentMid={currentTrack.qqMid} isPlaying={isPlaying}
          onRecommend={() => { setIsMusicOpen(false); setSettings(prev => ({ ...prev, musicSource: 'qq-music', pureMusicMode: false })); setActiveSection('companion'); void handleSendMessage('结合我的音乐偏好、当前时间、天气和工作状态，为我编排一张适合现在听的 QQ 音乐歌单。', 'qq-music', 'playlist'); }}/>
        {settings.musicSource === 'qq-music' && !currentTrack.qqMid && <p className="px-2 text-xs leading-relaxed text-stone-500">还未选择歌曲。搜索歌曲或让阿屿选歌后，即可播放 QQ 音乐。</p>}
      </MusicSidebar>

      <main className="flex-1 max-w-7xl w-full mx-auto pl-16 pr-4 sm:pr-6 2xl:pl-6 py-6 pb-36 space-y-6">
        {/* 1. Context Scene Selector Bar (4 Core Transition Modes) */}
        {!settings.pureMusicMode && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-stone-400">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-stone-200">当前日常心境流转</span>
                <span aria-hidden="true">·</span>
                <span>在专注、休息、运动与睡眠之间自然过渡</span>
              </div>
              <div className="hidden sm:flex items-center gap-2 font-mono text-[11px] text-stone-500">
                <span>{SCENE_CONFIGS[currentScene].targetBpm}</span>
              </div>
            </div>

            {/* Segmented Scene Buttons */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-1 bg-stone-900/70 border border-stone-800/80 rounded-2xl">
              {(['focus', 'rest', 'workout', 'sleep'] as SceneMode[]).map((mode) => {
                const config = SCENE_CONFIGS[mode];
                const isActive = currentScene === mode;
                return (
                  <button
                    key={mode}
                    onClick={() => handleSelectScene(mode)}
                    className={`py-3 px-4 rounded-xl text-left transition-all relative ${
                      isActive
                        ? 'bg-stone-800/95 text-stone-100 shadow-md border border-stone-700/80'
                        : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold">{config.name}</span>
                      {isActive && (
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: config.themeColor }}
                        />
                      )}
                    </div>
                    <p className="text-[11px] text-stone-400 truncate">{config.tagline}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {musicError && <p role="alert" className="text-sm text-rose-300">{musicError}</p>}
        {/* 2. Core Workspace Layout */}
        <div ref={workspaceRef} id="music-workspace" tabIndex={-1} className="scroll-mt-32 lg:scroll-mt-24 outline-none" data-view={view}>
        {view === 'visualizer' ? (
          <section aria-label="声音律动" className="max-w-4xl mx-auto">
            <AudioVisualizer currentTrack={currentTrack} isPlaying={isPlaying} motionEnabled={settings.motionEnabled}
              onToggleMotion={() => setSettings(prev => ({ ...prev, motionEnabled: !prev.motionEnabled }))} pureMusicMode={true} />
          </section>
        ) : view === 'lyrics' ? (
          <section aria-label="沉浸歌词" className="max-w-4xl mx-auto">
            <h2 className="text-xl font-semibold mb-4">{currentTrack.title} · 沉浸歌词</h2>
            <LyricsView lyrics={currentTrack.lyrics} currentTime={currentTime} onSeek={handleSeek} accentColor={currentTrack.themeColors.accent} immersive />
          </section>
        ) : view === 'music' ? (
          /* Pure Music / Zen Mode (Expanded Visualizer + Lyrics Center Stage) */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            <div className="lg:col-span-7">
              <AudioVisualizer
                currentTrack={currentTrack}
                isPlaying={isPlaying}
                motionEnabled={settings.motionEnabled}
                onToggleMotion={() =>
                  setSettings((prev) => ({ ...prev, motionEnabled: !prev.motionEnabled }))
                }
                pureMusicMode={true}
              />
            </div>
            <div className="lg:col-span-5">
              <LyricsView
                lyrics={currentTrack.lyrics}
                currentTime={currentTime}
                onSeek={handleSeek}
                accentColor={currentTrack.themeColors.accent}
                onExpand={()=>setIsLyricsOpen(true)}
              />
            </div>
          </div>
        ) : (
          /* Companion Mode (Split: Left Agent Dialogue, Right Visualizer & Synced Lyrics) */
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            {/* Left Column: Agent Companion & Measured Dialogue */}
            <div className="md:col-span-6 xl:col-span-5 space-y-4">
              {agentStatus && <p role="status" className="text-xs text-stone-400">{agentStatus}</p>}
              <AgentCompanion
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

              {/* Natural sound ambient indicator banner */}
              <div className="rounded-2xl border border-stone-800/80 bg-stone-900/50 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-amber-400/10 text-amber-400">
                    <Waves className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-semibold text-stone-200">
                      自然声景层 · 已同步当前场景
                    </h5>
                    <p className="text-[11px] text-stone-400">
                      雨声 {Math.round(ambientMix.rain * 100)}% · 潮涌 {Math.round(ambientMix.waves * 100)}% · 风声 {Math.round(ambientMix.wind * 100)}%
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsMixerOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium transition-colors"
                >
                  调整混音
                </button>
              </div>
            </div>

            {/* Right Column: Visualizer & Synced Lyrics */}
            <div className="md:col-span-6 xl:col-span-7 space-y-4">
              <AudioVisualizer
                currentTrack={currentTrack}
                isPlaying={isPlaying}
                motionEnabled={settings.motionEnabled}
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
              />
            </div>
          </div>
        )}

        </div>


      </main>

      <LyricsModal isOpen={isLyricsOpen} onClose={()=>setIsLyricsOpen(false)} title={currentTrack.title} artist={currentTrack.artist}
        lyrics={currentTrack.lyrics} currentTime={currentTime} onSeek={handleSeek} accentColor={currentTrack.themeColors.accent}/>

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
        autoAdvance={settings.autoAdvance}
        onToggleAutoAdvance={() =>
          setSettings((prev) => ({ ...prev, autoAdvance: !prev.autoAdvance }))
        }
        motionEnabled={settings.motionEnabled}
        onToggleMotion={() =>
          setSettings((prev) => ({ ...prev, motionEnabled: !prev.motionEnabled }))
        }
        pureMusicMode={settings.pureMusicMode}
        onTogglePureMusic={() =>
          setSettings((prev) => ({ ...prev, pureMusicMode: !prev.pureMusicMode }))
        }
        onOpenMixer={() => setIsMixerOpen(true)}
        sleepTimerMinutes={settings.sleepTimerMinutes}
        onSetSleepTimer={(mins) =>
          setSettings((prev) => ({ ...prev, sleepTimerMinutes: mins }))
        }
      />

      {/* Ambient Sound Mixer Drawer */}
      <AmbientMixerDrawer
        isOpen={isMixerOpen}
        onClose={() => setIsMixerOpen(false)}
        mix={ambientMix}
        onChangeMix={handleAmbientMixChange}
        onResetToSceneDefaults={handleResetSceneAmbient}
      />

      {/* Provider & Service Settings Modal */}
      <ProviderSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        profile={profile} onUpdateProfile={setProfile}
        agentPrompt={agentPrompt} onUpdateAgentPrompt={setAgentPrompt}
        listeningCount={listeningHistory.length} onClearListening={() => setListeningHistory([])}
        onUpdateSettings={(newSettings) =>
          setSettings((prev) => ({ ...prev, ...newSettings }))
        }
      />
    </div>
  );
}
