import test from 'node:test';
import assert from 'node:assert/strict';
import { companionChat, companionConfig } from '../cloudflare/companion.mjs';
const body = { message: '下班了，想休息', currentScene: 'focus', chatModel: 'MiniMax-M3' };
const env = { MINIMAX_API_KEY: 'test-server-key' };
const reply = { reply: '陪你放松片刻。', recommendedSceneId: 'rest', sceneTitle: '雨后小憩', rationale: '舒缓音乐适合放松。', suggestedFollowUps: ['轻一点', '加点雨声'] };
const upstream = content => Response.json({ choices: [{ finish_reason: 'stop', message: { content } }] });
const toolResult=(name,args)=>Response.json({choices:[{finish_reason:'tool_calls',message:{role:'assistant',tool_calls:[{id:name,type:'function',function:{name,arguments:JSON.stringify(args)}}]}}]});

test('M3 uses server credentials and returns validated scene JSON', async () => {
  const result = await companionChat(body, env, async (url, options) => {
    assert.equal(url, 'https://api.minimax.cn/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer test-server-key');
    assert.equal(options.redirect, 'manual');
    const payload = JSON.parse(options.body);
    assert.equal(payload.model, 'MiniMax-M3');
    assert.deepEqual(payload.thinking, { type: 'disabled' });
    assert.equal(JSON.parse(payload.messages[1].content).message, body.message);
    assert.equal(JSON.parse(payload.messages[1].content).timeZone,'Asia/Shanghai');
    assert.match(JSON.parse(payload.messages[1].content).localTime,/GMT\+8/);
    return upstream(`<think>private reasoning</think>\n\`\`\`json\n${JSON.stringify({ ...reply, mode: 'spoofed', extra: 'discarded', ambientAdjustments: { rain: 0.3, waves: 10 } })}\n\`\`\``);
  });
  assert.equal(result.mode, 'model'); assert.equal(result.model, 'MiniMax-M3');
  assert.equal(result.reply, reply.reply); assert.equal(result.extra, undefined);
  assert.deepEqual(result.ambientAdjustments, { rain: 0.3 });
  assert.deepEqual(companionConfig(env), { provider: 'minimax', model: 'MiniMax-M3', configured: true });
});

test('missing key and explicit offline choice never call the provider', async () => {
  const fail = () => { throw Error('must not call'); };
  assert.equal((await companionChat(body, {}, fail)).mode, 'local');
  const result = await companionChat({ ...body, chatModel: 'local-heuristic' }, env, fail);
  assert.equal(result.mode, 'local'); assert.equal(result.fallbackReason, undefined);
  assert.equal(companionConfig({ MINIMAX_API_KEY: '  ' }).configured, false);
});

test('provider errors, redirects, incomplete and malformed JSON safely fall back', async () => {
  for (const response of [new Response(null, { status: 401 }), new Response(null, { status: 302 }), upstream('invalid'), upstream(JSON.stringify({ ...reply, suggestedFollowUps: [null] })), Response.json({ choices: [{ finish_reason: 'length', message: { content: JSON.stringify(reply) } }] }), upstream('x'.repeat(70000))]) {
    const result = await companionChat(body, env, async () => response);
    assert.equal(result.mode, 'local'); assert.match(result.fallbackReason, /暂时不可用/);
    assert(!JSON.stringify(result).includes('test-server-key'));
  }
});

test('cancellation reaches upstream fetch and returns a local response', async () => {
  const controller = new AbortController();
  const pending = companionChat(body, env, async (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(Error('aborted')))), controller.signal);
  controller.abort(); assert.equal((await pending).mode, 'local');
});

test('Workers protects model config and chat; offline choice bypasses MiniMax', async () => {
  const { default: worker } = await import('../cloudflare/worker.mjs');
  const bindings = { ...env, AUTH: { idFromName: () => 'auth', get: () => ({ fetch: async () => Response.json({ authenticated: true }) }) } };
  const request = (path, options = {}) => new Request(`https://soundisle.test${path}`, { ...options, headers: { 'X-Soundisle-Client': 'web', 'Content-Type': 'application/json', ...options.headers } });
  let response = await worker.fetch(request('/api/agent/config'), bindings);
  assert.deepEqual(await response.json(), companionConfig(env));
  bindings.AUTH.get = () => ({ fetch: async () => Response.json({ authenticated: false }) });
  response = await worker.fetch(request('/api/agent/config'), bindings); assert.equal(response.status, 401);
  response = await worker.fetch(request('/api/agent/chat', { method: 'POST', body: JSON.stringify(body) }), bindings); assert.equal(response.status, 401);
  bindings.AUTH.get = () => ({ fetch: async () => Response.json({ authenticated: true }) });
  response = await worker.fetch(request('/api/agent/chat', { method: 'POST', body: JSON.stringify({ ...body, chatModel: 'local-heuristic' }) }), bindings);
  assert.equal((await response.json()).mode, 'local');
});

