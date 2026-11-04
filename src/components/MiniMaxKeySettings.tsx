import { useState } from 'react';
import { apiFetch } from '../api';

export function MiniMaxKeySettings({ configured, onConfigured }: { configured: boolean; onConfigured: (configured: boolean) => void }) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  async function save(remove = false) {
    setBusy(true); setStatus(''); setError('');
    try {
      const response = await apiFetch('/api/settings/minimax', {
        method: remove ? 'DELETE' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        ...(remove ? {} : { body: JSON.stringify({ apiKey: key.trim() }) }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || '保存失败，请重试');
      setKey(''); onConfigured(result.configured === true);
      setStatus(remove ? 'Key 已移除' : 'Key 已保存，即刻生效');
    } catch (error) { setError(error instanceof Error ? error.message : '保存失败，请重试'); }
    finally { setBusy(false); }
  }
  return <section aria-label="MiniMax API Key 配置" className="space-y-3 rounded-xl border border-stone-700 bg-stone-800/40 p-3 text-xs text-stone-300">
    <label htmlFor="minimax-api-key" className="block font-semibold">MiniMax API Key</label>
    <p className="text-stone-400">{configured ? '已配置；填写新 Key 可替换当前配置。' : '尚未配置，请填写 MiniMax 平台的 API Key。'}对话、语音识别与朗读共用此 Key。</p>
    <input id="minimax-api-key" type="password" autoComplete="off" spellCheck={false} maxLength={8192} value={key} disabled={busy} onChange={event => setKey(event.target.value)} placeholder={configured ? '输入新的 API Key' : '输入 MiniMax API Key'} className="w-full rounded-lg border border-stone-700 bg-stone-950 p-2 focus:border-amber-400 focus:outline-none" />
    <div className="flex gap-3">
      <button type="button" disabled={busy || !key.trim()} onClick={() => void save()} className="rounded-lg bg-amber-400 px-3 py-2 font-semibold text-stone-950 disabled:opacity-40">{busy ? '正在保存…' : '保存 Key'}</button>
      <button type="button" disabled={busy || !configured} onClick={() => void save(true)} className="px-2 py-2 text-stone-400 disabled:opacity-40">移除 Key</button>
    </div>
    <p className="text-[11px] text-stone-400">仅保存在本机，重启后保留；保存后不会回显 Key。调用 MiniMax 按账户用量计费。</p>
    {status && <p role="status" className="text-amber-300">{status}</p>}
    {error && <p role="alert" className="text-red-300">{error}</p>}
  </section>;
}
