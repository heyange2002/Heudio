import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api';
export function QQMusicSettings() {
  const [config, setConfig] = useState({ mode: 'embedded', url: '' });
  const [channels, setChannels] = useState<string[]>([]), [channel, setChannel] = useState('qq');
  const [status, setStatus] = useState('正在检查 QQ 音乐…'), [loggedIn, setLoggedIn] = useState(false);
  const [qrKey, setQrKey] = useState(''), [qrImage, setQrImage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [qrBusy, setQrBusy] = useState(false);
  const mounted = useRef(true), generation = useRef(0), pollGeneration = useRef(0);
  const call = async (path: string, options?: RequestInit) => {
    const timeout = AbortSignal.timeout(30000);
    const response = await apiFetch('/api/music' + path, { ...options, signal: options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout }); const data = await response.json();
    if (!response.ok) throw Error(data.error || '音乐服务暂时不可用'); return data;
  };
  const refresh = async () => {
    const [cfg, capability, login] = await Promise.all([call('/config'),call('/login/channels'),call('/login/status')]);
    if (!mounted.current) return;
    setConfig(cfg); const list = capability.data?.channels || [];
    setChannels(list); setChannel(prev => list.includes(prev) ? prev : list[0] || '');
    const profile = login.data?.profile; setLoggedIn(!!profile);
    setStatus(profile ? 'QQ 音乐已授权' : '尚未授权 · 搜索可匿名使用，播放和个人推荐请先扫码');
  };
  useEffect(() => {
    mounted.current = true; refresh().catch(e => { if (mounted.current) { setStatus('暂时无法确认 QQ 音乐连接'); setError(e.message); } });
    return () => { mounted.current = false; generation.current++; pollGeneration.current++; };
  }, []);
  useEffect(() => {
    if (!loggedIn) return;
    const renew = () => { call('/login/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {}); };
    renew(); const timer = setInterval(renew, 30 * 60000); return () => clearInterval(timer);
  }, [loggedIn]);
  useEffect(() => {
    if (!qrKey) return;
    const controller = new AbortController(); const version = ++pollGeneration.current;
    let timer: ReturnType<typeof setTimeout>; let polls = 0;
    const poll = async () => {
      try {
        const data = await call('/login/qr/check?key=' + encodeURIComponent(qrKey), { signal: controller.signal });
        if (controller.signal.aborted || version !== pollGeneration.current) return;
        if (data.code === 803) { setQrKey(''); setQrImage(''); await refresh(); window.dispatchEvent(new window.Event('soundisle:music-auth-changed')); return; }
        if (data.code === 800 || ++polls > 80) { setStatus(data.failureReason === 'connection-reset' ? 'QQ 登录连接被重置，尚未完成授权，可换用自建服务重试' : data.failureStage ? 'QQ 授权未完成，请重试或检查服务连接' : '二维码已失效，请重新获取'); setQrKey(''); setQrImage(''); return; }
        setStatus(data.code === 802 ? '已扫码，请在手机上确认授权' : '等待扫码授权');
        timer = setTimeout(poll, 2500);
      } catch (e) { if (!controller.signal.aborted) { setError(e instanceof Error ? e.message : '授权状态查询失败'); setQrKey(''); setQrImage(''); } }
    };
    timer = setTimeout(poll, 1500); return () => { controller.abort(); clearTimeout(timer); };
  }, [qrKey]);
  const run = async (action: () => Promise<void>) => {
    if (busy) return; setBusy(true); setError(''); const version = ++generation.current;
    try { await action(); } catch (e) { if (mounted.current && version === generation.current) setError(e instanceof Error ? e.message : '请求失败'); }
    finally { if (mounted.current && version === generation.current) setBusy(false); }
  };
  const input = 'rounded-lg border border-stone-700 bg-stone-950 p-2 text-sm';
  return <section aria-label="QQ 音乐配置与授权" className="space-y-3 rounded-xl border border-stone-800 p-4">
    <h4 className="text-sm font-semibold text-stone-200">QQ 音乐 · 连接与账号</h4>
    <p role="status" className="text-xs text-stone-400">{status}</p>
    <div><div className="space-y-3 mt-3">
      <div className="flex flex-wrap gap-2"><select aria-label="QQ 音乐连接方式" className={input} value={config.mode} onChange={e => setConfig({ ...config, mode: e.target.value })}><option value="embedded">内置 QQ 音乐服务</option><option value="gateway">自建 QQ 音乐服务</option></select>
        {config.mode === 'gateway' && <input aria-label="QQ 音乐服务地址" placeholder="https://你的音乐服务地址" className={input + ' flex-1 min-w-48'} value={config.url} onChange={e => setConfig({ ...config, url: e.target.value })}/>}
        <button disabled={busy} className="text-xs text-amber-300" onClick={() => run(async () => { setQrKey(''); setQrImage(''); await call('/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) }); await refresh(); window.dispatchEvent(new window.Event('soundisle:music-auth-changed')); })}>保存并检查连接</button></div>
      <p className="text-xs text-stone-500">使用 yakult-green-tea/qq-music-api。自建服务可提供更多扫码通道；授权会在此浏览器长期保存并自动续期；更换连接方式或 QQ 要求重新验证时需再次扫码。</p>
      <div className="flex flex-wrap items-center gap-3"><select aria-label="扫码通道" className={input} value={channel} onChange={e => { setChannel(e.target.value); setQrKey(''); setQrImage(''); }}>{channels.map(c => <option key={c} value={c}>{c === 'qq' ? '手机 QQ 扫码' : c === 'wechat' ? '微信扫码' : 'QQ 音乐 App 扫码'}</option>)}</select>
        <button disabled={busy || !channel} className="text-xs text-amber-300" onClick={() => run(async () => {
          setQrKey(''); setQrImage(''); setQrBusy(true); setStatus('正在向 QQ 获取授权二维码…');
          try {
          const data = await call('/login/qr/key?channel=' + channel); const key = data.data?.unikey;
          if (!key) throw Error('未能获取二维码，请重试');
          const qr = await call('/login/qr/create?key=' + encodeURIComponent(key));
          if (!/^data:image\/(png|jpeg|gif|webp);base64,/.test(qr.data?.qrimg || '')) throw Error('二维码图片格式无效');
          if (mounted.current) { setQrImage(qr.data.qrimg); setQrKey(key); setStatus('请用对应的 App 扫码'); }
          } catch (error) { if (mounted.current) setStatus('二维码获取失败，尚未授权'); throw error; }
          finally { if (mounted.current) setQrBusy(false); }
        })}>{qrBusy ? '正在获取二维码…' : '获取授权二维码'}</button>
        {loggedIn && <button disabled={busy} className="text-xs text-stone-400" onClick={() => run(async () => { await call('/logout'); setQrKey(''); setQrImage(''); await refresh(); window.dispatchEvent(new window.Event('soundisle:music-auth-changed')); })}>退出 QQ 授权</button>}
        <button disabled={busy} className="text-xs text-stone-400" onClick={() => run(refresh)}>刷新状态</button>
      </div>
      {qrBusy && <p role="status" className="text-xs text-amber-300">正在生成授权二维码，请稍候…</p>}
      {qrImage && <img className="w-44 h-44 rounded-xl bg-white p-2" src={qrImage} alt="QQ 音乐授权二维码"/>}
    </div></div>
    {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
  </section>;
}
