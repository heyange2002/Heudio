import fs from 'node:fs';
import assert from 'node:assert/strict';
const base=process.env.VERIFY_URL||'https://dqs1l7x3d1eg8.cloudfront.net';
const config=JSON.parse(fs.readFileSync(process.env.RUNTIME_CONFIG||'/etc/soundisle/runtime.json','utf8'));
let cookie='';
const request=(path,options={})=>fetch(base+path,{signal:AbortSignal.timeout(90000),...options,headers:{'X-Soundisle-Client':'web',Origin:base,...(cookie?{Cookie:cookie}:{}),...options.headers}});
let r=await request('/api/auth/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:config.env.APP_ACCESS_KEY})});
assert.equal(r.status,200);cookie=r.headers.get('set-cookie').split(';')[0];
const result={};
try {
for(const [name,path] of [['agent','/api/agent/config'],['voice','/api/voice/config']]){
  r=await request(path);assert.equal(r.status,200);const data=await r.json();assert.equal(data.configured,true);result[name]={configured:data.configured,model:data.model};
}
r=await request('/api/agent/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'请用一句简短中文打个招呼，这是连接验证。',chatModel:'minimax-m3',musicSource:'local',currentScene:'focus'})});
const chat=await r.json();result.chat={status:r.status,mode:chat.mode,model:chat.model,replyPresent:!!chat.reply,...(chat.fallbackReason?{fallbackReason:chat.fallbackReason}:{})};
r=await request('/api/voice/synthesize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'你好，声屿已连接。'})});
const contentType=r.headers.get('content-type');
if(r.ok&&contentType?.includes('audio/')) {const audio=await r.arrayBuffer();result.speech={status:r.status,contentType,bytes:audio.byteLength};}
else result.speech={status:r.status,error:(await r.json()).error};
console.log(JSON.stringify(result,null,2));
assert.equal(result.chat.mode,'model','Live MiniMax model call failed');assert.equal(result.speech.status,200,'Live speech call failed');assert.ok(result.speech.bytes>0);
} finally {await request('/api/auth/session',{method:'DELETE'});}
