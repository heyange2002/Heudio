import { useEffect, useState, type ReactNode } from 'react';
import { apiFetch } from './api';

export default function AccessGate({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    const lock = () => { setAuthenticated(false); setKey(''); };
    window.addEventListener('soundisle:locked', lock);
    apiFetch('/api/auth/session').then(async r => { const d = await r.json(); if (!r.ok) throw Error(d.error || '连接失败'); setAuthenticated(d.authenticated); }).catch(e => setError(e.message)).finally(() => setBusy(false));
    return () => window.removeEventListener('soundisle:locked', lock);
  }, []);
  if (authenticated) return <><button style={{ position: 'fixed', right: 16, top: 72, zIndex: 50 }} onClick={async () => {
    try { const r = await apiFetch('/api/auth/session', { method: 'DELETE' }); if (!r.ok) throw Error('退出失败'); setAuthenticated(false); } catch { window.alert('退出失败，请检查连接后重试'); }
  }}>锁定访问</button>{children}</>;
  return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#141311', color: '#ede8de', padding: 24 }}>
    <form style={{ width: '100%', maxWidth: 380, display: 'grid', gap: 16 }} onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError('');
      try { const r = await apiFetch('/api/auth/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) }); setKey(''); const d = await r.json(); if (!r.ok) throw Error(d.error || '连接失败'); setAuthenticated(d.authenticated); }
      catch (e) { setError(e instanceof Error ? e.message : '连接失败'); } finally { setBusy(false); }
    }}>
      <h1>声屿 · 私人空间</h1><p>输入服务端配置的访问 Key。</p>
      <label>访问 Key<input style={{ width: '100%', padding: 12, border: '1px solid #63563d', borderRadius: 8 }} type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} required /></label>
      <button disabled={busy} style={{ padding: 12, background: '#e6b64d', borderRadius: 8, color: '#16130e' }}>{busy ? '正在连接…' : '解锁'}</button>
      {error && <p role="alert">{error}</p>}
    </form>
  </main>;
}
