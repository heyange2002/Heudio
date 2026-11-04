export const MAX_VOICE_SECONDS = 60;
export const VOICE_SAMPLE_RATE = 16000;
export const MAX_VOICE_BYTES = 44 + VOICE_SAMPLE_RATE * 2 * MAX_VOICE_SECONDS;
export function encodeWav(samples) {
  const buffer = new ArrayBuffer(44 + samples.length * 2), view = new DataView(buffer);
  const text = (offset, value) => [...value].forEach((char,i) => view.setUint8(offset+i,char.charCodeAt(0)));
  text(0,'RIFF'); view.setUint32(4, buffer.byteLength-8,true); text(8,'WAVE'); text(12,'fmt ');
  view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,1,true); view.setUint32(24,VOICE_SAMPLE_RATE,true);
  view.setUint32(28,VOICE_SAMPLE_RATE*2,true); view.setUint16(32,2,true); view.setUint16(34,16,true); text(36,'data'); view.setUint32(40,samples.length*2,true);
  samples.forEach((sample,i) => view.setInt16(44+i*2, Math.round(Math.max(-1,Math.min(1,sample))*(sample<0?32768:32767)),true));
  return buffer;
}
export function validVoiceWav(bytes) {
  if (bytes.byteLength < 44 + 3200 || bytes.byteLength > MAX_VOICE_BYTES || bytes.byteLength % 2) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), text = offset => String.fromCharCode(...bytes.slice(offset,offset+4));
  return text(0)==='RIFF'&&text(8)==='WAVE'&&text(12)==='fmt '&&text(36)==='data'&&view.getUint16(20,true)===1&&view.getUint16(22,true)===1&&view.getUint32(24,true)===VOICE_SAMPLE_RATE&&view.getUint16(34,true)===16&&view.getUint32(40,true)===bytes.byteLength-44;
}
