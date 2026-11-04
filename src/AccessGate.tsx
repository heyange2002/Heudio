import { useEffect, useState, type ReactNode } from 'react';
import { apiFetch } from './api';
import { isAccessCode } from '../shared/access-code.mjs';

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
      e.preventDefault();
      if(!isAccessCode(key)){setError('请输入完整的4位数字访问码');return;}
      setBusy(true); setError('');
      try { const r = await apiFetch('/api/auth/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) }); setKey(''); const d = await r.json(); if (!r.ok) throw Error(d.error || '连接失败'); setAuthenticated(d.authenticated); }
      catch (e) { setError(e instanceof Error ? e.message : '连接失败'); } finally { setBusy(false); }
    }}>
      <h1>声屿 · 私人空间</h1><p>输入4位数字访问码。</p>
      <label>访问码<input aria-label="4位数字访问码" style={{ width: '100%', padding: 12, border: '1px solid #63563d', borderRadius: 8, textAlign:'center', letterSpacing:'0.5em', fontSize:24 }} type="password" inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} autoComplete="off" value={key} onChange={e => setKey(e.target.value.replace(/[^0-9]/g,'').slice(0,4))} required /></label>
      <button disabled={busy || !isAccessCode(key)} style={{ padding: 12, background: '#e6b64d', borderRadius: 8, color: '#16130e', opacity:busy || !isAccessCode(key)?0.5:1 }}>{busy ? '正在连接…' : '解锁'}</button>
      {error && <p role="alert">{error}</p>}
    </form>
  </main>;
}