test('persona, history and user context drive real search → validated queue → final reply', async () => {
  const song = { mid: 'real123', title: '安静的歌', artist: '测试歌手' };
  let step = 0;
  const answer = await companionChat({ ...body, profile: { name: '小张', preferences: '喜欢纯音乐', workState: '工作专注中' }, history: [{ role: 'user', content: '不要鼓点' }] }, env, async (_url, options) => {
    const data = JSON.parse(options.body);
    assert.match(data.messages[0].content, /阿屿/);
    assert.equal(data.messages[1].content, '不要鼓点');
    const current = JSON.parse(data.messages[2].content); assert.equal(current.profile.workState, '工作专注中');
    if (step++ === 0) return Response.json({ choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: '', tool_calls: [{ id: 'find', type: 'function', function: { name: 'search_music', arguments: '{"keyword":"安静纯音乐"}' } }] } }] });
    if (step === 2) { assert.equal(JSON.parse(data.messages.at(-1).content).songs[0].mid, song.mid); return Response.json({ choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: '', tool_calls: [{ id: 'queue', type: 'function', function: { name: 'queue_music', arguments: '{"title":"专注时刻","mids":["real123"]}' } }] } }] }); }
    return upstream(JSON.stringify(reply));
  }, undefined, { search: async keyword => { assert.equal(keyword, '安静纯音乐'); return [song]; } });
  assert.equal(step, 3); assert.equal(answer.mode, 'model'); assert.equal(answer.playlist.songs[0].mid, 'real123'); assert.equal(answer.toolTrace.length, 2);
});
test('agent rejects fabricated song IDs and reports tool failure to the model', async () => {
  let step = 0;
  const answer = await companionChat(body, env, async (_url, options) => {
    const data = JSON.parse(options.body);
    if (!step++) return Response.json({ choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: '', tool_calls: [{ id: 'bad', type: 'function', function: { name: 'queue_music', arguments: '{"title":"bad","mids":["invented"]}' } }] } }] });
    assert(JSON.parse(data.messages.at(-1).content).error); return upstream(JSON.stringify(reply));
  }, undefined, {});
  assert.equal(answer.mode, 'model'); assert.equal(answer.playlist, undefined); assert.equal(answer.toolTrace[0].ok, false);
});

test('playlist action repairs a text-only answer and returns immediately after a validated music queue', async()=>{
 const songs=Array.from({length:6},(_,i)=>({mid:'real'+i,title:'歌曲'+i,artist:'歌手'}));let round=0;
 const answer=await companionChat({...body,intent:'playlist',profile:{preferences:'纯钢琴',workState:'工作中'}},env,async(_url,options)=>{
  const data=JSON.parse(options.body);assert.match(data.messages[0].content,/本次是歌单编排操作/);
  if(round++===0)return upstream(JSON.stringify(reply));
  if(round===2){assert.match(data.messages.at(-1).content,/先调用/);return Response.json({choices:[{finish_reason:'tool_calls',message:{role:'assistant',tool_calls:[{id:'find',type:'function',function:{name:'search_music',arguments:'{"keyword":"专注钢琴"}'}}]}}]});}
  assert.equal(JSON.parse(data.messages.filter(m=>m.role==='tool').at(-1).content).songs.length,6);
  assert.deepEqual(data.tools.map(t=>t.function.name),['queue_music']);
  return Response.json({choices:[{finish_reason:'tool_calls',message:{role:'assistant',tool_calls:[{id:'queue',type:'function',function:{name:'queue_music',arguments:JSON.stringify({title:'专注当下',mids:songs.map(s=>s.mid).reverse()})}}]}}]});
 },undefined,{search:async keyword=>{assert.equal(keyword,'专注钢琴');return songs;}});
 assert.equal(round,3);assert.equal(answer.mode,'model');assert.equal(answer.playlist.title,'专注当下');
 assert.deepEqual(answer.playlist.songs.map(s=>s.mid),songs.map(s=>s.mid).reverse());assert.equal(answer.playlistError,undefined);
});

