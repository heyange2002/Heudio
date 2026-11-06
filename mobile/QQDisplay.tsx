import { useEffect, useState } from "react";
import { QrCode } from "lucide-react";
import { request } from "./api";
type Display = { image: string; channel: string; expiresAt: number };
export default function QQDisplay() {
  const [draft, setDraft] = useState(""),
    [code, setCode] = useState(""),
    [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<Display | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setData(null);
    setError("");
    if (!code) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await request<Display>(
          "/api/mobile/qq-display?code=" + encodeURIComponent(code),
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        setData(result);
        setError("");
        setBusy(false);
        timer = setTimeout(poll, 3000);
      } catch (e) {
        if (!controller.signal.aborted) {
          setData(null);
          setBusy(false);
          setError(e instanceof Error ? e.message : "暂时无法显示二维码");
        }
      }
    };
    setBusy(true);
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [code, attempt]);
  useEffect(() => {
    if (!data) return;
    const timer = setTimeout(
      () => {
        setData(null);
        setError("显示码已过期，请回到手机重新生成。");
      },
      Math.max(0, data.expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [data]);
  return (
    <main className="qq-screen">
      <section>
        <a className="brand" href="/">
          <img src="/brand/soundisle.svg" alt="" />
          <span>
            声屿<small>SOUNDISLE</small>
          </span>
        </a>
        <h1>在这里显示，用手机扫码。</h1>
        <p>
          在手机「QQ
          音乐」授权页获取二维码，点击「在电脑显示二维码」，再输入手机上的 6
          位显示码。
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setCode(draft);
            setAttempt((p) => p + 1);
          }}
        >
          <label htmlFor="qq-display-code">手机上的显示码</label>
          <div>
            <input
              id="qq-display-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="off"
              value={draft}
              onChange={(e) =>
                setDraft(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
            />
            <button
              className="wide-button"
              disabled={busy || !/^\d{6}$/.test(draft)}
            >
              显示二维码
            </button>
          </div>
        </form>
        {busy && <p role="status">正在读取二维码…</p>}
        {error && (
          <p className="service-error" role="alert">
            {error}
          </p>
        )}
        {data ? (
          <div className="qr-screen-image">
            <img src={data.image} alt="手机会话的 QQ 授权二维码" />
            <p>
              用
              {data.channel === "qq"
                ? "手机 QQ"
                : data.channel === "wechat"
                  ? "微信"
                  : "QQ 音乐 App"}
              扫码确认，随后返回手机声屿。
            </p>
          </div>
        ) : (
          !busy &&
          !error && (
            <div className="qr-screen-empty">
              <QrCode size={64} />
              <p>等待输入显示码</p>
            </div>
          )
        )}
        <p className="qq-screen-note">
          电脑与手机须连接同一声屿服务。此页不接收 QQ
          登录凭据，扫码授权归手机会话；手机结束授权或显示码过期后，二维码自动消失。
        </p>
      </section>
    </main>
  );
}
