import { apiFetch } from '../api';
import { encodeWav, MAX_VOICE_SECONDS, VOICE_SAMPLE_RATE } from '../../shared/wav.mjs';
export type VoiceInputState = { status: 'idle' | 'requesting' | 'recording' | 'processing' | 'error'; error?: string };
export async function recordingToWav(blob: Blob): Promise<Blob> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    if (decoded.duration < 0.1 || decoded.duration > MAX_VOICE_SECONDS + 1) throw Error('每段语音请控制在60秒以内');
    const offline = new OfflineAudioContext(1,Math.min(MAX_VOICE_SECONDS*VOICE_SAMPLE_RATE,Math.ceil(decoded.duration*VOICE_SAMPLE_RATE)),VOICE_SAMPLE_RATE);
    const source = offline.createBufferSource(); source.buffer=decoded;source.connect(offline.destination);source.start();
    const audio = await offline.startRendering();return new Blob([encodeWav(audio.getChannelData(0))],{type:'audio/wav'});
  } finally { await context.close(); }
}
export class VoiceInput {
  state: VoiceInputState = {status:'idle'};
  private recorder?: MediaRecorder;
  private stream?: MediaStream;
  private timer?: ReturnType<typeof setTimeout>;
  private controller?: AbortController;
  private generation = 0;
  constructor(private onChange: (state: VoiceInputState)=>void,private onText:(text:string)=>void,private deps={
    getMedia:()=>navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}}),
    createRecorder:(stream:MediaStream)=>new MediaRecorder(stream),
    toWav:recordingToWav,request:apiFetch,
  }){}
  private update(state:VoiceInputState){this.state=state;this.onChange(state);}
  private release(){clearTimeout(this.timer);this.timer=undefined;this.stream?.getTracks().forEach(track=>track.stop());this.stream=undefined;}
  async start(){
    this.cancel(false);const generation=this.generation;this.update({status:'requesting'});
    try{
      const stream=await this.deps.getMedia();
      if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}
      this.stream=stream;const recorder=this.deps.createRecorder(stream);this.recorder=recorder;const chunks:Blob[]=[];
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      recorder.onerror=()=>{if(generation===this.generation){this.cancel(false);this.update({status:'error',error:'录音失败，请重新尝试'});}};
      recorder.onstop=()=>{this.release();this.recorder=undefined;recorder.ondataavailable=null;recorder.onstop=null;recorder.onerror=null;if(generation===this.generation)void this.finish(new Blob(chunks,{type:recorder.mimeType}),generation);};
      recorder.start();this.update({status:'recording'});this.timer=setTimeout(()=>this.stop(),MAX_VOICE_SECONDS*1000);
    }catch(error){
      if(generation!==this.generation)return;this.release();
      this.update({status:'error',error:error instanceof Error&&['NotAllowedError','SecurityError'].includes(error.name)?'麦克风未获授权，请在浏览器中允许麦克风后重试':error instanceof Error&&error.name==='NotFoundError'?'未找到可用麦克风':'当前浏览器无法录音，请使用支持麦克风的浏览器'});
    }
  }
  stop(){if(this.recorder?.state==='recording'){this.update({status:'processing'});this.recorder.stop();this.release();}}
  cancel(notify=true){this.generation++;this.controller?.abort();this.controller=undefined;clearTimeout(this.timer);if(this.recorder){this.recorder.onstop=null;this.recorder.ondataavailable=null;this.recorder.onerror=null;if(this.recorder.state==='recording')this.recorder.stop();this.recorder=undefined;}this.release();if(notify)this.update({status:'idle'});}
  private async finish(blob:Blob,generation:number){
    this.update({status:'processing'});const controller=new AbortController();this.controller=controller;
    try{
      const wav=await this.deps.toWav(blob);if(generation!==this.generation)return;
      const response=await this.deps.request('/api/voice/transcribe',{method:'POST',signal:controller.signal,headers:{'Content-Type':'audio/wav'},body:wav});
      const data=await response.json();if(generation!==this.generation)return;
      if(!response.ok||typeof data.text!=='string'||!data.text.trim())throw Error(data.error||'没有听清，请再说一次');
      this.update({status:'idle'});this.onText(data.text.trim());
    }catch(error){if(generation===this.generation)this.update({status:'error',error:error instanceof Error?error.message:'语音识别失败，请重试'});}
  }
}
