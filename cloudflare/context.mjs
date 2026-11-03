// City is explicitly supplied by the user; no implicit location tracking.
const cache = new Map();
export async function getWeather(city, fetchImpl = fetch) {
  if (typeof city !== 'string' || !city.trim() || city.length > 80) return { available: false, summary: '未设置城市，天气未知' };
  const key = city.trim();
  if (cache.get(key)?.until > Date.now()) return cache.get(key).data;
  try {
    const geo = await fetchImpl(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(key)}&count=1&language=zh`, { signal: AbortSignal.timeout(5000) });
    if (!geo.ok) throw Error();
    const place = (await geo.json()).results?.[0]; if (!place) throw Error();
    const response = await fetchImpl(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code&timezone=auto`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw Error();
    const current = (await response.json()).current;
    if (typeof current?.temperature_2m !== 'number' || typeof current.weather_code !== 'number') throw Error();
    const code = current.weather_code;
    const label = code === 0 ? '晴' : code <= 3 ? '多云' : code <= 48 ? '雾' : code <= 67 ? '雨' : code <= 77 ? '雪' : code <= 82 ? '阵雨' : code <= 86 ? '阵雪' : '雷雨';
    const data = { available: true, city: place.name, summary: `${place.name} · ${label} ${current.temperature_2m}°C`, observedAt: current.time };
    if (cache.size > 100) cache.clear(); cache.set(key, { data, until: Date.now() + 600000 }); return data;
  } catch { return { available: false, summary: '天气暂时不可用' }; }
}
