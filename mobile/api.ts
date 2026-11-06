import { apiFetch } from "../src/api";
export async function request<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const timeout = AbortSignal.timeout(30000);
  const response = await apiFetch(path, {
    ...options,
    signal: options.signal
      ? AbortSignal.any([options.signal, timeout])
      : timeout,
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw Error("服务响应无效，请检查后端地址或更新服务");
  }
  if (!response.ok) throw Error(data.error || `请求失败（${response.status}）`);
  return data;
}
export const music = (path: string, options?: RequestInit) =>
  request("/api/music" + path, options);
