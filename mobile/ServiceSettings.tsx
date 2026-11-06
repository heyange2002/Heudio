import { useEffect, useRef, useState } from "react";
import {
  Eye,
  EyeOff,
  Headphones,
  Music2,
  QrCode,
  Sparkles,
} from "lucide-react";
import { SPEECH_MODELS, SPEECH_VOICES } from "../shared/speech.mjs";
import type { ServiceSettings } from "../src/types/music";
import type { SpeechState } from "../src/utils/speechPlayer";
import { music, request } from "./api";

function qrFailureMessage(data: {
  failureStage?: string;
  failureReason?: string;
}) {
  if (data.failureReason === "user-canceled")
    return "已取消授权，请重新获取二维码";
  if (data.failureReason === "connection-reset")
    return "QQ 音乐连接被重置，授权尚未完成。请检查电脑网络后重新扫码。";
  if (data.failureReason === "network-timeout")
    return "QQ 音乐授权连接超时，尚未完成授权。请检查电脑网络后重新扫码。";
  if (data.failureStage && data.failureReason !== "qr-timeout")
    return "QQ 音乐授权未完成，请检查服务连接后重新扫码。";
  return "二维码已失效，请重新获取";
}

export function QQSettings({ onUpdate }: { onUpdate: () => void }) {
  const [config, setConfig] = useState({ mode: "embedded", url: "" }),
    [channels, setChannels] = useState<string[]>([]),
    [channel, setChannel] = useState("");
  const [authorized, setAuthorized] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("正在检查连接…"),
    [qr, setQR] = useState({ key: "", image: "" });
  const mounted = useRef(false),
    action = useRef<AbortController | null>(null);
  const [displayBusy, setDisplayBusy] = useState(false),
    [displayError, setDisplayError] = useState("");
  const displayInstructions = useRef<HTMLDivElement>(null);
  const [display, setDisplay] = useState<{
    id: string;
    code: string;
    expiresAt: number;
  } | null>(null);
  const currentQR = useRef(qr.key);
  currentQR.current = qr.key;
  useEffect(() => {
    setDisplay(null);
    setDisplayError("");
  }, [qr.key]);
  useEffect(() => {
    if (display)
      displayInstructions.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
  }, [display]);
  useEffect(() => {
    if (!display) return;
    const timer = setTimeout(
      () => setDisplay(null),
      Math.max(0, display.expiresAt - Date.now()),
    );
    return () => {
      clearTimeout(timer);
      void request(
        "/api/mobile/qq-display?id=" + encodeURIComponent(display.id),
        { method: "DELETE", keepalive: true },
      ).catch(() => {});
    };
  }, [display]);
  const refresh = async (signal: AbortSignal) => {
    const [cfg, cap, login] = await Promise.allSettled([
      music("/config", { signal }),
      music("/login/channels", { signal }),
      music("/login/status", { signal }),
    ]);
    if (signal.aborted) return;
    if (cfg.status === "fulfilled")
      setConfig({ mode: cfg.value.mode, url: cfg.value.url || "" });
    if (cap.status === "fulfilled") {
      const list = cap.value.data?.channels || [];
      setChannels(list);
      setChannel((p) => (list.includes(p) ? p : list[0] || ""));
    }
    if (login.status === "rejected") throw login.reason;
    setAuthorized(!!login.value.data?.profile);
    setStatus(
      login.value.data?.profile ? "QQ 音乐已授权" : "服务已连接 · 账号待授权",
    );
    if (cfg.status === "rejected" || cap.status === "rejected")
      setError("账号状态已更新，音乐服务配置暂时无法读取，请稍后重试。");
    onUpdate();
  };
  useEffect(() => {
    mounted.current = true;
    const c = new AbortController();
    refresh(c.signal).catch((e) => {
      if (!c.signal.aborted) {
        setError(e.message);
        setStatus("暂时无法确认连接");
      }
    });
    return () => {
      mounted.current = false;
      c.abort();
      action.current?.abort();
    };
  }, []);
  useEffect(() => {
    const c = new AbortController();
    const resume = () => {
      if (document.hidden || qr.key) return;
      void music("/login/status", { signal: c.signal })
        .then((data) => {
          if (c.signal.aborted) return;
          setAuthorized(!!data.data?.profile);
          if (data.data?.profile) {
            setStatus("QQ 音乐已授权");
            setError("");
            onUpdate();
          }
        })
        .catch(() => {});
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    return () => {
      c.abort();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
    };
  }, [qr.key]);
  useEffect(() => {
    if (!qr.key) return;
    const c = new AbortController();
    let timer: ReturnType<typeof setTimeout>,
      polls = 0,
      running = false,
      confirmed = false;
    const deadline = Date.now() + 3 * 60000;
    const poll = async () => {
      if (running || c.signal.aborted || document.hidden) return;
      if (!confirmed && Date.now() >= deadline) {
        setQR({ key: "", image: "" });
        setStatus("二维码已失效，请重新获取");
        return;
      }
      running = true;
      try {
        const d = confirmed
          ? { code: 803 }
          : await music("/login/qr/check?key=" + encodeURIComponent(qr.key), {
              signal: c.signal,
            });
        if (c.signal.aborted) return;
        if (d.code === 803) {
          confirmed = true;
          setError("");
          setStatus("扫码已确认，正在同步音乐账号…");
          await refresh(c.signal);
          if (c.signal.aborted) return;
          setQR({ key: "", image: "" });
          window.dispatchEvent(new Event("soundisle:music-auth-changed"));
          return;
        }
        if (d.code === 800 || ++polls > 80) {
          setQR({ key: "", image: "" });
          setStatus(qrFailureMessage(d));
          return;
        }
        setError("");
        setStatus(
          d.code === 802 ? "已扫码，请在对应 App 中确认授权" : "等待扫码授权",
        );
        timer = setTimeout(poll, 2500);
      } catch (e) {
        if (!c.signal.aborted) {
          setError(e instanceof Error ? e.message : "授权查询失败");
          setStatus("授权状态暂时无法确认，正在重试…");
          timer = setTimeout(poll, 2500);
        }
      } finally {
        running = false;
      }
    };
    const resume = () => {
      if (!document.hidden) {
        clearTimeout(timer);
        void poll();
      }
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    timer = setTimeout(poll, 1500);
    return () => {
      c.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
    };
  }, [qr.key]);
  const run = async (
    fn: (signal: AbortSignal) => Promise<void>,
    forDisplay = false,
  ) => {
    if (busy) return;
    const c = new AbortController();
    action.current = c;
    setBusy(true);
    setError("");
    if (forDisplay) {
      setDisplayBusy(true);
      setDisplayError("");
    }
    try {
      await fn(c.signal);
    } catch (e) {
      if (mounted.current && !c.signal.aborted)
        (forDisplay ? setDisplayError : setError)(
          e instanceof Error ? e.message : "请求失败",
        );
    } finally {
      if (mounted.current && !c.signal.aborted) {
        setBusy(false);
        if (forDisplay) setDisplayBusy(false);
      }
    }
  };
  return (
    <section className="service-setup" aria-label="QQ 音乐配置">
      <div className="service-heading">
        <span className="service-symbol music">
          <Music2 />
        </span>
        <div>
          <h3>让喜欢的音乐，来到声屿。</h3>
          <p>连接音乐服务，授权你的账号。</p>
        </div>
      </div>
      <h3 className="service-section-title">
        <span>01</span>音乐服务
      </h3>
      <div className="service-mode-group">
        {[
          ["embedded", "默认服务", "无需填写服务地址"],
          ["gateway", "自建服务", "使用自己的音乐服务"],
        ].map(([id, title, subtitle]) => (
          <button
            key={id}
            disabled={busy}
            aria-pressed={config.mode === id}
            onClick={() => {
              setConfig({ ...config, mode: id });
              setQR({ key: "", image: "" });
              setStatus("配置有改动，请保存并检查");
            }}
          >
            <span>
              <strong>{title}</strong>
              <small>{subtitle}</small>
            </span>
            <span
              className={`radio-dot ${config.mode === id ? "checked" : ""}`}
            />
          </button>
        ))}
      </div>
      {config.mode === "gateway" && (
        <label className="service-field">
          服务地址
          <input
            type="url"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="https://music.example.com"
            value={config.url}
            onChange={(e) => {
              setConfig({ ...config, url: e.target.value });
              setQR({ key: "", image: "" });
              setStatus("配置有改动，请保存并检查");
            }}
          />
        </label>
      )}
      <button
        className="wide-button"
        disabled={busy}
        onClick={() =>
          run(async (signal) => {
            setQR({ key: "", image: "" });
            await music("/config", {
              method: "PUT",
              signal,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(config),
            });
            await refresh(signal);
            window.dispatchEvent(new Event("soundisle:music-auth-changed"));
          })
        }
      >
        {busy ? "正在处理…" : "保存并检查连接"}
      </button>
      {error && (
        <p className="service-error" role="alert">
          {error}
        </p>
      )}
      <h3 className="service-section-title">
        <span>02</span>QQ 音乐账号
      </h3>
      <p className="service-status" role="status">
        {status}
      </p>
      {authorized ? (
        <div className="authorized-card">
          <div>
            <strong>QQ 音乐已授权</strong>
            <p>个人歌单与推荐已连接</p>
          </div>
          <button
            className="text-button"
            disabled={busy}
            onClick={() =>
              run(async (signal) => {
                await music("/logout", { signal });
                setQR({ key: "", image: "" });
                await refresh(signal);
                window.dispatchEvent(new Event("soundisle:music-auth-changed"));
              })
            }
          >
            退出授权
          </button>
        </div>
      ) : (
        <p className="service-copy">授权后，在这里查看个人歌单与推荐。</p>
      )}
      <label className="service-field">
        扫码方式
        <select
          value={channel}
          disabled={busy || !channels.length}
          onChange={(e) => {
            setChannel(e.target.value);
            setQR({ key: "", image: "" });
          }}
        >
          {!channels.length && <option value="">暂无可用通道</option>}
          {channels.map((c) => (
            <option key={c} value={c}>
              {c === "qq"
                ? "手机 QQ 扫码"
                : c === "wechat"
                  ? "微信扫码"
                  : "QQ 音乐 App 扫码"}
            </option>
          ))}
        </select>
      </label>
      <button
        className="wide-button secondary service-action"
        disabled={busy || !channel}
        onClick={() =>
          run(async (signal) => {
            setQR({ key: "", image: "" });
            setStatus("正在获取二维码…");
            const key = (
              await music(
                "/login/qr/key?channel=" + encodeURIComponent(channel),
                { signal },
              )
            ).data?.unikey;
            if (!key) throw Error("未获取到二维码，请重试");
            const result = await music(
              "/login/qr/create?key=" + encodeURIComponent(key),
              { signal },
            );
            const image = result.data?.qrimg;
            if (!/^data:image\/(png|jpeg|gif|webp);base64,/.test(image || ""))
              throw Error("二维码图片格式无效");
            setQR({ key, image });
            setStatus("请用对应 App 扫码");
          })
        }
      >
        <QrCode size={19} />
        {qr.image ? "重新获取二维码" : "获取授权二维码"}
      </button>
      {qr.image && (
        <div className="authorization-panel">
          <img className="auth-qr" src={qr.image} alt="QQ 音乐授权二维码" />
          <p>
            请在电脑或另一块屏幕显示二维码，再用对应 App 扫码。
            <br />
            QQ 授权不支持保存图片后从相册识别。
          </p>
          <button
            className="wide-button secondary"
            disabled={busy}
            aria-busy={displayBusy}
            onClick={() =>
              run(async (signal) => {
                const key = qr.key;
                const data = await request("/api/mobile/qq-display", {
                  method: "POST",
                  signal,
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ key, channel }),
                });
                if (signal.aborted || currentQR.current !== key) {
                  void request(
                    "/api/mobile/qq-display?id=" + encodeURIComponent(data.id),
                    { method: "DELETE" },
                  ).catch(() => {});
                  return;
                }
                setDisplay(data);
              }, true)
            }
          >
            {displayBusy ? "正在生成显示码…" : "在电脑显示二维码"}
          </button>
          {displayError && (
            <p className="service-error" role="alert">
              {displayError}
            </p>
          )}
          {display && (
            <div
              className="qr-screen-instructions"
              ref={displayInstructions}
              role="status"
            >
              <p>1. 在电脑打开同一个声屿服务：</p>
              <code>{location.origin}/#qq-display</code>
              <p>2. 输入下方 6 位显示码：</p>
              <strong className="qr-display-code" aria-label="二维码显示码">
                {display.code}
              </strong>
              <small>显示码 2 分钟内有效。扫码确认后返回手机查看结果。</small>
            </div>
          )}
          <p className="demo-caption">
            电脑页仅显示此二维码；授权仍由这部手机完成。当前不支持单设备直接授权。
          </p>
        </div>
      )}
      <button
        className="text-button"
        disabled={busy}
        onClick={() => run(refresh)}
      >
        刷新状态
      </button>
    </section>
  );
}

