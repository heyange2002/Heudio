import { randomBytes } from 'node:crypto';
export class MusicStore {
  constructor(ctx) { this.ctx = ctx; }
  async fetch(request) {
    const { action, key, value } = await request.json();
    const store = this.ctx.storage;
    if (action === 'secret') return Response.json(await store.transaction(async tx => {
      let secret = await tx.get('qq:secret');
      if (!secret) { secret = randomBytes(32).toString('hex'); await tx.put('qq:secret', secret); }
      return secret;
    }));
    if (action === 'get') return Response.json(await store.get(key) ?? null);
    if (action === 'put') { await store.put(key, value); if (value?.expires) await store.setAlarm(Date.now() + 86400000); }
    if (action === 'delete') await store.delete(key);
    return Response.json({ ok: true });
  }
  async alarm() {
    const records = new Map([...(await this.ctx.storage.list({ prefix: 'qq:session:' })), ...(await this.ctx.storage.list({ prefix: 'media:' }))]);
    const expired = [...records].filter(([,v]) => v.expires <= Date.now()).map(([k]) => k);
    if (expired.length) await this.ctx.storage.delete(expired);
    if (records.size > expired.length) await this.ctx.storage.setAlarm(Date.now() + 86400000);
  }
}
export function remoteMusicStore(env) {
  const stub = env.MUSIC.get(env.MUSIC.idFromName('private-music-state'));
  const invoke = async (action, key = '', value = null) => {
    const response = await stub.fetch(new Request('https://internal/state', { method: 'POST', body: JSON.stringify({ action, key, value }) }));
    if (!response.ok) throw Error('音乐配置存储暂时不可用');
    return response.json();
  };
  return { get: key => invoke('get', key), put: (key, value) => invoke('put', key, value), delete: key => invoke('delete', key), ensureSecret: () => invoke('secret') };
}
export async function musicEnvironment(env, store) {
  return { ...env, QQ_SESSION_SECRET: env.QQ_SESSION_SECRET || await store.ensureSecret() };
}
