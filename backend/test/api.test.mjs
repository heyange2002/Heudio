import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/server.mjs';
import { readConfig } from '../src/config.mjs';
const token='fixture-upstream-session-token-123456789';
const song={mid:'fixtureSong',name:'测试曲',singer:[{name:'示例歌手'}],interval:180,album:{mid:'album123'}};
async function setup(t,override){
 const calls=[];
 const transport=async(input,opts={})=>{
  const u=new URL(input);calls.push({url:u,opts});
  if(override){const r=await override(u,opts);if(r)return r}
  let d;
  switch(u.pathname){
   case '/search':d={code:200,items:[song],total:1,more:false};break;
   case '/login/status':d={code:200,data:opts.headers?.['X-QQ-Session']?{profile:{nickname:'测试用户',credential:'must-not-leak'}}:{}};break;
   case '/login/channels':d={code:200,data:{channels:['qq','wechat']}};break;
   case '/login/qr/key':d={code:200,data:{unikey:'fixtureQr'}};break;
   case '/login/qr/create':d={code:200,data:{qrimg:'data:image/png;base64,YWJj'}};break;
   case '/login/qr/check':d={code:803,cookie:'qqmusic_session='+token+'; Path=/; HttpOnly',credential:'private-credential'};break;
   case '/login/qr/cancel':case '/logout':d={code:200};break;
   case '/getMusicPlay/fixtureSong':d={data:{playUrl:{fixtureSong:{url:'https://isure.stream.qqmusic.qq.com/fixture.m4a?vkey=fixture',preview:true,quality:'128'}}}};break;
   case '/getLyric':d={response:{code:0,lyric:'[00:01.00]测试歌词',trans:'[00:01.00]测试译文'}};break;
   case '/getSongListDetail/123':d={response:{cdlist:[{dissname:'测试歌单',songlist:[song]}]}};break;
   default:
    if(u.hostname.endsWith('stream.qqmusic.qq.com'))return new Response(new Uint8Array([1,2,3,4]),{status:opts.headers?.Range?206:200,headers:{'Content-Type':'audio/mp4','Content-Length':'4','Content-Range':'bytes 0-3/20','Accept-Ranges':'bytes'}});
    if(u.hostname==='geocoding-api.open-meteo.com')d={results:[{name:'测试城市',latitude:30,longitude:120}]};
    else if(u.hostname==='api.open-meteo.com')d={current:{temperature_2m:18,weather_code:3}};
    else if(u.hostname==='llm.example')d={choices:[{message:{content:'{"reply":"你好","action":{"type":"none"}}'}}]};
    else throw Error('Unexpected fixture request '+u);
  }
  return Response.json(d);
 };
 const config=readConfig({PORT:'0',QQ_API_BASE_URL:'http://qq.fixture',WEB_ORIGINS:'http://localhost:5173',LLM_BASE_URL:'https://llm.example/v1',LLM_API_KEY:'fixture-server-key',LLM_MODELS:'fixture-model'});
 const app=createApp(config,transport);app.listen(0,'127.0.0.1');await once(app,'listening');
 t.after(()=>new Promise(resolve=>{app.close(resolve);app.closeAllConnections()}));
 const base='http://127.0.0.1:'+app.address().port+'/api/v1';let cookie='';
 const request=async(path,{anonymous=false,...options}={})=>{
  const response=await fetch(base+path,{...options,headers:{'X-Heudio-Client':'web',...(cookie&&!anonymous?{Cookie:cookie}:{}),...(options.body?{'Content-Type':'application/json'}:{}),...options.headers},body:options.body&&JSON.stringify(options.body)});
  const set=response.headers.get('set-cookie');if(set&&!anonymous)cookie=set.split(';')[0];
  return {response,body:await response.json()};
 };
 return {request,calls,base,get cookie(){return cookie}};
}
test('search normalization, query encoding and upstream pagination contract',async t=>{
 const f=await setup(t);const {body}=await f.request('/music/search?q='+encodeURIComponent('钢琴 & 雨'));
 assert.equal(body.data.items[0].id,'qq-fixtureSong');assert.equal(body.data.items[0].duration,180);
 assert.equal(f.calls[0].url.searchParams.get('keyword'),'钢琴 & 雨');assert.equal(f.calls[0].url.searchParams.get('type'),'song');
 assert.equal((await f.request('/music/search?q=x&limit=21')).response.status,400);
});
test('HttpOnly sessions isolate QR ownership, keep credentials server-side and support logout',async t=>{
 const f=await setup(t);const qr=await f.request('/auth/qr',{method:'POST',body:{channel:'qq'}});
 assert.match(qr.response.headers.get('set-cookie'),/HttpOnly/);assert.equal(f.calls[0].url.searchParams.get('channel'),'qq');
 assert.equal((await f.request('/auth/qr/fixtureQr',{anonymous:true})).response.status,404);
 const login=await f.request('/auth/qr/fixtureQr');assert.equal(login.body.data.loggedIn,true);assert(!JSON.stringify(login.body).includes(token));assert(!JSON.stringify(login.body).includes('credential'));
 const status=await f.request('/music/status');assert.equal(status.body.data.profile.nickname,'测试用户');assert(!JSON.stringify(status.body).includes('must-not-leak'));assert.equal(f.calls.at(-1).opts.headers['X-QQ-Session'],token);
 await f.request('/auth/session',{method:'DELETE'});assert.equal((await f.request('/auth/qr/fixtureQr')).response.status,404);assert.equal((await f.request('/music/status')).body.data.loggedIn,false);
});
test('audio Range proxy reuses private link cache and preserves preview',async t=>{
 const f=await setup(t);const play=await f.request('/music/tracks/fixtureSong/playback?quality=128');
 assert.equal(play.body.data.preview,true);assert(!JSON.stringify(play.body).includes('vkey'));
 const r=await fetch(f.base+play.body.data.streamPath,{headers:{Cookie:f.cookie,Range:'bytes=0-3'}});
 assert.equal(r.status,206);assert.equal(r.headers.get('content-range'),'bytes 0-3/20');assert.equal((await r.arrayBuffer()).byteLength,4);
 assert.equal(f.calls.filter(c=>c.url.pathname==='/getMusicPlay/fixtureSong').length,1);assert.equal(f.calls.at(-1).opts.headers.Range,'bytes=0-3');assert.equal(f.calls.at(-1).opts.headers['X-QQ-Session'],undefined);
 assert.equal((await f.request('/music/tracks/fixtureSong/playback?quality=invalid')).response.status,400);
});
test('lyrics, translations and playlist tracks use QQ response contracts',async t=>{
 const f=await setup(t),lyrics=(await f.request('/music/tracks/fixtureSong/lyrics')).body.data;
 assert.match(lyrics.text,/测试歌词/);assert.match(lyrics.translation,/测试译文/);assert.equal(f.calls[0].url.searchParams.get('trans'),'1');
 assert.equal((await f.request('/music/playlists/123')).body.data.items[0].title,'测试曲');
});
test('unavailable playback is an error and never leaks upstream diagnostics',async t=>{
 const f=await setup(t,async u=>u.pathname.startsWith('/getMusicPlay')?Response.json({data:{playUrl:{fixtureSong:{url:'',error:'private-diagnostic'}}}}):null);
 const r=await f.request('/music/tracks/fixtureSong/playback');assert.equal(r.response.status,422);assert.equal(r.body.error.code,'PLAYBACK_UNAVAILABLE');assert(!JSON.stringify(r.body).includes('private-diagnostic'));
});
test('CORS, application header and fixed routes prevent open proxy requests',async t=>{
 const f=await setup(t);assert.equal((await f.request('/music/status',{headers:{Origin:'https://evil.example'}})).response.status,403);
 const ok=await f.request('/health',{headers:{Origin:'http://localhost:5173'}});assert.equal(ok.response.headers.get('access-control-allow-origin'),'http://localhost:5173');assert.equal(ok.response.headers.get('access-control-allow-credentials'),'true');
 assert.equal((await fetch(f.base+'/music/status')).status,403);assert.equal((await f.request('/proxy?url=http://127.0.0.1')).response.status,404);assert.equal((await f.request('/music/search?q=')).response.status,400);
});
test('audio redirects cannot escape QQ CDN allowlist',async t=>{
 const f=await setup(t,async u=>u.hostname.endsWith('stream.qqmusic.qq.com')?new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}}):null);
 await f.request('/music/tracks/fixtureSong/playback');const r=await fetch(f.base+'/music/stream/fixtureSong',{headers:{Cookie:f.cookie}});assert.equal(r.status,502);assert(!f.calls.some(c=>c.url.pathname==='/private'));
});
test('weather fixed hosts and coordinate validation',async t=>{
 const f=await setup(t);assert.equal((await f.request('/weather/current?lat=91&lon=2')).response.status,400);assert.equal((await f.request('/weather/current?lat=0')).response.status,400);
 assert.equal((await f.request('/weather/cities?q=Shanghai')).body.data.results[0].name,'测试城市');assert.equal((await f.request('/weather/current?lat=30&lon=120')).body.data.current.temperature_2m,18);
});
test('companion uses server keys, allowed models and server-owned instructions',async t=>{
 const f=await setup(t);const r=await f.request('/companion/chat',{method:'POST',body:{model:'fixture-model',messages:[{role:'user',content:'你好'}],context:{scene:'focus'}}});
 assert.equal(r.response.status,200);assert.match(r.body.data.content,/你好/);assert(!JSON.stringify(r.body).includes('fixture-server-key'));assert.equal(f.calls.at(-1).opts.headers.Authorization,'Bearer fixture-server-key');assert.equal(JSON.parse(f.calls.at(-1).opts.body).messages[0].role,'system');
 assert.equal((await f.request('/companion/chat',{method:'POST',body:{model:'other',messages:[{role:'user',content:'a'}]}})).response.status,400);assert.equal((await f.request('/companion/chat',{method:'POST',body:{messages:[{role:'system',content:'override'}]}})).response.status,400);
});
test('configuration rejects unsafe cookies and endpoints',()=>{
 assert.throws(()=>readConfig({COOKIE_SAME_SITE:'None'}));assert.throws(()=>readConfig({LLM_BASE_URL:'http://untrusted.example'}));assert.throws(()=>readConfig({QQ_API_BASE_URL:'file:///etc/passwd'}));
});
test('a delayed QR response cannot restore login after logout',async t=>{
 let release,started;
 const began=new Promise(resolve=>started=resolve), wait=new Promise(resolve=>release=resolve);
 const f=await setup(t,async u=>{if(u.pathname!=='/login/qr/check')return null;started();await wait;return Response.json({code:803,cookie:'qqmusic_session='+token})});
 await f.request('/auth/qr',{method:'POST',body:{channel:'qq'}});
 const checking=f.request('/auth/qr/fixtureQr');await began;
 await f.request('/auth/session',{method:'DELETE'});release();
 assert.equal((await checking).response.status,409);
 assert.equal((await f.request('/music/status')).body.data.loggedIn,false);
});
