export function readConfig(env = process.env) {
  const origins = (env.WEB_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map(s => new URL(s.trim()).origin);
  const qqBase = new URL(env.QQ_API_BASE_URL || 'http://127.0.0.1:3200');
  if (!['http:', 'https:'].includes(qqBase.protocol) || qqBase.username || qqBase.password || qqBase.search || qqBase.hash) throw Error('Invalid QQ_API_BASE_URL');
  const models = (env.LLM_MODELS || env.LLM_DEFAULT_MODEL || '').split(',').map(s => s.trim()).filter(Boolean);
  const llmBase = env.LLM_BASE_URL ? new URL(env.LLM_BASE_URL) : null;
  if (llmBase && (!['http:', 'https:'].includes(llmBase.protocol) || (llmBase.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(llmBase.hostname)))) throw Error('LLM_BASE_URL requires HTTPS outside localhost');
  if (llmBase && (llmBase.username || llmBase.password || llmBase.search || llmBase.hash)) throw Error('Invalid LLM_BASE_URL');
  const secure = env.COOKIE_SECURE === 'true';
  const sameSite = env.COOKIE_SAME_SITE || 'Lax';
  if (!['Lax', 'Strict', 'None'].includes(sameSite) || (sameSite === 'None' && !secure)) throw Error('SameSite=None requires COOKIE_SECURE=true');
  const number = (key, fallback, min, max) => {
    const n = Number(env[key] || fallback);
    if (!Number.isInteger(n) || n < min || n > max) throw Error('Invalid ' + key);
    return n;
  };
  return {
    host: env.HOST || '127.0.0.1', port: number('PORT', 3001, 0, 65535), origins,
    qqBase: qqBase.href.replace(/\/$/, ''), secure, sameSite,
    sessionTtl: number('SESSION_TTL_SECONDS', 86400, 60, 2592000) * 1000,
    timeout: number('UPSTREAM_TIMEOUT_MS', 20000, 100, 120000),
    llmBase: llmBase?.href.replace(/\/$/, ''), llmKey: env.LLM_API_KEY || '',
    models, defaultModel: models.includes(env.LLM_DEFAULT_MODEL) ? env.LLM_DEFAULT_MODEL : models[0],
  };
}

export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export function required(value, name, pattern = /^[a-zA-Z0-9_-]{1,128}$/) {
  if (typeof value !== 'string' || !pattern.test(value)) throw new ApiError(400, 'INVALID_ARGUMENT', name + ' 格式不正确');
  return value;
}
export function integer(value, fallback, min, max) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new ApiError(400, 'INVALID_ARGUMENT', '分页参数超出范围');
  return n;
}
