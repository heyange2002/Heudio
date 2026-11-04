import test from 'node:test';
import assert from 'node:assert/strict';
import {AuthStore} from '../cloudflare/auth.mjs';
const key='0738';
function state(){const map=new Map();return {storage:{async get(k){return structuredClone(map.get(k))},async put(k,v){map.set(k,structuredClone(v))},async delete(k){for(const v of Array.isArray(k)?k:[k])map.delete(v)},async transaction(fn){return fn(this)},async setAlarm(){},async list(options={}){return new Map([...map].filter(([k])=>!options.startAfter||k>options.startAfter).sort(([a],[b])=>a.localeCompare(b)).slice(0,options.limit||500))}},map}}
const req=(method='GET',body,cookie)=>new Request('https://example.com/api/auth/session',{method,headers:{...(cookie?{Cookie:cookie}:{}),'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1'},...(body?{body:JSON.stringify(body)}:{})});
test('Cloudflare requires a configured key; invalid credentials fail closed',async()=>{
 assert.equal((await new AuthStore(state(),{}).fetch(req())).status,503);
 const auth=new AuthStore(state(),{APP_ACCESS_KEY:key});assert.equal((await auth.fetch(req('POST',{key:'bad'}))).status,401);
});
test('four-digit codes preserve leading zeroes and reject invalid configuration and input',async()=>{
 for(const invalid of ['123','12345','12x4',1234,'legacy-key-012345678901234567890123456789'])assert.equal((await new AuthStore(state(),{APP_ACCESS_KEY:invalid}).fetch(req())).status,503);
 const auth=new AuthStore(state(),{APP_ACCESS_KEY:key});
 for(const invalid of ['738','00738','07x8',738])assert.equal((await auth.fetch(req('POST',{key:invalid}))).status,401);
 assert.equal((await auth.fetch(req('POST',{key}))).status,200);
});
test('durable sessions survive instance eviction, logout and key rotation revoke them',async()=>{
 const ctx=state(),env={APP_ACCESS_KEY:key},auth=new AuthStore(ctx,env);
 const login=await auth.fetch(req('POST',{key}));assert.equal(login.status,200);
 const cookie=login.headers.get('Set-Cookie');assert.match(cookie,/HttpOnly; Secure; SameSite=Strict/);assert(!cookie.includes(key));
 const another=new AuthStore(ctx,env);assert.equal((await (await another.fetch(req('GET',null,cookie))).json()).authenticated,true);
 const rotated=new AuthStore(ctx,{APP_ACCESS_KEY:'8631'});assert.equal((await (await rotated.fetch(req('GET',null,cookie))).json()).authenticated,false);
 await another.fetch(req('DELETE',null,cookie));assert.equal((await (await auth.fetch(req('GET',null,cookie))).json()).authenticated,false);
});
test('durable rate limit spans instances; alarm removes expired records',async()=>{
 const ctx=state(),env={APP_ACCESS_KEY:key};
 for(let i=0;i<5;i++)assert.equal((await new AuthStore(ctx,env).fetch(req('POST',{key:'bad'}))).status,401);
 const auth=new AuthStore(ctx,env);assert.equal((await auth.fetch(req('POST',{key}))).status,429);
 ctx.map.set('session:old',{expires:1});await auth.alarm();assert.equal(ctx.map.has('session:old'),false);
});
