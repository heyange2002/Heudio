import { QQMusicPanel } from './components/QQMusicPanel';
import { MusicSidebar } from './components/MusicSidebar';
import { LyricsModal } from './components/LyricsModal';
import { TopBar } from './components/TopBar';
import { AudioVisualizer } from './components/AudioVisualizer';
import { LyricsView, type LyricStyle } from './components/LyricsView';
import { normalizeLyricStyle } from './components/lyrics/styles';
import { AgentCompanion } from './components/AgentCompanion';
import { PlayerControls } from './components/PlayerControls';
import { EqualizerDrawer } from './components/EqualizerDrawer';
import { ProviderSettingsModal } from './components/ProviderSettingsModal';
import { useSoundisle } from './hooks/useSoundisle';
import { audioEngine } from './utils/audioEngine';
import { nextPlaybackMode } from './utils/playbackOrder';
import { newAgentSession } from './utils/agentSession';
export default function App() {
  const { tracks,currentTrackIndex,currentTrack,currentTime,currentScene,volume,isPlaying,playbackConfirmed,settings,setSettings,equalizer,setEqualizer,isEqualizerOpen,setIsEqualizerOpen,isSettingsOpen,setIsSettingsOpen,isMusicOpen,setIsMusicOpen,isLyricsOpen,setIsLyricsOpen,lyricStyle,setLyricStyle,agentPrompt,setAgentPrompt,speechState,speechPlayer,messages,setMessages,isLoadingAgent,agentSessionId,setAgentSessionId,conversationRevision,agentPlaybackPending,profile,setProfile,listeningHistory,setListeningHistory,qqQueue,queueTitle,musicError,agentStatus,setAgentStatus,weatherText,timeContextText,view,handleTogglePlay,handleNext,handlePrev,handleSeek,handleVolumeChange,handleSelectScene,clearQueue,appendQueue,playQQSong,installQueue,handleSendMessage,handleSpeak } = useSoundisle();
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
