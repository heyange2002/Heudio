import { MAX_VOICE_BYTES, validVoiceWav } from '../shared/wav.mjs';
const json = (data,status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function transcribeSpeech(request,env,fetchImpl=fetch) {
  if (request.headers.get('Content-Type')?.split(';')[0] !== 'audio/wav') return json({error:'请使用 WAV 语音录音'},415);
  if (!env.MINIMAX_API_KEY?.trim()) return json({error:'语音识别尚未配置，请在后端设置 MiniMax API Key'},503);
  if (Number(request.headers.get('Content-Length'))>MAX_VOICE_BYTES) return json({error:'每段语音最长60秒'},413);
  const reader=request.body?.getReader(), chunks=[]; let size=0;
  if(reader) while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_VOICE_BYTES){await reader.cancel();return json({error:'每段语音最长60秒'},413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  if(!validVoiceWav(bytes))return json({error:'录音格式无效或太短，请重新说一次'},400);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
  const abort=()=>controller.abort();request.signal.addEventListener('abort',abort,{once:true});if(request.signal.aborted)abort();
  try {
    const form=new FormData();form.set('model','asr-1.0');form.set('response_format','json');form.set('stream','false');form.set('file',new Blob([bytes],{type:'audio/wav'}),'voice.wav');
    const response=await fetchImpl('https://api.minimax.cn/v1/speech_to_text',{method:'POST',redirect:'manual',headers:{Authorization:`Bearer ${env.MINIMAX_API_KEY.trim()}`},body:form,signal:controller.signal});
    if(!response.ok)return json({error:response.status===429?'语音识别繁忙，请稍后再试':'语音识别失败，请检查后端密钥、额度与识别权限'},response.status===429?429:502);
    const data=await response.json();
    if(data.base_resp?.status_code || typeof data.text!=='string' || data.text.length>8000)throw Error();
    if(!data.text.trim())return json({error:'没有听清内容，请再说一次'},422);
    return json({text:data.text.trim()});
  }catch{return json({error:controller.signal.aborted?'语音识别已取消或超时':'暂时无法连接语音识别服务，请稍后重试'},controller.signal.aborted?504:502);}
  finally{clearTimeout(timer);request.signal.removeEventListener('abort',abort);}
}
