import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {TrackCover} from '../src/components/TrackCover';
import {TopBar} from '../src/components/TopBar';
import {AgentCompanion} from '../src/components/AgentCompanion';
import {ProviderSettingsModal} from '../src/components/ProviderSettingsModal';
import {MusicQueue} from '../src/components/MusicQueue';
import {LyricsView} from '../src/components/LyricsView';
import {LyricsModal} from '../src/components/LyricsModal';
import AccessGate from '../src/AccessGate';
import type {ServiceSettings} from '../src/types/music';
import {DEFAULT_SPEECH} from '../shared/speech.mjs';
function dom(){
 const page=new JSDOM('<div id="root"></div>',{url:'https://soundisle.example'});
 Object.assign(globalThis,{window:page.window,document:page.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 return {page,root:createRoot(document.getElementById('root')!)};
}
test('the access screen asks for a masked four-digit numeric code and blocks incomplete submissions',async()=>{
 const {page,root}=dom(),oldFetch=globalThis.fetch;let posts=0;
 Object.defineProperty(globalThis,'location',{value:page.window.location,configurable:true});
 globalThis.fetch=async(_url,options)=>{if(options?.method==='POST')posts++;return Response.json({authenticated:false});};
 try{
  await act(async()=>root.render(<AccessGate><p>已解锁的内容</p></AccessGate>));
  const input=document.querySelector('input')!;
  assert.equal(input.type,'password');assert.equal(input.inputMode,'numeric');assert.equal(input.maxLength,4);assert.equal(input.minLength,4);assert.equal(input.pattern,'[0-9]{4}');
  assert(!document.body.textContent?.includes('已解锁的内容'));
  assert(document.querySelector<HTMLButtonElement>('button')!.disabled);
  await act(()=>document.querySelector('form')!.dispatchEvent(new page.window.Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(posts,0);assert.match(document.querySelector('[role="alert"]')!.textContent!,/4位数字/);
 }finally{await act(()=>root.unmount());page.window.close();globalThis.fetch=oldFetch;}
});
test('empty and failed covers use local artwork, consistent across player and visualizer',async()=>{
 const {page,root}=dom();
 await act(()=>root.render(<><TrackCover trackId="song" src="https://broken.example/a.jpg" alt="visualizer"/><TrackCover trackId="song" alt="player"/></>));
 const [visualizer,player]=document.querySelectorAll('img');assert.match(player.getAttribute('src')!,/^(?:\.\/|\/)?assets\//);
 await act(()=>visualizer.dispatchEvent(new page.window.Event('error')));
 assert.equal(visualizer.getAttribute('src'),player.getAttribute('src'));
 const fallback=visualizer.getAttribute('src');await act(()=>root.render(<><TrackCover trackId="song" src="https://broken.example/a.jpg" alt="visualizer"/><TrackCover trackId="song" alt="player"/></>));assert.equal(document.querySelector('img')!.getAttribute('src'),fallback);
 await act(()=>root.render(<TrackCover trackId="song" src="https://album.example/new.jpg" alt="album"/>));assert.equal(document.querySelector('img')!.getAttribute('src'),'https://album.example/new.jpg');
 await act(()=>root.unmount());page.window.close();
});
test('settings sits beside music mode and the old navigation is removed',async()=>{
 const {page,root}=dom();let settings=0,toggles=0,homes=0;
 await act(()=>root.render(<TopBar onHome={()=>homes++} pureMusicMode={false} onTogglePureMusic={()=>toggles++} onOpenSettings={()=>settings++}/>));
 assert.equal(document.querySelector('nav'),null);
 const actions=document.querySelector('[aria-label="播放模式与设置"]')!;
 const buttons=actions.querySelectorAll('button');assert.match(buttons[0].textContent!,/只听音乐/);assert.equal(buttons[1].textContent,'设置');
 await act(()=>buttons[0].dispatchEvent(new page.window.MouseEvent('click',{bubbles:true})));
 await act(()=>buttons[1].dispatchEvent(new page.window.MouseEvent('click',{bubbles:true})));
 assert.equal(toggles,1);assert.equal(settings,1);
 assert(!document.body.textContent?.includes('自然音混音'));
 await act(()=>root.unmount());page.window.close();
});

test('speech controls expose cancel, play and silence states; provider settings change real speech options', async()=>{
 const {page,root}=dom(); const originalFetch=globalThis.fetch;
 Object.defineProperty(globalThis,'location',{value:page.window.location,configurable:true});
 globalThis.fetch=async()=>Response.json({configured:false});
 const spoken:string[]=[];
 const props={messages:[{id:'reply',role:'agent' as const,content:'陪你放松片刻。',timestamp:'刚刚',rationale:'隐藏的编排理由',quickActions:['隐藏的推荐按钮']}],onSendMessage:()=>{},isLoading:false,onApplyScene:()=>{},currentScene:'rest' as const,weatherText:'',timeContextText:'',onSpeakMessage:(text:string)=>spoken.push(text)};
 try{
  await act(()=>root.render(<AgentCompanion {...props} speechState={{status:'loading',text:props.messages[0].content}}/>));
  assert(document.body.textContent?.includes('陪你放松片刻。'));
  for(const removed of ['编排思路','隐藏的编排理由','隐藏的推荐按钮','纠正推荐','换成纯钢琴独奏'])assert(!document.body.textContent?.includes(removed));
  const cancel=document.querySelector('button[aria-label="取消语音生成"]')!;assert(cancel);
  await act(()=>cancel.dispatchEvent(new page.window.MouseEvent('click',{bubbles:true}))); assert.equal(spoken.length,1);
  await act(()=>root.render(<AgentCompanion {...props} speechState={{status:'ready',text:props.messages[0].content,error:'语音已准备好'}}/>));assert(document.querySelector('button[aria-label="播放语音"]'));
  await act(()=>root.render(<AgentCompanion {...props} onSpeakMessage={undefined}/>));assert(!document.querySelector('button[aria-label="语音朗读陪伴"]'));
  function Settings(){const [settings,setSettings]=useState<ServiceSettings>({musicSource:'qq-music',chatModel:'local-heuristic',voiceTts:'minimax',voiceModel:DEFAULT_SPEECH.model,voiceId:DEFAULT_SPEECH.voiceId,voiceSpeed:0.95,voiceAutoPlay:true,playbackMode:'sequential',motionEnabled:true,pureMusicMode:false,sleepTimerMinutes:null});return <><ProviderSettingsModal isOpen onClose={()=>{}} settings={settings} onUpdateSettings={next=>setSettings(prev=>({...prev,...next}))}/><output>{JSON.stringify(settings)}</output></>}
  await act(async()=>{root.render(<Settings/>)});
  assert(document.body.textContent?.includes('尚未配置语音服务'));
  assert(!document.body.textContent?.includes('声屿内建合成源'));
  assert(document.body.textContent?.includes('尚未配置陪伴模型'));
  const model=[...document.querySelectorAll('button')].find(button=>button.textContent?.includes('MiniMax M3'))!;
  await act(()=>model.dispatchEvent(new page.window.MouseEvent('click',{bubbles:true})));
  assert.equal(JSON.parse(document.querySelector('output')!.textContent!).chatModel,'MiniMax-M3');
  const voice=document.querySelector('select[aria-label="陪伴音色"]') as HTMLSelectElement;
  await act(()=>{voice.value='Chinese (Mandarin)_Gentleman';voice.dispatchEvent(new page.window.Event('change',{bubbles:true}));});
  assert.equal(JSON.parse(document.querySelector('output')!.textContent!).voiceId,'Chinese (Mandarin)_Gentleman');
  const silent=[...document.querySelectorAll('button')].find(button=>button.textContent?.includes('静音文字模式'))!;
  await act(()=>silent.dispatchEvent(new page.window.MouseEvent('click',{bubbles:true})));assert.equal(JSON.parse(document.querySelector('output')!.textContent!).voiceTts,'silent');
 }finally{await act(()=>root.unmount());page.window.close();globalThis.fetch=originalFetch;}
});

test('a long music queue renders one song per row with metadata and selected playback state',async()=>{
 const {page,root}=dom();const selected:string[]=[];
 const songs=Array.from({length:30},(_,i)=>({mid:'song'+i,title:'长歌名 '+i,artist:'歌手 '+i,album:'专辑',duration:180+i,coverUrl:''}));
 await act(()=>root.render(<MusicQueue songs={songs} title="QQ 音乐选集" currentMid="song2" isPlaying onPlay={s=>selected.push(s.mid)}/>));
 const list=document.querySelector('section[aria-label="播放队列"]')!;
 assert.equal(list.querySelectorAll('li').length,30);assert.equal(list.querySelectorAll('img').length,30);
 assert.equal(list.querySelector('button[aria-current="true"]')?.getAttribute('aria-label'),'播放 长歌名 2 · 歌手 2');
 const button=list.querySelectorAll('button')[10];await act(()=>button.dispatchEvent(new page.window.MouseEvent('click',{bubbles:true})));assert.deepEqual(selected,['song10']);
 await act(()=>root.unmount());page.window.close();
});

test('conversation follows the newest message, loading row and resized content inside its own scroll area',async()=>{
 const {page,root}=dom();const oldObserver=globalThis.ResizeObserver;let onResize:()=>void=()=>{};let disconnected=false;
 globalThis.ResizeObserver=class {constructor(callback:()=>void){onResize=callback;}observe(){}disconnect(){disconnected=true;}} as any;
 let height=1000;
 Object.defineProperty(page.window.HTMLElement.prototype,'scrollHeight',{get(){return this.getAttribute('role')==='log'?height:0;}});
 const props={messages:[{id:'first',role:'agent' as const,content:'第一条消息',timestamp:'刚刚'}],onSendMessage:()=>{},isLoading:false,onApplyScene:()=>{},currentScene:'rest' as const,weatherText:'',timeContextText:''};
 try{
  await act(()=>root.render(<AgentCompanion {...props}/>));
  const log=document.querySelector('[role="log"]')!;
  assert.equal(log.scrollTop,1000);
  log.scrollTop=0;height=1500;
  await act(()=>root.render(<AgentCompanion {...props} messages={[...props.messages,{id:'last',role:'agent',content:'最后一条消息',timestamp:'现在'}]}/>));
  assert.equal(log.scrollTop,1500);assert(log.textContent?.includes('最后一条消息'));
  log.scrollTop=0;height=1600;
  await act(()=>root.render(<AgentCompanion {...props} isLoading/>));assert.equal(log.scrollTop,1600);
  log.scrollTop=0;height=1700;onResize();assert.equal(log.scrollTop,1700);
 }finally{await act(()=>root.unmount());page.window.close();globalThis.ResizeObserver=oldObserver;}
 assert(disconnected);
});

test('lyrics preview keeps four nearby lines; the full modal supports seeking, keyboard close and focus restoration',async()=>{
 const {page,root}=dom();page.window.matchMedia=()=>({matches:true}) as any;
 page.window.HTMLElement.prototype.scrollTo=()=>{};
 const lyrics=Array.from({length:12},(_,i)=>({timeSec:i*10,text:'歌词 '+i,translation:'Translation '+i}));
 const seek:number[]=[];
 function Harness({time}:{time:number}){const [open,setOpen]=useState(false);return <><LyricsView lyrics={lyrics} currentTime={time} onSeek={s=>seek.push(s)} accentColor="#ffcc00" onExpand={()=>setOpen(true)}/><LyricsModal isOpen={open} onClose={()=>setOpen(false)} title="正在播放的歌曲" artist="歌手" lyrics={lyrics} currentTime={time} onSeek={s=>seek.push(s)} accentColor="#ffcc00"/></>}
 try{
  await act(()=>root.render(<Harness time={55}/>));
  const preview=document.querySelector('section[aria-label="歌词预览"]')!;
  assert.equal(preview.querySelectorAll('button[aria-label^="跳转到"]').length,4);
  assert.match(preview.textContent!,/歌词 4/);assert.match(preview.textContent!,/歌词 7/);
  assert.equal(preview.querySelector('[aria-current="true"]')?.getAttribute('aria-label'),'跳转到 00:50 歌词 5');
  assert(!preview.textContent?.includes('Translation'));
  await act(()=>root.render(<Harness time={115}/>));
  assert.equal(preview.querySelectorAll('button[aria-label^="跳转到"]').length,4);
  assert.equal(preview.querySelector('[aria-current="true"]')?.getAttribute('aria-label'),'跳转到 01:50 歌词 11');
  const expand=preview.querySelector<HTMLButtonElement>('button[aria-label="放大歌词"]')!;expand.focus();
  await act(()=>expand.dispatchEvent(new page.window.MouseEvent('click',{bubbles:true})));
  const dialog=document.querySelector('[role="dialog"]')!;
  assert.equal(dialog.getAttribute('aria-modal'),'true');assert.match(dialog.textContent!,/正在播放的歌曲/);
  const lines=dialog.querySelectorAll<HTMLButtonElement>('button[aria-label^="跳转到"]');assert.equal(lines.length,12);
  await act(()=>lines[8].dispatchEvent(new page.window.MouseEvent('click',{bubbles:true})));assert.deepEqual(seek,[80]);
  assert.equal(document.body.style.overflow,'hidden');
  await act(()=>page.window.dispatchEvent(new page.window.KeyboardEvent('keydown',{key:'Escape'})));
  assert.equal(document.querySelector('[role="dialog"]'),null);assert.equal(document.activeElement,expand);assert.equal(document.body.style.overflow,'');
 }finally{await act(()=>root.unmount());page.window.close();}
});
