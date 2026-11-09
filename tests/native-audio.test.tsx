import test from "node:test";
import assert from "node:assert/strict";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import {
  AndroidAudioEngine,
  type AudioBridge,
  type NativePlaybackState,
} from "../src/utils/nativeAudio";
import { qqTrack, type QQSong } from "../src/utils/music";
const songs: QQSong[] = ["one", "two"].map((mid) => ({
  mid,
  title: "Song " + mid,
  artist: "Artist",
  album: "Album",
  duration: 180,
  coverUrl: "",
}));
function bridgeHarness() {
  const commands: any[] = [];
  const bridge: AudioBridge = {
    postMessage: (message) => commands.push(JSON.parse(message)),
  };
  const state = (patch: Partial<NativePlaybackState> = {}) => {
    const command = commands.at(-1);
    bridge.onmessage?.({
      data: JSON.stringify({
        clientId: command.clientId,
        revision: command.revision,
        songs,
        mid: "two",
        title: "Native queue",
        position: 42,
        playing: true,
        confirmed: true,
        mode: "sequential",
        error: "",
        timerMinutes: 0,
        eqSupported: null,
        ...patch,
      }),
    });
  };
  return { commands, bridge, state };
}
test("native audio adopts service playback, ignores stale replies and never reflects progress into queue replacements", () => {
  const h = bridgeHarness(),
    engine = new AndroidAudioEngine(h.bridge),
    states: NativePlaybackState[] = [];
  let started = "";
  engine.onStarted((track) => (started = track.qqMid!));
  engine.attach((value) => states.push(value));
  h.state();
  assert.equal(started, "two");
  assert.equal(engine.getElapsedSeconds(), 42);
  const count = h.commands.length;
  engine.syncQueue(
    songs.map((s) => qqTrack(s, "focus")),
    "Native queue",
    "two",
    42,
    "sequential",
  );
  assert.equal(h.commands.length, count);
  const previousArray = states.at(-1)!.songs;
  const command = h.commands.at(-1);
  h.bridge.onmessage!({
    data: JSON.stringify({
      ...states.at(-1),
      songs: undefined,
      position: 43,
      clientId: command.clientId,
      revision: command.revision,
    }),
  });
  assert.equal(states.at(-1)!.songs, previousArray);
  engine.seek(80);
  h.state({ position: 99, revision: command.revision });
  assert.equal(engine.getElapsedSeconds(), 43);
  h.state({ position: 80 });
  assert.equal(engine.getElapsedSeconds(), 80);
  engine.detach();
  assert(!h.commands.some((c) => c.action === "pause"));
  h.state({ position: 81 });
  assert.equal(states.at(-1)!.position, 80);
});
test("native queue, controls, sleep timer and ducking use commands without exposing cookies or playback tickets", () => {
  const h = bridgeHarness(),
    engine = new AndroidAudioEngine(h.bridge);
  engine.attach(() => {});
  h.state({ timerMinutes: 7 });
  const count = h.commands.length;
  engine.setSleepTimer(7);
  assert.equal(h.commands.length, count);
  engine.playTrack(qqTrack(songs[1], "rest"), 42);
  assert.equal(h.commands.at(-1).resume, true);
  engine.playTrack(qqTrack(songs[1], "rest"), 0);
  assert.equal(h.commands.at(-1).resume, false);
  engine.resume();
  assert.equal(h.commands.at(-1).resume, true);
  engine.installQueue(
    songs.map((s) => qqTrack(s, "rest")),
    "Evening",
    "one",
    0,
    "shuffle",
    true,
  );
  assert.equal(h.commands.at(-1).playing, true);
  assert.equal(h.commands.at(-1).mode, "shuffle");
  assert(!JSON.stringify(h.commands).includes("/stream/"));
  assert(!JSON.stringify(h.commands).includes("Cookie"));
  engine.next();
  engine.previous();
  engine.setSleepTimer(15);
  engine.setSpeechDucking(true);
  assert.equal(h.commands.at(-1).ducked, true);
  engine.setInputMuted(true);
  assert.equal(h.commands.at(-1).muted, true);
  engine.resetQueue();
  assert.equal(h.commands.at(-1).action, "clear");
  assert(h.commands.some((c) => c.action === "timer" && c.minutes === 15));
  assert(h.commands.some((c) => c.action === "previous"));
});
test("async startup keeps asking for an unacknowledged queue after stale replies and acknowledges only accepted snapshots", () => {
  const h = bridgeHarness(), engine = new AndroidAudioEngine(h.bridge);
  const values: NativePlaybackState[] = [];
  engine.attach(value => values.push(value));
  const initial = h.commands.at(-1);
  engine.setMasterVolume(.7);
  h.state({ revision: initial.revision, queueVersion: 3 });
  assert.equal(values.length, 0);
  assert(!h.commands.some(c => c.action === "ack"));
  assert.equal(h.commands.at(-1).queueVersion, -1);
  h.state({ queueVersion: 3 });
  assert.equal(values.at(-1)?.songs.length, 2);
  assert.equal(h.commands.at(-1).action, "ack");
  assert.equal(h.commands.at(-1).queueVersion, 3);
  const count = h.commands.length;
  h.state({ songs: undefined, queueVersion: 3, position: 43 });
  assert.equal(values.at(-1)?.songs.length, 2);
  assert.equal(h.commands.length, count);
  engine.attach(value => values.push(value));
  h.state({ queueVersion: 3 });
  assert.equal(h.commands.at(-1).action, "ack");
  assert.equal(h.commands.at(-1).queueVersion, 3);
});
test("the shared hook reconnects to a live native queue and detaches without pausing background audio", async () => {
  const page = new JSDOM('<div id="root"></div>', {
      url: "https://soundisle.test",
    }),
    h = bridgeHarness();
  Object.assign(globalThis, {
    window: page.window,
    document: page.window.document,
    location: page.window.location,
    history: page.window.history,
    localStorage: page.window.localStorage,
    sessionStorage: page.window.sessionStorage,
    Event: page.window.Event,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  (page.window as any).SoundisleAudio = h.bridge;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({ data: {}, shortTerm: [], summary: "未知" });
  const { useSoundisle } = await import("../src/hooks/useSoundisle");
  let current: ReturnType<typeof useSoundisle>;
  function Harness() {
    current = useSoundisle();
    return null;
  }
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => h.state());
    assert.equal(current!.currentTrack.qqMid, "two");
    assert.equal(current!.currentTime, 42);
    assert.equal(current!.isPlaying, true);
    assert.equal(current!.qqQueue.length, 2);
    assert(!h.commands.some((c) => c.action === "queue"));
    await act(async () => h.state({ mid: "one", position: 0 }));
    assert.equal(current!.currentTrack.qqMid, "one");
    assert(!h.commands.some((c) => c.action === "play" || c.action === "next"));
    await act(async () =>
      h.state({ mid: "one", playing: false, confirmed: false, position: 0 }),
    );
    await act(async () => current!.handleSeek(30));
    assert.equal(h.commands.at(-1).action, "seek");
    assert.equal(h.commands.at(-1).position, 30);
    await act(async () =>
      h.state({ mid: "one", playing: false, confirmed: false, position: 30 }),
    );
    assert.equal(current!.currentTime, 30);
    await act(async () => current!.clearQueue());
    assert(h.commands.some((c) => c.action === "clear"));
    await act(async () =>
      h.state({
        songs: [],
        mid: "",
        playing: false,
        confirmed: false,
        position: 0,
        title: "阿屿为你选的歌",
      }),
    );
    assert.equal(current!.qqQueue.length, 0);
    let chatTurn = 0;
    const offeredSongs = [{ ...songs[0], mid: 'offeredSong', title: '刚才推荐的歌曲' }];
    globalThis.fetch = async (url) => String(url) === '/api/agent/chat'
      ? Response.json({ reply: '准备好了。', mode: 'control', playbackAction: ++chatTurn === 1 ? 'offer_queue' : 'play_queue', playlist: { title: '刚才推荐的歌单', songs: offeredSongs } })
      : Response.json({ data: {}, shortTerm: [], summary: '未知' });
    await act(async () => current!.setSettings(previous => ({ ...previous, voiceAutoPlay: false })));
    const beforeOffer = h.commands.filter(c => c.action === 'queue').length;
    await act(async () => current!.handleSendMessage('推荐一个歌单'));
    assert.equal(h.commands.filter(c => c.action === 'queue').length, beforeOffer);
    assert.equal(current!.isPlaying, false);
    await act(async () => current!.handleSendMessage('开始播放'));
    const installed = h.commands.filter(c => c.action === 'queue').at(-1);
    assert.equal(installed.mid, 'offeredSong');
    assert.equal(installed.playing, true);
    assert.equal(installed.restart, true);
    assert.equal(current!.playbackConfirmed, false);
    assert.equal(current!.agentStatus, '正在开始播放…');
    await act(async () => h.state({ songs: offeredSongs, mid: 'offeredSong', title: '刚才推荐的歌单', playing: true, confirmed: true, position: 1 }));
    assert.equal(current!.playbackConfirmed, true);
    assert.equal(current!.agentStatus, '正在播放 · 刚才推荐的歌曲');
    const pauses = h.commands.filter((c) => c.action === "pause").length;
    await act(async () => root.unmount());
    assert.equal(h.commands.filter((c) => c.action === "pause").length, pauses);
  } finally {
    await act(async () => {
      try {
        root.unmount();
      } catch {}
    });
    globalThis.fetch = oldFetch;
    page.window.close();
  }
});
