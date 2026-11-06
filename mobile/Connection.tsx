import { useEffect, useRef, useState, type ReactNode } from "react";
import { request } from "./api";

export default function MobileConnection({
  children,
}: {
  children: ReactNode;
}) {
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
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
        if (data.authenticated !== true)
          throw Error("请连接声屿手机端服务，确认服务已更新后重试。");
        connected.current = true;
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
        <img src="/brand/soundisle.svg" alt="" />
        <p className="eyebrow">YOUR LITTLE ISLAND</p>
        <h1>{error ? "暂时无法连接" : "正在连接声音空间…"}</h1>
        {error && (
          <>
            <p className="service-error" role="alert">
              {error}
            </p>
            <button
              className="wide-button"
              onClick={() => setRetry((value) => value + 1)}
            >
              重新连接
            </button>
          </>
        )}
      </section>
    </main>
  );
}