test('playlist action never reports success or falls back to generated sound when no real queue exists',async()=>{
 const request={...body,intent:'playlist'};const noFetch=()=>{throw Error('must not call');};
 for(const result of [await companionChat(request,{},noFetch,undefined,{}),await companionChat({...request,chatModel:'local-heuristic'},env,noFetch,undefined,{}),await companionChat(request,env,noFetch)]){
  assert.equal(result.mode,'error');assert(result.playlistError);assert.equal(result.playlist,undefined);assert.equal(result.recommendedTrackId,undefined);
 }
 let calls=0;const result=await companionChat(request,env,async()=>{calls++;return upstream(JSON.stringify(reply));},undefined,{});
 assert.equal(calls,5);assert.equal(result.mode,'error');assert(result.playlistError);assert.equal(result.playlist,undefined);
 const empty=await companionChat(request,env,async()=>Response.json({choices:[{finish_reason:'tool_calls',message:{role:'assistant',tool_calls:[{id:'find',type:'function',function:{name:'daily_music',arguments:'{}'}}]}}]}),undefined,{daily:async()=>[]});
 assert.equal(empty.mode,'error');assert.equal(empty.playlist,undefined);
});

test('ordinary song requests must search and queue real music instead of accepting an unrelated answer',async()=>{
 let round=0;const songs=[{mid:'jay123',title:'晴天',artist:'周杰伦'}];
 const result=await companionChat({...body,musicSource:'qq-music',message:'给我推荐周杰伦的歌曲，不要现场版',agentPrompt:'优先符合当前明确要求，确认后温暖地回应。'},env,async(_url,options)=>{
  const data=JSON.parse(options.body);assert.match(data.messages[0].content,/优先符合当前明确要求/);
  if(round++===0)return upstream(JSON.stringify(reply));
  if(round===2){assert.match(data.messages.at(-1).content,/先调用/);return toolResult('search_music',{keyword:'周杰伦 晴天'});}
  return toolResult('queue_music',{title:'周杰伦的午后',mids:['jay123'],reply:'给你选了周杰伦的《晴天》，先听听这首。',scene:'rest'});
 },undefined,{search:async keyword=>{assert.match(keyword,/周杰伦/);return songs;}});
 assert.equal(round,3);assert.equal(result.intent,'playlist');assert.equal(result.playlist.songs[0].mid,'jay123');
 assert.match(result.reply,/晴天/);assert.equal(result.recommendedSceneId,'rest');assert.equal(result.recommendedTrackId,undefined);
});

test('contextual corrections are planned with current queue, history and custom prompt before music tools run',async()=>{
 let round=0;const songs=[{mid:'canto123',title:'轻快的粤语歌',artist:'歌手'}];
 const request={...body,musicSource:'qq-music',message:'换成粤语的，别太伤感',agentPrompt:'保持爵士风格，语气轻松一些。',history:[{role:'user',content:'想听爵士'}],currentQueue:[{title:'上一首爵士曲',artist:'上一位歌手'}]};
 const result=await companionChat(request,env,async(_url,options)=>{
  const data=JSON.parse(options.body);
  if(round++===0){assert.equal(data.tools,undefined);assert.match(data.messages[0].content,/保持爵士风格/);assert.match(data.messages.at(-1).content,/上一首爵士曲/);return upstream(JSON.stringify({intent:'music',request:'换成轻快粤语爵士，避免伤感',constraints:['粤语','爵士','不要伤感']}));}
  assert.match(data.messages[0].content,/粤语/);assert.match(data.messages[0].content,/不要伤感/);assert(data.tools);
  if(round===2)return toolResult('search_music',{keyword:'粤语 爵士 轻快'});
  return toolResult('queue_music',{title:'轻快粤语爵士',mids:['canto123']});
 },undefined,{search:async()=>songs});
 assert.equal(round,3);assert.equal(result.playlist.songs[0].mid,'canto123');
});

test('declining music remains a conversation, with no synthetic track or unintended queue or ambient changes',async()=>{
 let calls=0;
 const result=await companionChat({...body,musicSource:'qq-music',message:'今天不想听歌，只想聊聊'},env,async(_url,options)=>{
  const data=JSON.parse(options.body);calls++;assert.equal(data.tools,undefined);
  if(calls===1)return upstream(JSON.stringify({intent:'chat',request:'只想聊聊，不放音乐',constraints:['不要播放音乐']}));
  return upstream(JSON.stringify({...reply,reply:'我在，今天发生什么了？',recommendedTrackId:'midnight-code',ambientAdjustments:{rain:0.8}}));
 },undefined,{});
 assert.equal(calls,2);assert.equal(result.reply,'我在，今天发生什么了？');
 assert.equal(result.playlist,undefined);assert.equal(result.recommendedTrackId,undefined);assert.equal(result.ambientAdjustments,undefined);
});

