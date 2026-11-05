import { useEffect, useState } from 'react';
import { apiFetch } from '../api';
import { MEMORY_LIMITS } from '../../shared/agent-memory.mjs';

export function AgentMemorySettings({ sessionId, busy, onNewConversation }: { sessionId: string; busy: boolean; onNewConversation: () => void }) {
  const [memory, setMemory] = useState<{ longTerm: string; shortTerm: { content: string }[]; compressionStatus?: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    apiFetch('/api/agent/memory?sessionId=' + encodeURIComponent(sessionId), { signal: controller.signal }).then(async response => {
      if (!response.ok) throw Error('记忆暂时无法读取');
      const data = await response.json();
      if (!controller.signal.aborted) setMemory({ longTerm: data.longTerm || '', shortTerm: Array.isArray(data.shortTerm) ? data.shortTerm : [], compressionStatus: data.compressionStatus });
    }).catch(() => { if (!controller.signal.aborted) setError('记忆暂时无法读取，请重新打开设置'); });
    return () => controller.abort();
  }, [sessionId]);
  async function clear(scope: 'session' | 'all') {
    setPending(true); setError('');
    try {
      const response = await apiFetch(`/api/agent/memory?sessionId=${encodeURIComponent(sessionId)}&scope=${scope}`, { method: 'DELETE' });
      if (!response.ok) throw Error('记忆清除失败，请重试');
      onNewConversation();
      setMemory(prev => ({ longTerm: scope === 'all' ? '' : prev?.longTerm || '', shortTerm: [] }));
    } catch (error) { setError(error instanceof Error ? error.message : '记忆清除失败'); }
    finally { setPending(false); }
  }
  return <section aria-label="阿屿的记忆" className="space-y-3 rounded-xl border border-stone-700 p-3 text-xs text-stone-300">
    <h4 className="font-semibold text-stone-200">阿屿的记忆</h4>
    <p>短期记忆 · 当前 {memory?.shortTerm.length || 0} / {MEMORY_LIMITS.messages} 条，上限 {MEMORY_LIMITS.characters.toLocaleString()} 字符。</p>
    <p className="text-stone-400">记住本次对话的上下文，超出容量后保留最近内容。同一窗口刷新可继续，24 小时未使用后过期；开始新对话会清空短期记忆。</p>
    <label className="block font-semibold" htmlFor="agent-long-memory">长期记忆 · 核心摘要</label>
    <textarea id="agent-long-memory" readOnly rows={5} value={memory?.longTerm || ''} placeholder="还没有长期记忆。交流中明确表达的偏好与重要事项会逐步压缩保存。" className="w-full resize-y rounded-lg border border-stone-700 bg-stone-950 p-2 leading-relaxed" />
    <p className="text-stone-400">每次交流后在后台压缩，最多 {MEMORY_LIMITS.longTermCharacters.toLocaleString()} 字符，跨对话保留。意图判断与回复都会参考短期和长期记忆，当前要求优先。压缩会使用 MiniMax 并按用量计费；离线或压缩失败时保留原摘要。</p>
    {memory?.compressionStatus === 'deferred' && <p role="status" className="text-amber-300">最近一次摘要更新未完成，原摘要已保留，下次交流会重试。</p>}
    <div className="flex gap-4">
      <button type="button" disabled={busy || pending} onClick={() => void clear('session')} className="text-amber-300 disabled:opacity-40">开始新对话</button>
      <button type="button" disabled={busy || pending} onClick={() => void clear('all')} className="text-stone-400 disabled:opacity-40">清除全部记忆</button>
    </div>
    {error && <p role="alert" className="text-red-300">{error}</p>}
  </section>;
}
