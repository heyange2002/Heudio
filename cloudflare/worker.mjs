import { musicRoute, createMusicClient } from './music.mjs';
import { isMediaRequest } from './playback.mjs';
import { transcribeSpeech } from './transcribe.mjs';
import { remoteMusicStore, musicEnvironment } from './music-store.mjs';
import { getWeather } from './context.mjs';
export { MusicStore } from './music-store.mjs';
import { companionChat, companionConfig } from './companion.mjs';
import { isAccessCode } from '../shared/access-code.mjs';
import { speechConfig, synthesizeSpeech } from './speech.mjs';
export { AuthStore } from './auth.mjs';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Strict-Transport-Security':'max-age=31536000','X-Content-Type-Options':'nosniff'}});
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.protocol!=='https:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname))return json({error:'请通过 HTTPS 访问'},426);
  if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
  if(url.pathname==='/api/health'&&request.method==='GET')return json({service:'soundisle-backend',accessKeyConfigured:isAccessCode(env.APP_ACCESS_KEY),modelConfigured:companionConfig(env).configured});
  if(request.headers.get('Sec-Fetch-Site')==='cross-site'||(request.headers.get('X-Soundisle-Client')!=='web'&&!isMediaRequest(request.method,url.pathname)))return json({error:'请求来源无效'},403);
  const origin=request.headers.get('Origin');
  if(origin&&origin!==url.origin)return json({error:'请使用后端同域页面登录'},403);
  if(!url.pathname.startsWith('/api/music/')&&url.pathname!=='/api/context/weather'&&!['/api/auth/session','/api/agent/chat','/api/agent/config','/api/voice/config','/api/voice/synthesize','/api/voice/transcribe'].includes(url.pathname))return json({error:'接口不存在'},404);
  try{
   if(['POST','PUT','PATCH'].includes(request.method)&&url.pathname!=='/api/voice/transcribe'){
    if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'请使用 JSON 请求'},415);
    const reader=request.body?.getReader();const chunks=[];let size=0;
    if(reader){while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536){await reader.cancel();return json({error:'请求内容过长'},413);}chunks.push(value);}}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    const data=new TextDecoder().decode(bytes);JSON.parse(data);request=new Request(request,{body:data});
   }
   const auth=env.AUTH.get(env.AUTH.idFromName('access-control'));
   if(url.pathname==='/api/auth/session')return auth.fetch(request);
   const check=await auth.fetch(new Request(new URL('/api/auth/session',url),{headers:request.headers}));
   if(!check.ok)return check;
   if(!(await check.json()).authenticated)return json({error:'请先输入4位数字访问码'},401);
   if(url.pathname==='/api/voice/transcribe')return request.method==='POST'?transcribeSpeech(request,env):json({error:'方法不支持'},405);
   if(url.pathname.startsWith('/api/music/')) {
    const store=remoteMusicStore(env);
    return musicRoute(request,await musicEnvironment(env,store),store);
   }
   if(url.pathname==='/api/context/weather')return request.method==='GET'?json(await getWeather(url.searchParams.get('city'))):json({error:'方法不支持'},405);
   if(url.pathname==='/api/agent/config')return request.method==='GET'?json(companionConfig(env)):json({error:'方法不支持'},405);
   if(url.pathname==='/api/voice/config')return request.method==='GET'?json(speechConfig(env)):json({error:'方法不支持'},405);
   if(request.method!=='POST')return json({error:'方法不支持'},405);
   const body=await request.json();
   if(url.pathname==='/api/voice/synthesize')return synthesizeSpeech(body,env,fetch,request.signal);
   if(typeof body.message!=='string'||!body.message.trim()||body.message.length>8000)return json({error:'消息长度应为 1～8000 字符'},400);
   let music;
   if(env.MUSIC&&body.musicSource==='qq-music') {
    const store=remoteMusicStore(env);music=await createMusicClient(request,await musicEnvironment(env,store),store);
   }
   const weather=await getWeather(body.profile?.city);
   return json(await companionChat({...body,weather:weather.summary},env,fetch,request.signal,music));
  }catch{return json({error:'请求格式无效或服务暂时不可用'},400);}
 }
};
