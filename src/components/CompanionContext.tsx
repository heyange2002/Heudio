import { MapPin, Sun, CloudSun, Cloud, CloudRain, CloudDrizzle, CloudSnow, CloudLightning, CloudFog, CircleHelp, Clock3 } from 'lucide-react';

export function weatherIcon(text: string) {
  if (/雷|thunder/i.test(text)) return CloudLightning;
  if (/雪|snow|sleet/i.test(text)) return CloudSnow;
  if (/阵雨|drizzle|shower/i.test(text)) return CloudDrizzle;
  if (/雨|rain/i.test(text)) return CloudRain;
  if (/雾|霾|fog|haze/i.test(text)) return CloudFog;
  if (/多云|partly/i.test(text)) return CloudSun;
  if (/阴|cloud|overcast/i.test(text)) return Cloud;
  if (/晴|sun|clear/i.test(text)) return Sun;
  return CircleHelp;
}

export function CompanionContext({ weatherText, timeContextText, city, workState }: {
  weatherText: string; timeContextText: string; city?: string; workState?: string;
}) {
  const weatherParts = weatherText.split(' · ');
  const location = city?.trim() || (weatherParts.length > 1 ? weatherParts[0] : '未设置位置');
  const weather = weatherParts.length > 1 ? weatherParts.slice(1).join(' · ') : weatherText.includes('未设置城市') ? '天气未知' : weatherText;
  const timeParts = timeContextText.split(' · ');
  const day = /(?:星期|周)([一二三四五六日天])/.exec(timeParts[0]);
  const time = day ? `星期${day[1] === '天' ? '日' : day[1]}` : new Intl.DateTimeFormat('zh-CN', { weekday: 'long' }).format(new Date());
  const state = (workState ?? timeParts.slice(1).join(' · ')).trim();
  const showState = state && !['未知', '未选择', '未设置', '未选择状态'].includes(state);
  const WeatherIcon = weatherIcon(weather);
  return <div className="companion-context" aria-label="当前环境">
    <span aria-label={`位置：${location}`}><MapPin aria-hidden="true"/>{location}</span>
    <span aria-label={`天气：${weather}`}><WeatherIcon aria-hidden="true"/>{weather}</span>
    <time><Clock3 aria-hidden="true"/>{time}</time>
    {showState && <span className="context-work-state">{state}</span>}
  </div>;
}