export function MiniMaxSettings({
  settings,
  onChange,
  onUpdate,
  onSpeak,
  speechState,
}: {
  settings: ServiceSettings;
  onChange: (next: Partial<ServiceSettings>) => void;
  onUpdate: () => void;
  onSpeak: (text: string) => void;
  speechState: SpeechState;
}) {
  const [key, setKey] = useState(""),
    [visible, setVisible] = useState(false),
    [configured, setConfigured] = useState(false),
    [editable, setEditable] = useState(false),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const mounted = useRef(false),
    action = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    const c = new AbortController();
    request("/api/voice/config", { signal: c.signal })
      .then((d) => {
        if (!c.signal.aborted) {
          setConfigured(d.configured === true);
          setEditable(d.keyEditable === true);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setBusy(false);
      });
    return () => {
      mounted.current = false;
      c.abort();
      action.current?.abort();
    };
  }, []);
  const save = async (remove = false) => {
    if (busy) return;
    const c = new AbortController();
    action.current = c;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const d = await request("/api/settings/minimax", {
        method: remove ? "DELETE" : "PUT",
        signal: c.signal,
        headers: { "Content-Type": "application/json" },
        ...(!remove ? { body: JSON.stringify({ apiKey: key.trim() }) } : {}),
      });
      if (c.signal.aborted) return;
      setConfigured(d.configured === true);
      setKey("");
      setVisible(false);
      setNotice(
        remove ? "Key 已移除" : "Key 已保存；实际可用性取决于账户权限与额度。",
      );
      onUpdate();
    } catch (e) {
      if (!c.signal.aborted)
        setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      if (mounted.current && !c.signal.aborted) setBusy(false);
    }
  };
  return (
    <section className="service-setup" aria-label="MiniMax 配置">
      <div className="service-heading">
        <span className="service-symbol">
          <Sparkles />
        </span>
        <div>
          <h3>让阿屿，有声音也有回应。</h3>
          <p>管理对话与语音的共同配置。</p>
        </div>
      </div>
      <h3 className="service-section-title">
        <span>01</span>API Key
      </h3>
      <p className="service-status">
        {busy ? "正在处理…" : configured ? "已配置" : "尚未配置"}
      </p>
      <p className="service-copy">
        对话、语音识别与朗读共用一个 Key。Key
        保存在你连接的私人服务端，手机不保留输入内容。
      </p>
      {editable && (
        <>
          <label className="service-field" htmlFor="mobile-minimax-key">
            {configured ? "替换 API Key" : "填写 API Key"}
          </label>
          <div className="secret-field">
            <input
              id="mobile-minimax-key"
              type={visible ? "text" : "password"}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={busy}
              maxLength={8192}
              placeholder="输入 MiniMax API Key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <button
              className="icon-button"
              aria-label={visible ? "隐藏 API Key" : "显示 API Key"}
              onClick={() => setVisible(!visible)}
            >
              {visible ? <EyeOff size={19} /> : <Eye size={19} />}
            </button>
          </div>
          <div className="key-actions service-action">
            <button
              className="wide-button"
              disabled={busy || !key.trim()}
              onClick={() => save()}
            >
              {configured ? "替换 Key" : "保存 Key"}
            </button>
            {configured && (
              <button
                className="wide-button secondary"
                disabled={busy}
                onClick={() => save(true)}
              >
                移除配置
              </button>
            )}
          </div>
        </>
      )}
      {!editable && !busy && (
        <p className="service-prerequisite">
          当前服务由管理员配置 Key；如需在手机中管理，请连接声屿移动端服务。
        </p>
      )}
      {notice && (
        <p className="service-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="service-error" role="alert">
          {error}
        </p>
      )}
      <h3 className="service-section-title">
        <span>02</span>对话与声音
      </h3>
      <label className="service-field">
        陪伴模型
        <select
          value={settings.chatModel}
          onChange={(e) =>
            onChange({
              chatModel: e.target.value as ServiceSettings["chatModel"],
            })
          }
        >
          <option value="MiniMax-M3">MiniMax M3</option>
          <option value="local-heuristic">离线陪伴</option>
        </select>
      </label>
      <label className="service-field">
        陪伴音色
        <select
          value={settings.voiceId}
          onChange={(e) => onChange({ voiceId: e.target.value })}
        >
          {SPEECH_VOICES.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      <label className="service-field">
        声音质量
        <select
          value={settings.voiceModel}
          onChange={(e) => onChange({ voiceModel: e.target.value })}
        >
          {SPEECH_MODELS.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      <label className="service-field speed-field">
        <span>
          朗读语速<strong>{settings.voiceSpeed.toFixed(2)} 倍</strong>
        </span>
        <input
          type="range"
          min={0.8}
          max={1.2}
          step={0.05}
          value={settings.voiceSpeed}
          onChange={(e) => onChange({ voiceSpeed: Number(e.target.value) })}
        />
        <span className="range-labels">
          <small>舒缓</small>
          <small>轻快</small>
        </span>
      </label>
      <button
        className="wide-button secondary"
        disabled={!configured || busy}
        onClick={() => onSpeak("我是阿屿。把世界调轻一点，把自己听清一点。")}
      >
        <Headphones size={18} />
        {["playing", "loading"].includes(speechState.status)
          ? "停止试听"
          : speechState.status === "ready"
            ? "继续试听"
            : "试听音色"}
      </button>
      {speechState.status === "loading" && (
        <p className="service-notice" role="status">
          正在生成语音…
        </p>
      )}
      {speechState.status === "playing" && (
        <p className="service-notice" role="status">
          正在播放试听
        </p>
      )}
      {speechState.error && (
        <p className="service-error" role="alert">
          {speechState.error}
        </p>
      )}
      <p className="demo-caption">
        试听与自动朗读会调用 MiniMax，按账户用量计费。
      </p>
    </section>
  );
}
