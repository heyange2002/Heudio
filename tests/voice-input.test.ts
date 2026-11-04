import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceInput } from '../src/utils/voiceInput';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness(request=async(_path:string,_options:RequestInit={})=>Response.json({text:'我想听点轻音乐'})){
 const states:any[]=[],texts:string[]=[];let stopped=0;
 const stream={getTracks:()=>[{stop:()=>stopped++}]} as unknown as MediaStream;
 let recorder:any;
 const input=new VoiceInput(state=>states.push(state),text=>texts.push(text),{
  getMedia:async()=>stream,
  createRecorder:()=>{recorder={state:'inactive',mimeType:'audio/webm',ondataavailable:null,onstop:null,onerror:null,start(){this.state='recording';},stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['test-audio'])});this.onstop?.();}};return recorder;},
  toWav:async()=>new Blob(['wav'],{type:'audio/wav'}),request,
 });
 return {input,states,texts,stopped:()=>stopped};
}
test('voice conversation records, releases microphone, transcribes, and forwards text exactly once',async()=>{
 let calls=0;const h=harness(async(path,options={})=>{calls++;assert.equal(path,'/api/voice/transcribe');assert.equal((options.headers as any)['Content-Type'],'audio/wav');return Response.json({text:'我想听点轻音乐'});});
 await h.input.start();assert.equal(h.input.state.status,'recording');h.input.stop();await tick();
 assert.equal(h.input.state.status,'idle');assert.deepEqual(h.texts,['我想听点轻音乐']);assert.equal(calls,1);assert(h.stopped()>0);h.input.cancel();
});
test('cancelled voice input never sends delayed recognition results',async()=>{
 let complete!:(r:Response)=>void;let signal:AbortSignal;
 const h=harness(async(_path,options={})=>{signal=options.signal!;return new Promise(resolve=>{complete=resolve;});});
 await h.input.start();h.input.stop();await tick();h.input.cancel();assert(signal!.aborted);complete(Response.json({text:'旧的录音'}));await tick();assert.equal(h.texts.length,0);assert.equal(h.input.state.status,'idle');
});
test('cancel during a microphone permission request stops any late stream',async()=>{
 let grant!:(s:MediaStream)=>void,stopped=0;
 const input=new VoiceInput(()=>{},()=>assert.fail('must not send'),{getMedia:()=>new Promise(resolve=>{grant=resolve;}),createRecorder:()=>{throw Error('must not record');},toWav:async()=>new Blob(),request:async()=>Response.json({})});
 const pending=input.start();input.cancel();grant({getTracks:()=>[{stop:()=>stopped++}]} as any);await pending;assert.equal(stopped,1);
});
