/* Heudio client: QQ Music is accessed only through the application backend. */
(function(global){
'use strict';
const names={qq:'QQ 音乐'};
const check=p=>{if(p!=='qq')throw Error('此版本使用 QQ 音乐后端；旧来源请重新从 QQ 曲库添加')};
const request=(path,options)=>HeudioAPI.request(path,options);
function secureUrl(raw){if(typeof raw!=='string'||!raw)return '';try{const u=new URL(raw,location.href);return ['http:','https:','blob:'].includes(u.protocol)?u.href:''}catch{return ''}}
async function search(p,q){check(p);return (await request('/music/search?q='+encodeURIComponent(q))).items}
async function getAudio(t,quality='standard'){if(!t.provider)return {url:t.url};check(t.provider);const q=({standard:'128',higher:'320',lossless:'flac'})[quality]||'best';const d=await request('/music/tracks/'+encodeURIComponent(t.mediaId)+'/playback?quality='+q);return {url:HeudioAPI.url(d.streamPath),preview:d.preview}}
async function getLyrics(t){if(!t.provider)return {text:''};check(t.provider);return request('/music/tracks/'+encodeURIComponent(t.mediaId)+'/lyrics')}
async function playlist(p,id){check(p);return (await request('/music/playlists/'+encodeURIComponent(id))).items}
async function test(p){check(p);const d=await request('/music/status');return d.loggedIn?'已登录 · '+d.profile.nickname:'后端已连接 · 未登录'}
async function qrStart(p,channel='qq'){check(p);return request('/auth/qr',{method:'POST',body:{channel}})}
async function qrCheck(p,key){check(p);return request('/auth/qr/'+encodeURIComponent(key))}
async function qrCancel(key){return request('/auth/qr/'+encodeURIComponent(key),{method:'DELETE'})}
async function logout(p){check(p);return request('/auth/session',{method:'DELETE'})}
function parseLyrics(text,format='lrc'){let offset=0;const m=text.match(/\[offset:([+-]?\d+)\]/i);if(m)offset=Number(m[1])/1000;const lines=[];for(const raw of text.split(/\r?\n/)){if(format==='yrc'){const h=raw.match(/^\[(\d+),(\d+)\](.*)$/);if(!h)continue;let words=[];for(const x of h[3].matchAll(/\((\d+),(\d+),\d+\)([^()]*)/g))words.push({start:+x[1]/1000,end:(+x[1]+ +x[2])/1000,text:x[3]});const full=words.map(w=>w.text).join('');if(full.trim())lines.push({start:+h[1]/1000,end:(+h[1]+ +h[2])/1000,text:full,words})}else{const times=[...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];const content=raw.replace(/\[[^\]]*\]/g,'').trim();if(!content)continue;for(const x of times)lines.push({start:+x[1]*60+ +x[2]+offset,text:content,words:[]})}}lines.sort((a,b)=>a.start-b.start);for(let i=0;i<lines.length;i++)if(!Number.isFinite(lines[i].end))lines[i].end=lines[i+1]?.start??lines[i].start+8;return lines}
function atTime(lines,time){let lo=0,hi=lines.length-1,result=-1;while(lo<=hi){const m=(lo+hi)>>1;if(lines[m].start<=time){result=m;lo=m+1}else hi=m-1}return result}
global.MusicSources={names,configure(p,raw){check(p);return HeudioAPI.configure(raw)},getConfig:p=>p==='qq'?{endpoint:HeudioAPI.base}:null,search,getAudio,getLyrics,playlist,test,qrStart,qrCheck,qrCancel,logout,getCover:t=>t.cover,secureUrl,parseLyrics,atTime};
})(window);
