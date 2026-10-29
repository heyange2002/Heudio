const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const disk=new Map(),calls=[];let answer={data:{items:[]}};
const sandbox={window:{HEUDIO_CONFIG:{apiBase:'/api/v1'}},URL,URLSearchParams,AbortSignal,location:{href:'https://heudio.example/',protocol:'https:'},localStorage:{getItem:k=>disk.get(k),setItem:(k,v)=>disk.set(k,v)},fetch:async(url,opts)=>{calls.push({url,opts});return {ok:true,status:200,json:async()=>answer}}};
vm.createContext(sandbox);
for(const name of ['api.js','providers.js']){vm.runInContext(fs.readFileSync(path.join(__dirname,'../frontend/public',name),'utf8'),sandbox);Object.assign(sandbox,sandbox.window)}
const api=sandbox.window.MusicSources;
(async()=>{
const rows=api.parseLyrics('[00:01.50][00:05]第一行\n[00:08.25]第二行');assert.equal(rows.length,3);assert.equal(api.atTime(rows,0),-1);assert.equal(api.atTime(rows,5),1);
const yrc=api.parseLyrics('[1000,2000](1000,600,0)晚(1600,1400,0)风','yrc');assert.equal(yrc[0].text,'晚风');assert.equal(yrc[0].words[1].end,3);
assert.throws(()=>api.configure('qq','http://untrusted.example/api/v1'));assert.throws(()=>api.configure('qq','https://user:password@example.com'));assert.equal(api.secureUrl('javascript:alert(1)'),'');
answer={data:{items:[{id:'qq-fixture',provider:'qq',mediaId:'fixture'}]}};const tracks=await api.search('qq','test & 中文');assert.equal(tracks.length,1);assert.equal(new URL(calls.at(-1).url).searchParams.get('q'),'test & 中文');assert.equal(calls.at(-1).opts.credentials,'include');assert.equal(calls.at(-1).opts.headers['X-Heudio-Client'],'web');
answer={data:{streamPath:'/music/stream/fixture?quality=128',preview:true}};const audio=await api.getAudio(tracks[0]);assert.equal(audio.preview,true);assert.equal(audio.url,'https://heudio.example/api/v1/music/stream/fixture?quality=128');
answer={data:{format:'lrc',text:'[00:01]词',translation:'[00:01]译'}};assert.match((await api.getLyrics(tracks[0])).translation,/译/);
answer={data:{loggedIn:true,code:803}};await api.qrCheck('qq','key');assert(!JSON.stringify([...disk]).includes('token'));assert(!calls.some(c=>'X-QQ-Session'in c.opts.headers));
answer={data:{loggedIn:false}};await api.logout('qq');assert.equal(calls.at(-1).opts.method,'DELETE');assert(calls.every(c=>new URL(c.url).origin==='https://heudio.example'));
console.log('PASS: lyric timing, backend-only requests, encoded queries, cookies, stream URLs, previews and logout.');
})().catch(e=>{console.error(e);process.exitCode=1});
