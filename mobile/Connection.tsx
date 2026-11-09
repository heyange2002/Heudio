import { useEffect, useRef, useState, type ReactNode } from "react";
import { request } from "./api";

export default function MobileConnection({
  children,
}: {
  children: ReactNode;
}) {
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [needsKey, setNeedsKey] = useState(false),
    [apiKey, setApiKey] = useState(""),
    [submitting, setSubmitting] = useState(false),
    [retry, setRetry] = useState(0);
  const connected = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    const reconnect = () => {
      if (!connected.current) return;
      connected.current = false;
      setReady(false);
      setRetry((value) => value + 1);
    };
    window.addEventListener("soundisle:locked", reconnect);
    setError("");
    request("/api/auth/session", { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        if (data.authenticated !== true && data.apiKeyRequired) {
          setNeedsKey(true);
          return;
        }
        if (data.authenticated !== true)
          throw Error("请连接声屿手机端服务，确认服务已更新后重试。");
        connected.current = true;
        setNeedsKey(false);
        setReady(true);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => {
      controller.abort();
      window.removeEventListener("soundisle:locked", reconnect);
    };
  }, [retry]);
  if (ready) return children;
  return (
    <main className="mobile-connection">
      <section>
        <img
          src={`${location.pathname.startsWith("/mobile/") ? "/mobile/" : "/"}brand/soundisle.svg`}
          alt=""
        />
        <p className="eyebrow">YOUR LITTLE ISLAND</p>
        <h1>
          {needsKey
            ? "连接你的声音空间"
            : error
              ? "暂时无法连接"
              : "正在连接声音空间…"}
        </h1>
        {needsKey && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (submitting) return;
              setSubmitting(true);
              setError("");
              try {
                const data = await request("/api/auth/session", {
                  method: "POST",
                  headers: {
                    "X-Api-Key": apiKey,
                    "Content-Type": "application/json",
                  },
                  body: "{}",
                });
                if (!data.authenticated) throw Error("API Key 验证失败");
                setApiKey("");
                connected.current = true;
                setReady(true);
                setNeedsKey(false);
              } catch (e) {
                setError(e instanceof Error ? e.message : "连接失败，请重试");
              } finally {
                setSubmitting(false);
              }
            }}
          >
            <p>服务：{location.origin}</p>
            <label>
              API Key
              <input
                type="password"
                aria-label="服务 API Key"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={256}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </label>
            <p>
              填写服务管理员提供的连接 Key。验证后自动连接，Key
              不会保存在网页存储中。
            </p>
            <button className="wide-button" disabled={submitting || !apiKey}>
              {submitting ? "正在验证…" : "连接服务"}
            </button>
          </form>
        )}
        {error && (
          <>
            <p className="service-error" role="alert">
              {error}
            </p>
            {!needsKey && (
              <button
                className="wide-button"
                onClick={() => setRetry((value) => value + 1)}
              >
                重新连接
              </button>
            )}
          </>
        )}
      </section>
    </main>
  );
}
