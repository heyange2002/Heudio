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
import { calculateNextTrackIndex, analyzeUserPrompt } from './utils/sceneAnalyzer';
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
  const [tracks] = useState<MusicTrack[]>(INITIAL_TRACKS);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentScene, setCurrentScene] = useState<SceneMode>('focus');
  const [activeSection, setActiveSection] = useState<AppSection>('home');
  const [volume, setVolume] = useState(0.85);

  const [ambientMix, setAmbientMix] = useState<AmbientMix>(SCENE_CONFIGS.focus.ambientDefaults);
  const [isMixerOpen, setIsMixerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // User controls & providers
  const [settings, setSettings] = useState<ServiceSettings>({
    musicSource: 'soundisle-builtin',
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
      content: '我是声屿。此刻夜色已深，为你准备了温润的低保真代码流与微雨声。有任何需要或想调整节奏，随时告诉我。',
      timestamp: '刚刚',
      rationale: '检测到当前为夜间心流时段，启动低疲劳度背景音景与68BPM节拍。',
      quickActions: ['深夜写代码，需要深度专注', '有点累了想闭目放空', '准备入睡，请换轻柔声音', '换成纯钢琴'],
    },
  ]);
  const [isLoadingAgent, setIsLoadingAgent] = useState(false);

  // Weather & time context
  const [weatherText] = useState('微雨 19°C · 湿度 76%');
  const [timeContextText] = useState('深夜 23:55 · 心流时区');

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
      audioEngine.playTrack(currentTrack, currentTime);
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

  // Agent message handling via server API with fallback
  const handleSendMessage = async (text: string) => {
    speechPlayer.stop();
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          chatModel: settings.chatModel,
          currentScene,
          currentTrack: currentTrack.title,
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
        // Fallback to pure logic analyzer
        resultData = analyzeUserPrompt(text, { currentScene });
      }

      const agentMsg: AgentMessage = {
        id: String(Date.now() + 1),
        role: 'agent',
        content: resultData.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sceneAdjustment: resultData.recommendedSceneId as SceneMode,
        recommendedTrackId: resultData.recommendedTrackId,
        rationale: resultData.rationale,
        quickActions: resultData.suggestedFollowUps,
      };

      setMessages((prev) => [...prev, agentMsg]);

      // Apply recommended scene and track if changed
      if (resultData.recommendedSceneId && resultData.recommendedSceneId !== currentScene) {
        setCurrentScene(resultData.recommendedSceneId as SceneMode);
      }

      if (resultData.recommendedTrackId) {
        const foundIdx = tracks.findIndex((t) => t.id === resultData.recommendedTrackId);
        if (foundIdx !== -1 && foundIdx !== currentTrackIndex) {
          setCurrentTrackIndex(foundIdx);
          setCurrentTime(0);
          if (isPlaying) {
            audioEngine.playTrack(tracks[foundIdx], 0);
          }
        }
      }

      // Apply ambient adjustments
      if (resultData.ambientAdjustments) {
        handleAmbientMixChange(resultData.ambientAdjustments);
      }

      autoSpeak(resultData.reply);
    } catch (e) {
      console.error('Agent chat error:', e);
      // Fallback
      const fallback = analyzeUserPrompt(text, { currentScene });
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now() + 1),
          role: 'agent',
          content: fallback.reply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          rationale: fallback.rationale,
          quickActions: fallback.suggestedFollowUps,
        },
      ]);
      autoSpeak(fallback.reply);
    } finally {
      setIsLoadingAgent(false);
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
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 pb-36 space-y-8">
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
              />
            </div>
          </div>
        ) : (
          /* Companion Mode (Split: Left Agent Dialogue, Right Visualizer & Synced Lyrics) */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Agent Companion & Measured Dialogue */}
            <div className="lg:col-span-5 space-y-4">
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
            <div className="lg:col-span-7 space-y-6">
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
              />
            </div>
          </div>
        )}

        </div>

        {/* 3. Product Values & User Control Assurances (Subtle editorial section) */}
        {!settings.pureMusicMode && (
          <section className="pt-8 border-t border-stone-800/70">
            <h3 className="text-sm font-semibold text-stone-300 mb-4">
              声屿设计守则 · 以人为本的轻陪伴
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-stone-400 leading-relaxed">
              <div className="p-4 rounded-xl bg-stone-900/40 border border-stone-800/60 space-y-1">
                <h4 className="font-semibold text-stone-200">01. 降低找歌负荷</h4>
                <p>无论何时，只需简单描述你的状态或需求，声屿即刻编排吻合当下的音律。</p>
              </div>
              <div className="p-4 rounded-xl bg-stone-900/40 border border-stone-800/60 space-y-1">
                <h4 className="font-semibold text-stone-200">02. 尊重注意力留白</h4>
                <p>对话始终保持克制适度，支持随时一键切换为纯音乐模式或关闭律动动效。</p>
              </div>
              <div className="p-4 rounded-xl bg-stone-900/40 border border-stone-800/60 space-y-1">
                <h4 className="font-semibold text-stone-200">03. 供应商全面解耦</h4>
                <p>音乐源、AI 聊天模型与 TTS 语音均可自由替换，确保纯净、自主与长久陪伴。</p>
              </div>
            </div>
          </section>
        )}
      </main>

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
        onUpdateSettings={(newSettings) =>
          setSettings((prev) => ({ ...prev, ...newSettings }))
        }
      />
    </div>
  );
}
