import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {TrackCover} from '../src/components/TrackCover';
import {TopBar} from '../src/components/TopBar';
import {workspaceView,type AppSection} from '../src/utils/navigation';
import {AgentCompanion} from '../src/components/AgentCompanion';
import {ProviderSettingsModal} from '../src/components/ProviderSettingsModal';
import type {ServiceSettings} from '../src/types/music';
import {DEFAULT_SPEECH} from '../shared/speech.mjs';
function dom(){
 const page=new JSDOM('<div id="root"></div>',{url:'https://soundisle.example'});
 Object.assign(globalThis,{window:page.window,document:page.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 return {page,root:createRoot(document.getElementById('root')!)};
}
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
test('all three menu buttons select corresponding views and expose selected state',async()=>{
 const {page,root}=dom();
 function Harness(){const [section,setSection]=useState<AppSection>('home');return <><TopBar activeSection={section} onSelectSection={s=>setSection(s as AppSection)} pureMusicMode={false} onTogglePureMusic={()=>{}} onOpenSettings={()=>{}} onOpenMixer={()=>{}} currentSceneName="专注"/><div id="view">{workspaceView(section,false)}</div></>}
 await act(()=>root.render(<Harness/>));
 for(const [label,view]of [['声音律动','visualizer'],['沉浸歌词','lyrics'],['心境感知','companion']]){
  const button=[...document.querySelectorAll('nav[aria-label="主要功能"] button')].find(b=>b.textContent?.trim()===label)!;
  await act(()=>button.dispatchEvent(new page.window.MouseEvent('click',{bubbles:true})));
  assert.equal(document.getElementById('view')!.textContent,view);assert.equal(button.getAttribute('aria-current'),'page');
 }
 assert.equal(workspaceView('lyrics',true),'music');
 await act(()=>root.unmount());page.window.close();
});

test('speech controls expose cancel, play and silence states; provider settings change real speech options', async()=>{
 const {page,root}=dom(); const originalFetch=globalThis.fetch;
 Object.defineProperty(globalThis,'location',{value:page.window.location,configurable:true});
 globalThis.fetch=async()=>Response.json({configured:false});
 const spoken:string[]=[];
 const props={messages:[{id:'reply',role:'agent' as const,content:'陪你放松片刻。',timestamp:'刚刚'}],onSendMessage:()=>{},isLoading:false,onApplyScene:()=>{},currentScene:'rest' as const,weatherText:'',timeContextText:'',onSpeakMessage:(text:string)=>spoken.push(text)};
 try{
  await act(()=>root.render(<AgentCompanion {...props} speechState={{status:'loading',text:props.messages[0].content}}/>));
  const cancel=document.querySelector('button[aria-label="取消语音生成"]')!;assert(cancel);
  await act(()=>cancel.dispatchEvent(new page.window.MouseEvent('click',{bubbles:true}))); assert.equal(spoken.length,1);
  await act(()=>root.render(<AgentCompanion {...props} speechState={{status:'ready',text:props.messages[0].content,error:'语音已准备好'}}/>));assert(document.querySelector('button[aria-label="播放语音"]'));
  await act(()=>root.render(<AgentCompanion {...props} onSpeakMessage={undefined}/>));assert(!document.querySelector('button[aria-label="语音朗读陪伴"]'));
  function Settings(){const [settings,setSettings]=useState<ServiceSettings>({musicSource:'soundisle-builtin',chatModel:'local-heuristic',voiceTts:'minimax',voiceModel:DEFAULT_SPEECH.model,voiceId:DEFAULT_SPEECH.voiceId,voiceSpeed:0.95,voiceAutoPlay:true,autoAdvance:true,motionEnabled:true,pureMusicMode:false,sleepTimerMinutes:null});return <><ProviderSettingsModal isOpen onClose={()=>{}} settings={settings} onUpdateSettings={next=>setSettings(prev=>({...prev,...next}))}/><output>{JSON.stringify(settings)}</output></>}
  await act(async()=>{root.render(<Settings/>)});
  assert(document.body.textContent?.includes('尚未配置语音服务'));
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
