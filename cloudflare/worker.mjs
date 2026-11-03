import { GoogleGenAI } from '@google/genai';
import { heuristicAnalysis } from './heuristic.mjs';
export { AuthStore } from './auth.mjs';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Strict-Transport-Security':'max-age=31536000','X-Content-Type-Options':'nosniff'}});
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.protocol!=='https:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname))return json({error:'请通过 HTTPS 访问'},426);
  if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
  if(url.pathname==='/api/health'&&request.method==='GET')return json({service:'soundisle-backend',accessKeyConfigured:!!env.APP_ACCESS_KEY,modelConfigured:!!(env.GEMINI_API_KEY&&env.GEMINI_MODEL)});
  if(request.headers.get('X-Soundisle-Client')!=='web')return json({error:'请求来源无效'},403);
  const origin=request.headers.get('Origin');
  if(origin&&origin!==url.origin)return json({error:'请使用后端同域页面登录'},403);
  if(!['/api/auth/session','/api/agent/chat'].includes(url.pathname))return json({error:'接口不存在'},404);
  try{
   if(['POST','PUT','PATCH'].includes(request.method)){
    if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'请使用 JSON 请求'},415);
    const reader=request.body?.getReader();const chunks=[];let size=0;
    if(reader){while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536){await reader.cancel();return json({error:'请求内容过长'},413);}chunks.push(value);}}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    const data=new TextDecoder().decode(bytes);JSON.parse(data);request=new Request(request,{body:data});
   }
   const auth=env.AUTH.get(env.AUTH.idFromName('access-control'));
   if(url.pathname==='/api/auth/session')return auth.fetch(request);
   if(request.method!=='POST')return json({error:'方法不支持'},405);
   const check=await auth.fetch(new Request(new URL('/api/auth/session',url),{headers:request.headers}));
   if(!check.ok)return check;
   if(!(await check.json()).authenticated)return json({error:'请先输入访问 Key'},401);
   const body=await request.json();
   if(typeof body.message!=='string'||!body.message.trim()||body.message.length>8000)return json({error:'消息长度应为 1～8000 字符'},400);
   const scene=['focus','rest','workout','sleep'].includes(body.currentScene)?body.currentScene:'focus';
   const fallback=()=>({...heuristicAnalysis(body.message,scene),mode:'local'});
   if(!env.GEMINI_API_KEY||!env.GEMINI_MODEL)return json(fallback());
   try{
    const ai=new GoogleGenAI({apiKey:env.GEMINI_API_KEY});
    const result=await ai.models.generateContent({model:env.GEMINI_MODEL,contents:JSON.stringify({message:body.message,scene:body.currentScene,track:body.currentTrack}),config:{httpOptions:{timeout:20000},responseMimeType:'application/json',systemInstruction:'你是声屿音乐伴侣，用简短中文温暖回应，不诊断或承诺治疗，不声称已执行动作。输出JSON：reply、recommendedSceneId(focus|rest|workout|sleep)、sceneTitle、rationale、suggestedFollowUps(字符串数组)。'}});
    const data=JSON.parse(result.text||'{}');
    if(typeof data.reply!=='string'||!['focus','rest','workout','sleep'].includes(data.recommendedSceneId)||!Array.isArray(data.suggestedFollowUps))throw Error('Invalid model output');
    return json({...data,mode:'model'});
   }catch{return json({...fallback(),fallbackReason:'模型暂时不可用'});}
  }catch{return json({error:'请求格式无效或服务暂时不可用'},400);}
 }
};
