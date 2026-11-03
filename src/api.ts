export async function apiFetch(path: string, options: RequestInit = {}) {
  if (location.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) throw Error('请通过 HTTPS 连接服务');
  const response = await fetch(path, { ...options, credentials: 'same-origin', headers: { ...options.headers, 'X-Soundisle-Client': 'web' } });
  if (response.status === 401) window.dispatchEvent(new Event('soundisle:locked'));
  return response;
}
