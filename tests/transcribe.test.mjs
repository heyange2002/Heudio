import test from 'node:test';
import assert from 'node:assert/strict';
import { transcribeSpeech } from '../cloudflare/transcribe.mjs';
import { encodeWav, MAX_VOICE_BYTES } from '../shared/wav.mjs';
const wav=()=>new Uint8Array(encodeWav(new Float32Array(1600)));
const request=(bytes=wav(),headers={})=>new Request('https://app.test/api/voice/transcribe',{method:'POST',headers:{'Content-Type':'audio/wav',...headers},body:bytes});
const env={MINIMAX_API_KEY:'test-only-server-key'};
test('ASR receives server credentials and a real WAV multipart file; only transcript returns',async()=>{
 const result=await transcribeSpeech(request(),env,async(url,options)=>{
  assert.equal(url,'https://api.minimax.cn/v1/speech_to_text');assert.equal(options.redirect,'manual');assert.equal(options.headers.Authorization,'Bearer test-only-server-key');
  assert.equal(options.body.get('model'),'asr-1.0');assert.equal(options.body.get('response_format'),'json');assert.equal(options.body.get('file').type,'audio/wav');
  return Response.json({text:'想听点轻松的音乐',trace_id:'private-upstream-id',duration:1});
 });assert.equal(result.status,200);assert.deepEqual(await result.json(),{text:'想听点轻松的音乐'});
});
test('ASR validates configuration, content, size, silence, redirects and errors',async()=>{
 const noCall=()=>{throw Error('must not call');};
 assert.equal((await transcribeSpeech(request(),{},noCall)).status,503);
 assert.equal((await transcribeSpeech(request(new Uint8Array(20)),env,noCall)).status,400);
 assert.equal((await transcribeSpeech(request(wav(),{'Content-Length':String(MAX_VOICE_BYTES+1)}),env,noCall)).status,413);
 assert.equal((await transcribeSpeech(request(wav(),{'Content-Type':'audio/webm'}),env,noCall)).status,415);
 assert.equal((await transcribeSpeech(request(),env,async()=>Response.json({text:' '}))).status,422);
 const redirected=await transcribeSpeech(request(),env,async()=>new Response(null,{status:302}));assert.equal(redirected.status,502);assert(!(await redirected.text()).includes('test-only-server-key'));
});
test('Workers authenticates voice upload before parsing or sending audio upstream',async()=>{
 const {default:worker}=await import('../cloudflare/worker.mjs');
 const bindings={...env,AUTH:{idFromName:()=>'',get:()=>({fetch:async()=>Response.json({authenticated:false})})}};
 const req=()=>new Request('https://app.test/api/voice/transcribe',{method:'POST',headers:{'X-Soundisle-Client':'web','Content-Type':'audio/wav'},body:new Uint8Array(20)});
 assert.equal((await worker.fetch(req(),bindings)).status,401);
 bindings.AUTH.get=()=>({fetch:async()=>Response.json({authenticated:true})});assert.equal((await worker.fetch(req(),bindings)).status,400);
});
