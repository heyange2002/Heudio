import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {TrackCover} from '../src/components/TrackCover';
import {TopBar} from '../src/components/TopBar';
import {workspaceView,type AppSection} from '../src/utils/navigation';
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
