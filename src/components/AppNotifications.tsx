import { useEffect, useRef, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';

export function notifyError(message: string) {
  window.dispatchEvent(new window.CustomEvent('soundisle:notification', { detail: message }));
}

export function AppNotifications({ musicError, agentError, speechError }: { musicError?: string; agentError?: string; speechError?: string }) {
  const [notice, setNotice] = useState<{ message: string } | null>(null);
  const previous = useRef<(string | undefined)[]>([]);
  useEffect(() => {
    const next = [musicError, agentError, speechError];
    const changed = next.filter((message, index) => message && message !== previous.current[index]);
    previous.current = next;
    if (changed.length) setNotice({ message: changed.join('；').replace(/MiniMax(?:[ -]M3)?/gi, '陪伴服务') });
  }, [musicError, agentError, speechError]);
  useEffect(() => {
    const show = (event: Event) => {
      const message = (event as CustomEvent).detail;
      if (typeof message === 'string' && message) setNotice({ message: message.replace(/MiniMax(?:[ -]M3)?/gi, '陪伴服务') });
    };
    window.addEventListener('soundisle:notification', show);
    return () => window.removeEventListener('soundisle:notification', show);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 2000);
    return () => clearTimeout(timer);
  }, [notice]);
  return notice && <div role="alert" className="app-notification fixed right-6 top-20 z-[100] flex max-w-[min(420px,calc(100vw-3rem))] items-start gap-3 rounded-2xl border border-amber-500/30 bg-stone-900/95 p-4 text-sm text-stone-200 shadow-2xl backdrop-blur-xl">
    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true"/>
    <span className="flex-1">{notice.message}</span>
    <button type="button" aria-label="关闭提示" onClick={() => setNotice(null)} className="text-stone-400 hover:text-stone-100"><X className="h-4 w-4"/></button>
  </div>;
}