test('QQ mode failures never describe a synthesized substitute as a completed music action',async()=>{
 const result=await companionChat({...body,musicSource:'qq-music',message:'你在吗'},env,async()=>upstream('invalid intent'),undefined,{});
 assert.equal(result.mode,'local');assert.equal(result.recommendedTrackId,undefined);assert.equal(result.ambientAdjustments,undefined);
 assert.match(result.reply,/播放队列没有改变/);
});

test('oversized search batches keep useful results, run bounded parallel queries and proceed to a queue',async()=>{
 let round=0,queries=0,inFlight=0,peak=0;
 const result=await companionChat({...body,intent:'playlist',message:'结合我的音乐偏好、当前时间、天气和工作状态，为我编排一张适合现在听的 QQ 音乐歌单。'},env,async(_url,options)=>{
  const data=JSON.parse(options.body);
  if(!round++)return Response.json({choices:[{finish_reason:'tool_calls',message:{role:'assistant',tool_calls:Array.from({length:6},(_,i)=>({id:'find'+i,type:'function',function:{name:'search_music',arguments:JSON.stringify({keyword:String(i)})}}))}}]});
  assert.equal(data.messages.filter(m=>m.role==='tool').length,6);
  assert.equal(data.messages.filter(m=>m.role==='tool').filter(m=>JSON.parse(m.content).error).length,2);
  assert.deepEqual(data.tools.map(t=>t.function.name),['queue_music']);assert.equal(data.tool_choice,'auto');
  return toolResult('queue_music',{title:'此刻的歌单',mids:['real0','real1','real2','real3']});
 },undefined,{search:async keyword=>{queries++;inFlight++;peak=Math.max(peak,inFlight);await new Promise(resolve=>setImmediate(resolve));inFlight--;return [{mid:'real'+keyword,title:'歌曲'+keyword,artist:'歌手'}];}});
 assert.equal(queries,4);assert.equal(peak,4);assert.equal(round,2);assert.equal(result.mode,'model');assert.equal(result.playlist.songs.length,4);
});

test('the final model round may still queue known songs and invalid IDs are repaired without blaming QQ authorization',async()=>{
 let round=0;
 const result=await companionChat({...body,intent:'playlist'},env,async(_url,options)=>{
  const data=JSON.parse(options.body);round++;
  if(round===1)return toolResult('search_music',{keyword:'轻柔钢琴'});
  if(round===2)return toolResult('queue_music',{title:'错误参数',mids:['invented']});
  if(round===3){const error=JSON.parse(data.messages.filter(m=>m.role==='tool').at(-1).content).error;assert.match(error,/real123/);assert(!error.includes('授权'));return upstream(JSON.stringify(reply));}
  if(round===4)return upstream(JSON.stringify(reply));
  assert.deepEqual(data.tools.map(t=>t.function.name),['queue_music']);assert.equal(data.tool_choice,'auto');
  return toolResult('queue_music',{title:'终于编好了',mids:['real123']});
 },undefined,{search:async()=>[{mid:'real123',title:'真实歌曲',artist:'歌手'}]});
 assert.equal(round,5);assert.equal(result.mode,'model');assert.equal(result.playlist.songs[0].mid,'real123');
});

test('model outages and QQ authorization failures have distinct actionable messages',async()=>{
 const request={...body,intent:'playlist'};
 const model=await companionChat(request,env,async()=>new Response(null,{status:401}),undefined,{});
 assert.match(model.playlistError,/陪伴模型认证失败/);assert(!model.playlistError.includes('QQ'));
 let round=0;const music=await companionChat({...request,message:'播放我喜欢的歌'},env,async()=>++round===1?toolResult('liked_music',{}):upstream(JSON.stringify(reply)),undefined,{liked:async()=>{throw Error('请先在 QQ 音乐面板扫码授权');}});
 assert.match(music.playlistError,/扫码授权/);assert(!music.playlistError.includes('陪伴模型认证'));
});

test('generic curation can search when personal recommendations are unavailable',async()=>{
 let round=0;
 const result=await companionChat({...body,intent:'playlist'},env,async(_url,options)=>{
  const data=JSON.parse(options.body);round++;
  if(round===1)return toolResult('daily_music',{});
  if(round===2){assert.deepEqual(data.tools.map(t=>t.function.name),['search_music','queue_music']);return toolResult('search_music',{keyword:'轻柔钢琴'});}
  return toolResult('queue_music',{title:'此刻轻柔',mids:['real123']});
 },undefined,{daily:async()=>{throw Error('请先扫码授权');},search:async()=>[{mid:'real123',title:'真实歌曲',artist:'歌手'}]});
 assert.equal(result.mode,'model');assert.equal(result.playlist.songs[0].mid,'real123');
});
