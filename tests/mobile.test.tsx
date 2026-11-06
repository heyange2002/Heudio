import test from "node:test";
import assert from "node:assert/strict";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import MobileApp from "../mobile/MobileApp";
import MobileConnection from "../mobile/Connection";
import { QQSettings } from "../mobile/ServiceSettings";
import { playlistSongs } from "../mobile/library";
import { useSoundisle } from "../src/hooks/useSoundisle";
import { audioEngine } from "../src/utils/audioEngine";

function setup() {
  const page = new JSDOM('<div id="root"></div>', {
    url: "https://soundisle.test",
    pretendToBeVisual: true,
  });
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
  page.window.HTMLElement.prototype.scrollTo = () => {};
  page.window.HTMLElement.prototype.scrollIntoView = () => {};
  page.window.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  page.window.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  (page.window.HTMLElement.prototype as any).showPopover = () => {};
  const root = createRoot(document.getElementById("root")!);
  const click = async (text: string) => {
    const button = [...document.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === text || b.textContent === text,
    );
    assert(button, "missing button " + text);
    await act(async () =>
      button.dispatchEvent(
        new page.window.MouseEvent("click", { bubbles: true }),
      ),
    );
  };
  return { page, root, click };
}
const song = (mid: string) => ({
  mid,
  title: "歌曲 " + mid,
  artist: "真实接口歌手",
  album: "测试专辑",
  duration: 180,
  coverUrl: "",
});
test("mobile connects and reconnects without an access-code form or lock action", async () => {
  const { page, root, click } = setup();
  const oldFetch = globalThis.fetch;
  let available = false;
  const sessionMethods: string[] = [];
  globalThis.fetch = async (url, options) => {
    if (String(url) === "/api/auth/session") {
      sessionMethods.push(options?.method || "GET");
      return available
        ? Response.json({ authenticated: true, mobile: true })
        : Response.json({ error: "服务暂时不可用" }, { status: 503 });
    }
    return Response.json({ data: {}, configured: false, summary: "未知" });
  };
  try {
    await act(async () =>
      root.render(
        <MobileConnection>
          <MobileApp />
        </MobileConnection>,
      ),
    );
    assert.match(
      document.querySelector('[role="alert"]')?.textContent || "",
      /服务暂时不可用/,
    );
    assert.equal(document.querySelector('input[type="password"]'), null);
    available = true;
    await click("重新连接");
    assert(document.querySelector(".mobile-main"));
    await click("打开设置");
    assert(!document.body.textContent?.includes("锁定访问"));
    assert.equal(
      document.querySelector('input[aria-label="4位数字访问码"]'),
      null,
    );
    await act(async () => window.dispatchEvent(new Event("soundisle:locked")));
    assert(document.querySelector(".mobile-main"));
    assert.deepEqual(sessionMethods, ["GET", "GET", "GET"]);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = oldFetch;
    page.window.close();
  }
});
test("mobile scene recommendations use the shared agent and audio pipeline, preserve queue and collect real metadata", async () => {
  const { page, root, click } = setup();
  const oldFetch = globalThis.fetch,
    oldAudio = globalThis.Audio;
  const calls: string[] = [],
    audios: any[] = [];
  localStorage.setItem(
    "soundisle:mobile-settings",
    JSON.stringify({ voiceAutoPlay: false }),
  );
  globalThis.Audio = class {
    volume = 1;
    currentTime = 0;
    paused = false;
    onended = null;
    onerror = null;
    ontimeupdate = null;
    constructor(public src: string) {
      audios.push(this);
    }
    play = async () => {};
    pause() {
      this.paused = true;
    }
    removeAttribute() {}
    load() {}
  } as any;
  globalThis.fetch = async (url, options) => {
    const path = String(url);
    calls.push(path);
    if (path === "/api/agent/chat") {
      const body = JSON.parse(options!.body as string);
      assert.equal(body.intent, "playlist");
      return Response.json({
        reply: "为你选好了。",
        recommendedSceneId: "rest",
        mode: "model",
        playlist: { title: "真实推荐", songs: [song("first"), song("second")] },
      });
    }
    if (path.startsWith("/api/music/getMusicPlay/")) {
      const mid = path.split("/").pop()!.split("?")[0];
      return Response.json({
        data: {
          playUrl: {
            [mid]: {
              url:
                "/api/music/stream/" + (mid === "first" ? "a" : "b").repeat(48),
            },
          },
        },
      });
    }
    if (path.startsWith("/api/music/getLyric"))
      return Response.json({
        response: { lyric: "[00:00.00]第一句\n[00:30.00]第二句" },
      });
    return Response.json({ data: {}, configured: false, summary: "未知" });
  };
  try {
    await act(async () => root.render(<MobileApp />));
    assert(!document.body.textContent?.includes("海风经过的地方"));
    await click("听听这一刻");
    assert(calls.includes("/api/agent/chat"));
    assert(audios.some((a) => a.src.endsWith("a".repeat(48))));
    assert(document.body.textContent?.includes("歌曲 first"));
    await click("展开播放器：歌曲 first");
    await click("收藏到本机");
    assert.equal(
      JSON.parse(localStorage.getItem("soundisle:mobile-favorites")!)[0].mid,
      "first",
    );
    await click("下一首");
    assert(audios.some((a) => a.src.endsWith("b".repeat(48))));
    assert(document.body.textContent?.includes("歌曲 second"));
    await click("暂停");
    assert(audios.at(-1).paused);
    await act(async () => root.unmount());
    const stored = JSON.parse(
      localStorage.getItem("soundisle:playback-session") || "null",
    );
    assert.equal(stored.currentMid, "second");
    assert.equal(stored.songs.length, 2);
    assert.equal(stored.title, "真实推荐");
    assert.equal(document.querySelectorAll("audio").length, 0);
  } finally {
    await act(async () => {
      try {
        root.unmount();
      } catch {}
    });
    globalThis.fetch = oldFetch;
    globalThis.Audio = oldAudio;
    page.window.close();
  }
});
test("QQ authorization refreshes successfully before disposing the polling request", async () => {
  const { page, root, click } = setup();
  const oldFetch = globalThis.fetch;
  let authorized = false,
    updates = 0;
  let displayRemoved = false;
  globalThis.fetch = async (url, options) => {
    const path = String(url);
    if (path === "/api/mobile/qq-display") {
      assert.deepEqual(JSON.parse(options!.body as string), {
        key: "test-key",
        channel: "qq",
      });
      return Response.json({
        id: "display-id",
        code: "123456",
        expiresAt: Date.now() + 120000,
      });
    }
    if (path.startsWith("/api/mobile/qq-display?id=")) {
      assert.equal(options?.method, "DELETE");
      displayRemoved = true;
      return Response.json({ removed: true });
    }
    if (path.endsWith("/config"))
      return Response.json({ mode: "embedded", url: "" });
    if (path.endsWith("/login/channels"))
      return authorized
        ? Response.json(
            { error: "channel service unavailable" },
            { status: 503 },
          )
        : Response.json({ data: { channels: ["qq"] } });
    if (path.endsWith("/login/status"))
      return Response.json({
        data: { profile: authorized ? { nickname: "测试用户" } : null },
      });
    if (path.includes("/login/qr/key"))
      return Response.json({ data: { unikey: "test-key" } });
    if (path.includes("/login/qr/create"))
      return Response.json({
        data: { qrimg: "data:image/png;base64,aGVsbG8=" },
      });
    if (path.includes("/login/qr/check")) {
      authorized = true;
      return Response.json({ code: 803 });
    }
    throw Error(path);
  };
  try {
    await act(async () =>
      root.render(<QQSettings onUpdate={() => updates++} />),
    );
    await click("获取授权二维码");
    assert(document.querySelector('img[alt="QQ 音乐授权二维码"]'));
    assert.equal(document.querySelector("a[download]"), null);
    assert(!document.body.textContent?.includes("可保存二维码后从相册识别"));
    await click("在电脑显示二维码");
    assert.equal(
      document.querySelector('[aria-label="二维码显示码"]')?.textContent,
      "123456",
    );
    assert(
      document.body.textContent?.includes("https://soundisle.test/#qq-display"),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1700));
    });
    assert(document.body.textContent?.includes("QQ 音乐已授权"));
    assert(document.body.textContent?.includes("退出授权"));
    assert.equal(updates, 2);
    assert(!document.querySelector('img[alt="QQ 音乐授权二维码"]'));
    assert(displayRemoved);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = oldFetch;
    page.window.close();
  }
});
test("QQ connection reset after scanning is reported as unfinished authorization instead of QR expiry", async () => {
  const { page, root, click } = setup();
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const path = String(url);
    if (path.endsWith("/config")) return Response.json({ mode: "embedded" });
    if (path.endsWith("/login/channels"))
      return Response.json({ data: { channels: ["qq"] } });
    if (path.endsWith("/login/status")) return Response.json({ data: {} });
    if (path.includes("/login/qr/key"))
      return Response.json({ data: { unikey: "qr-key" } });
    if (path.includes("/login/qr/create"))
      return Response.json({
        data: { qrimg: "data:image/png;base64,aGVsbG8=" },
      });
    if (path.includes("/login/qr/check"))
      return Response.json({
        code: 800,
        failureStage: "session-bootstrap",
        failureReason: "connection-reset",
      });
    throw Error(path);
  };
  try {
    await act(async () => root.render(<QQSettings onUpdate={() => {}} />));
    await click("获取授权二维码");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1700));
    });
    const status = document.querySelector('[role="status"]')?.textContent || "";
    assert.match(status, /连接被重置/);
    assert.match(status, /授权尚未完成/);
    assert(!status.includes("二维码已失效"));
    assert(!document.querySelector(".authorized-card"));
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = oldFetch;
    page.window.close();
  }
});
test("returning to the app retries interrupted QR checks and refreshes a completed grant without exchanging it twice", async () => {
  const { page, root, click } = setup();
  const oldFetch = globalThis.fetch;
  let polls = 0,
    authorized = false,
    statusChecks = 0;
  globalThis.fetch = async (url) => {
    const path = String(url);
    if (path.endsWith("/config")) return Response.json({ mode: "embedded" });
    if (path.endsWith("/login/channels"))
      return Response.json({ data: { channels: ["qq"] } });
    if (path.endsWith("/login/status")) {
      if (authorized && ++statusChecks === 1)
        return Response.json(
          { error: "temporary status failure" },
          { status: 503 },
        );
      return Response.json({
        data: { profile: authorized ? { nickname: "测试用户" } : null },
      });
    }
    if (path.includes("/login/qr/key"))
      return Response.json({ data: { unikey: "qr-key" } });
    if (path.includes("/login/qr/create"))
      return Response.json({
        data: { qrimg: "data:image/png;base64,aGVsbG8=" },
      });
    if (path.includes("/login/qr/check")) {
      if (++polls === 1) throw Error("network temporarily unavailable");
      authorized = true;
      return Response.json({ code: 803 });
    }
    throw Error(path);
  };
  try {
    await act(async () => root.render(<QQSettings onUpdate={() => {}} />));
    await click("获取授权二维码");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1700));
    });
    assert(document.querySelector(".auth-qr"));
    assert.match(
      document.querySelector('[role="status"]')?.textContent || "",
      /正在重试/,
    );
    await act(async () =>
      document.dispatchEvent(new page.window.Event("visibilitychange")),
    );
    assert.equal(polls, 2);
    assert(document.querySelector(".auth-qr"));
    await act(async () =>
      document.dispatchEvent(new page.window.Event("visibilitychange")),
    );
    assert.equal(
      polls,
      2,
      "a confirmed grant only retries the account status request",
    );
    assert(document.querySelector(".authorized-card"));
    assert(!document.querySelector(".auth-qr"));
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = oldFetch;
    page.window.close();
  }
});
test("computer QR display shows progress, keeps errors next to the button and reveals the generated code", async () => {
  const { page, root, click } = setup();
  const oldFetch = globalThis.fetch;
  let finishDisplay: (response: Response) => void;
  let revealed = false;
  page.window.HTMLElement.prototype.scrollIntoView = function () {
    revealed = this.classList.contains("qr-screen-instructions");
  };
  globalThis.fetch = async (url, options) => {
    const path = String(url);
    if (path === "/api/mobile/qq-display" && options?.method === "POST")
      return new Promise<Response>((resolve) => {
        finishDisplay = resolve;
      });
    if (path.includes("/qq-display?id="))
      return Response.json({ removed: true });
    if (path.endsWith("/config")) return Response.json({ mode: "embedded" });
    if (path.endsWith("/login/channels"))
      return Response.json({ data: { channels: ["qq"] } });
    if (path.endsWith("/login/status")) return Response.json({ data: {} });
    if (path.includes("/login/qr/key"))
      return Response.json({ data: { unikey: "sealed".repeat(200) } });
    if (path.includes("/login/qr/create"))
      return Response.json({
        data: { qrimg: "data:image/png;base64,aGVsbG8=" },
      });
    if (path.includes("/login/qr/check")) return Response.json({ code: 801 });
    throw Error(path);
  };
  try {
    await act(async () => root.render(<QQSettings onUpdate={() => {}} />));
    await click("获取授权二维码");
    await click("在电脑显示二维码");
    const busy =
      document.querySelector<HTMLButtonElement>('[aria-busy="true"]');
    assert(busy?.disabled);
    assert.equal(busy.textContent, "正在生成显示码…");
    await act(async () =>
      finishDisplay(
        Response.json({ error: "显示服务暂时不可用" }, { status: 502 }),
      ),
    );
    assert.equal(
      document.querySelector('.authorization-panel [role="alert"]')
        ?.textContent,
      "显示服务暂时不可用",
    );
    await click("在电脑显示二维码");
    assert.equal(
      document.querySelector('.authorization-panel [role="alert"]'),
      null,
    );
    await act(async () =>
      finishDisplay(
        Response.json({
          id: "test-display",
          code: "654321",
          expiresAt: Date.now() + 120000,
        }),
      ),
    );
    assert.equal(
      document.querySelector('[aria-label="二维码显示码"]')?.textContent,
      "654321",
    );
    assert(revealed);
    assert.equal(document.querySelector('[aria-busy="true"]'), null);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = oldFetch;
    page.window.close();
  }
});
test("mobile playlist loading reads every page, deduplicates songs and rejects a repeated incomplete page", async () => {
  const oldFetch = globalThis.fetch;
  Object.assign(globalThis, {
    location: { protocol: "https:", hostname: "soundisle.test" },
  });
  let repeat = false;
  globalThis.fetch = async (url) =>
    Response.json(
      String(url).includes("offset=")
        ? {
            songs: repeat ? [song("one")] : [song("two")],
            more: repeat,
            total: 2,
          }
        : { songs: [song("one")], more: true, total: 2 },
    );
  try {
    const songs = await playlistSongs(
      { tid: "123" },
      new AbortController().signal,
    );
    assert.deepEqual(
      songs.map((s) => s.mid),
      ["one", "two"],
    );
    repeat = true;
    await assert.rejects(
      () => playlistSongs({ tid: "123" }, new AbortController().signal),
      /未读取完整/,
    );
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("sleep timer uses a wall-clock deadline and restores volume after expiry instead of restarting on pause", async () => {
  const { page, root } = setup();
  const oldFetch = globalThis.fetch,
    oldNow = Date.now,
    oldVolume = audioEngine.setMasterVolume;
  let clock = 100000,
    tick: () => void = () => {},
    model: ReturnType<typeof useSoundisle>,
    lastVolume = 0;
  Date.now = () => clock;
  globalThis.fetch = async () => Response.json({ data: {}, summary: "未知" });
  page.window.setInterval = ((callback: () => void) => {
    tick = callback;
    return 17;
  }) as any;
  audioEngine.setMasterVolume = (volume) => {
    lastVolume = volume;
  };
  function Harness() {
    model = useSoundisle();
    return null;
  }
  try {
    await act(async () => root.render(<Harness />));
    await act(async () =>
      model.setSettings((p) => ({ ...p, sleepTimerMinutes: 1 })),
    );
    clock += 45000;
    await act(async () => tick());
    assert.equal(lastVolume, 0.425);
    await act(async () => model.handleVolumeChange(0.6));
    clock += 20000;
    await act(async () => tick());
    assert.equal(model!.settings.sleepTimerMinutes, null);
    assert.equal(lastVolume, 0.6);
    assert.equal(model!.isPlaying, false);
  } finally {
    await act(async () => root.unmount());
    Date.now = oldNow;
    globalThis.fetch = oldFetch;
    audioEngine.setMasterVolume = oldVolume;
    page.window.close();
  }
});
