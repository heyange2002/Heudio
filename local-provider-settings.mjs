import fs from 'node:fs';
import path from 'node:path';

// Desktop-only storage. Neither config responses nor browser storage contain the key.
export function createLocalProviderSettings(dataDir, env) {
  const file = path.join(dataDir, 'minimax-settings.json');
  if (fs.existsSync(file)) {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof saved.apiKey !== 'string') throw Error('MiniMax 本机配置无效');
    env.MINIMAX_API_KEY = saved.apiKey;
  }
  return {
    save(apiKey) {
      if (typeof apiKey !== 'string' || apiKey.length > 8192 || !/^[\x21-\x7e]+$/.test(apiKey)) {
        throw new TypeError('请输入有效的 MiniMax API Key，不能包含空格或换行');
      }
      persist(apiKey);
    },
    clear() { persist(''); },
  };
  function persist(apiKey) {
    const temp = file + '.tmp';
    try {
      fs.writeFileSync(temp, JSON.stringify({ apiKey }), { mode: 0o600 });
      fs.renameSync(temp, file);
    } finally {
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
    // Update only after a successful write, so failures never change the running config.
    env.MINIMAX_API_KEY = apiKey;
  }
}
