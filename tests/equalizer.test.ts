import test from 'node:test';
import assert from 'node:assert/strict';
import { SoundIsleAudioEngine } from '../src/utils/audioEngine';
import { normalizeEqualizer } from '../src/utils/equalizer';
import { qqTrack } from '../src/utils/music';
import { EMPTY_TRACK } from '../src/data/sceneThemes';

test('real music is routed through five EQ filters, stereo balance and headroom; bypass restores original response',async()=>{
 const oldWindow=globalThis.window,oldAudio=globalThis.Audio,oldFetch=globalThis.fetch,oldLocation=globalThis.location;
 const param=()=>({value:0,setTargetAtTime(value:number){this.value=value;}});
 const filters:any[]=[];const sources:any[]=[];let pan:any,headroom:any;
 const node=()=>({connections:[] as any[],connect(target:any){this.connections.push(target);},disconnect(){this.connections=[];}});
 class Context {
  currentTime=1;state='running';destination=node();
  createBiquadFilter(){const f={...node(),frequency:param(),Q:param(),gain:param(),type:''};filters.push(f);return f;}
  createStereoPanner(){pan={...node(),pan:param()};return pan;}
  createGain(){headroom={...node(),gain:param()};return headroom;}
  createAnalyser(){return {...node(),fftSize:0,smoothingTimeConstant:0,getByteFrequencyData(){}};}
  createMediaElementSource(audio:any){const source={...node(),audio};sources.push(source);return source;}
  createOscillator(){throw Error('Music synthesis must be removed');}
  createBufferSource(){throw Error('Ambient generation must be removed');}
 }
 Object.assign(globalThis,{window:{AudioContext:Context,dispatchEvent(){}},location:new URL('https://app.test')});
 globalThis.Audio=class {volume=1;currentTime=0;constructor(public src:string){}play=async()=>{};pause(){}removeAttribute(){}load(){}} as any;
 globalThis.fetch=async()=>Response.json({data:{playUrl:{real123:{url:'/api/music/stream/'+'a'.repeat(48)}}}});
 const engine=new SoundIsleAudioEngine();
 try {
  engine.setEqualizer({enabled:true,gains:[6,3,0,-2,1],balance:-0.4});
  const song=qqTrack({mid:'real123',title:'真实歌曲',artist:'歌手',album:'专辑',duration:180,coverUrl:''},'focus');
  engine.playTrack(song);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(sources.length,1);assert.equal(sources[0].connections[0],filters[0]);
  assert.deepEqual(filters.map(f=>f.frequency.value),[60,250,1000,4000,12000]);assert.deepEqual(filters.map(f=>f.gain.value),[6,3,0,-2,1]);
  assert.equal(filters[4].connections[0],pan);assert.equal(pan.pan.value,-0.4);assert(headroom.gain.value<1);
  engine.setEqualizer({enabled:false,gains:[6,3,0,-2,1],balance:-0.4});assert.deepEqual(filters.map(f=>f.gain.value),[0,0,0,0,0]);assert.equal(pan.pan.value,0);assert.equal(headroom.gain.value,1);
  engine.playTrack(song);await new Promise(resolve=>setImmediate(resolve));assert.equal(sources[0].connections.length,0);assert.equal(sources[1].connections[0],filters[0]);
  engine.playTrack(EMPTY_TRACK);assert.equal(engine.getIsPlaying(),false);
 }finally{engine.pause();Object.assign(globalThis,{window:oldWindow,Audio:oldAudio,fetch:oldFetch,location:oldLocation});}
});

test('stored EQ settings reject nonfinite input and clamp excessive gains and pan',()=>{
 assert.deepEqual(normalizeEqualizer({gains:[NaN,100,-100,Infinity],balance:-4}),{enabled:true,gains:[0,12,-12,0,0],balance:-1});
});
