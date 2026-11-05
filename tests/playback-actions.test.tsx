import test from 'node:test';
import assert from 'node:assert/strict';
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import App from '../src/App';

async function player(mids:string[], mode='sequential', unavailable=new Set<string>()) {
 const page=new JSDOM('<div id="root"></div>',{url:'https://soundisle.test'});
 const oldFetch=globalThis.fetch,oldAudio=globalThis.Audio;
 Object.assign(globalThis,{window:page.window,document:page.window.document,location:page.window.location,localStorage:page.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true});
 page.window.matchMedia=()=>({matches:true}) as any;
 page.window.HTMLElement.prototype.scrollIntoView=()=>{};
 page.window.HTMLCanvasElement.prototype.getContext=()=>null;
 const songs=mids.map(mid=>({mid,title:'歌曲 '+mid,artist:'歌手',duration:180,album:'',coverUrl:''}));
 localStorage.setItem('soundisle:playback-mode',JSON.stringify(mode));
 localStorage.setItem('soundisle:playback-session',JSON.stringify({songs,queue:songs,currentMid:mids[0],position:37,title:'测试歌单'}));
 const requests:string[]=[],audios:any[]=[];
 let pending:((response:Response)=>void)|undefined,hold='';
 globalThis.Audio=class {
  paused=true;volume=1;currentTime=0;ontimeupdate=null;onended=null;onerror=null;
  constructor(public src:string){audios.push(this);}
  async play(){this.paused=false;} pause(){this.paused=true;} load(){} removeAttribute(){}
 } as any;
 globalThis.fetch=async(url)=>{
  const path=String(url);
  if(path.startsWith('/api/music/getMusicPlay/')){
   const mid=path.split('/').pop()!.split('?')[0];requests.push(mid);
   if(mid===hold)return new Promise(resolve=>{pending=resolve;});
   return Response.json({data:{playUrl:{[mid]:{url:unavailable.has(mid)?'':'/api/music/stream/'+'a'.repeat(48)}}}});
  }
  if(path.startsWith('/api/agent/memory'))return Response.json({shortTerm:[],longTerm:''});
  return Response.json({data:{},summary:''});
 };
 const root=createRoot(document.getElementById('root')!);
 const settle=async()=>act(async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));});
 await act(async()=>root.render(<App/>));
 const click=async(label:string)=>{await act(async()=>document.querySelector(`button[aria-label="${label}"]`)!.dispatchEvent(new page.window.MouseEvent('click',{bubbles:true})));await settle();};
 const saved=()=>JSON.parse(localStorage.getItem('soundisle:playback-session')!);
 return {requests,audios,unavailable,click,settle,saved,hold:(mid:string)=>{hold=mid;},release:(mid:string)=>pending?.(Response.json({data:{playUrl:{[mid]:{url:''}}}})),
  close:async()=>{await act(()=>root.unmount());page.window.close();globalThis.fetch=oldFetch;globalThis.Audio=oldAudio;}};
}

test('previous and next start playback from restored, paused and single-song states; empty queues stay idle',async()=>{
 for(const mode of ['sequential','shuffle','repeat-one']){
  const p=await player(['a','b','c'],mode);
  try{
   assert.equal(p.requests.length,0);
   await p.click('下一首');assert.equal(p.requests.length,1);assert(document.querySelector('[aria-label="暂停"]'));
   const next=p.saved().currentMid;
   await p.click('暂停');assert(p.audios.at(-1).paused);
   await p.click('上一首');assert.equal(p.requests.length,2);assert(document.querySelector('[aria-label="暂停"]'));assert.notEqual(p.saved().currentMid,next);
   assert.equal(p.saved().position,0);
  }finally{await p.close();}
 }
 for(const mids of [[],['single']]){
  const p=await player(mids);
  try{await p.click('下一首');await p.click(mids.length?'暂停':'上一首');if(mids.length)await p.click('上一首');assert.equal(p.requests.length,mids.length?2:0);assert(!document.body.textContent?.includes('没有可用的播放链接'));}finally{await p.close();}
 }
});

test('unavailable songs skip quietly in every playback mode, including consecutive failures and queue wraparound',async()=>{
 for(const mode of ['sequential','shuffle','repeat-one']){
  const p=await player(['a','b','c'],mode,new Set(['a','b']));
  try{
   await p.click('播放');assert.equal(p.saved().currentMid,'c');assert.equal(p.audios.length,1);assert.equal(p.audios[0].paused,false);
   assert.equal(new Set(p.requests).size,p.requests.length);assert(p.requests.length<=3);
   assert(!document.body.textContent?.includes('没有可用的播放链接'));assert.equal(document.querySelector('[role="alert"]'),null);
   if(mode==='sequential'){
    await p.click('下一首');assert.equal(p.saved().currentMid,'c');assert.equal(p.requests.length,6);
   }
  }finally{await p.close();}
 }
});

test('an entirely unavailable playlist or single song stops without an error or endless retries, and can be retried manually',async()=>{
 for(const mids of [['a'],['a','b','c']]){
  const p=await player(mids,'repeat-one',new Set(mids));
  try{
   await p.click('播放');assert.equal(p.requests.length,mids.length);assert(document.querySelector('[aria-label="播放"]'));
   await p.settle();assert.equal(p.requests.length,mids.length);assert.equal(document.querySelector('[role="alert"]'),null);
   p.unavailable.clear();await p.click('播放');assert.equal(p.audios.length,1);assert.equal(p.audios[0].paused,false);
  }finally{await p.close();}
 }
});

test('pause and queue clear cancel a pending unavailable response instead of starting a later song',async()=>{
 for(const action of ['pause','clear']){
  const p=await player(['a','b']);
  try{
   p.hold('a');await p.click('播放');
   if(action==='pause')await p.click('暂停');
   else await p.click('清空播放列表');
   p.release('a');await p.settle();assert.deepEqual(p.requests,['a']);assert.equal(p.audios.length,0);assert(document.querySelector('[aria-label="播放"]'));
   if(action==='clear')assert.equal(p.saved().queue.length,0);
  }finally{await p.close();}
 }
});
