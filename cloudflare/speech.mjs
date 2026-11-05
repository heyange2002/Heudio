import { DEFAULT_SPEECH, SPEECH_MODELS, SPEECH_VOICES, MAX_SPEECH_TEXT } from '../shared/speech.mjs';

const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const error = (message, status) => Response.json({ error: message }, { status, headers });
export const speechConfig = env => ({ provider: 'minimax', configured: !!env.MINIMAX_API_KEY?.trim(), ...DEFAULT_SPEECH });

// Shared by Express and Workers. The provider key never leaves the server.
export async function synthesizeSpeech(body, env, fetchImpl = fetch, signal) {
  if (!body || typeof body.text !== 'string' || !body.text.trim() || body.text.length > MAX_SPEECH_TEXT) {
    return error(`朗读文字应为 1～${MAX_SPEECH_TEXT} 字符`, 400);
  }
  const { model = DEFAULT_SPEECH.model, voiceId = DEFAULT_SPEECH.voiceId, speed = DEFAULT_SPEECH.speed } = body;
  if (!SPEECH_MODELS.some(item => item.id === model) || !SPEECH_VOICES.some(item => item.id === voiceId) ||
      typeof speed !== 'number' || !Number.isFinite(speed) || speed < 0.8 || speed > 1.2) {
    return error('音色、模型或语速设置无效', 400);
  }
  const key = env.MINIMAX_API_KEY?.trim();
  if (!key) return error('MiniMax 语音尚未配置，请在设置中填写 MiniMax API Key', 503);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(cancel, 45000);
  try {
    const response = await fetchImpl('https://api.minimax.cn/v1/t2a_v2', {
      // Workers supports follow/manual only. Inspect redirects without forwarding the key.
      method: 'POST', signal: controller.signal, redirect: 'manual',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, text: body.text.trim(), stream: false, output_format: 'hex', language_boost: 'auto',
        // Playback already uses full volume; boost the synthesized voice at source.
        voice_setting: { voice_id: voiceId, speed, vol: 5, pitch: 0 },
        audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 },
      }),
    });
    if (response.status >= 300 && response.status < 400) return error('MiniMax 接口返回重定向，请检查后端接入地址', 502);
    if (!response.ok) return error(response.status === 429 ? '语音服务繁忙，请稍后再试' : 'MiniMax 语音调用失败，请检查后端密钥与账户额度', response.status === 429 ? 429 : 502);
    // Bound memory use on Workers; a 1500-character companion reply fits below this cap.
    const reader = response.body?.getReader();
    if (!reader) return error('语音服务未返回音频', 502);
    const chunks = []; let length = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 24 * 1024 * 1024) { await reader.cancel(); return error('语音响应过大，请缩短朗读内容', 502); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let result;
    try { result = JSON.parse(new TextDecoder().decode(bytes)); }
    catch { return error('MiniMax 返回格式异常，请稍后重试', 502); }
    if (result.base_resp?.status_code !== 0) return error('MiniMax 语音合成失败，请检查后端密钥、账户额度与音色权限', 502);
    const hex = result.data?.audio;
    if (typeof hex !== 'string' || !hex.length || hex.length % 2 || !/^[a-f\d]+$/i.test(hex)) return error('语音服务未返回有效音频', 502);
    const audio = new Uint8Array(hex.length / 2);
    for (let i = 0; i < audio.length; i++) audio[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return new Response(audio, { headers: { ...headers, 'Content-Type': 'audio/mpeg' } });
  } catch {
    return error(controller.signal.aborted ? '语音生成已取消或超时，请重试' : '暂时无法连接 MiniMax 语音服务，请稍后重试', controller.signal.aborted ? 504 : 502);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}
