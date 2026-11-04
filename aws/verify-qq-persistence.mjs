import fs from 'node:fs';
import assert from 'node:assert/strict';
const base=process.env.VERIFY_URL||'https://music.kwill.cc.cd';
const config=JSON.parse(fs.readFileSync(process.env.RUNTIME_CONFIG||'/etc/soundisle/runtime.json','utf8'));
const jar=new Map();
async function request(path,options={}) {
 const r=await fetch(base+path,{signal:AbortSignal.timeout(30000),...options,headers:{'X-Soundisle-Client':'web',Origin:base,Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),...options.headers}});
 for(const cookie of r.headers.getSetCookie()) {
  const pair=cookie.split(';')[0], at=pair.indexOf('=');
  if(/Max-Age=0(?:;|$)/.test(cookie)) jar.delete(pair.slice(0,at));else jar.set(pair.slice(0,at),pair.slice(at+1));
 }
 return r;
}
const login=()=>request('/api/auth/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:config.env.APP_ACCESS_KEY})});
let r=await login();assert.equal(r.status,200);
const device=jar.get('soundisle_music_device');assert.match(device,/^[a-f0-9]{64}$/);
const cookie=r.headers.getSetCookie().find(c=>c.startsWith('soundisle_music_device='));assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/Max-Age=15552000/);
const firstSession=jar.get('soundisle_session');
r=await request('/api/music/config');assert.equal(r.status,200);
r=await request('/api/auth/session',{method:'DELETE'});assert.equal(r.status,200);assert.equal(jar.get('soundisle_music_device'),device);
r=await request('/api/music/config');assert.equal(r.status,401);
r=await login();assert.equal(r.status,200);assert.equal(jar.get('soundisle_music_device'),device);assert.notEqual(jar.get('soundisle_session'),firstSession);
r=await request('/api/auth/session');assert.equal((await r.json()).authenticated,true);assert.equal(jar.get('soundisle_music_device'),device);
await request('/api/auth/session',{method:'DELETE'});
console.log(JSON.stringify({url:base,persistentCookie:true,sameBrowserAfterUnlock:true,deviceAloneCannotUnlock:true,secureHttpOnly:true}));
