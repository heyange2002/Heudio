import test from 'node:test';
import assert from 'node:assert/strict';
import { createSecurity } from '../security.mjs';
const key='test-only-access-key-01234567890123456789';
function call(gate, changes={}) {
 const req={headers:{'x-soundisle-client':'web'},socket:{remoteAddress:'127.0.0.1'},ip:'127.0.0.1',secure:false,protocol:'http',path:'/agent/chat',method:'POST',body:{},get:()=> 'localhost:3000',is:v=>v==='application/json',...changes};
 const result={status:200,headers:{},next:false,body:null};
 const res={status(n){result.status=n;return this},json(body){result.body=body;return this},setHeader(k,v){result.headers[k]=v}};
 gate(req,res,()=>result.next=true);return result;
}
test('key required; missing/wrong keys never grant access',()=>{
 assert.throws(()=>createSecurity({key:''}));
 const gate=createSecurity({key});assert.equal(call(gate).status,401);
 assert.equal(call(gate,{path:'/auth/session',body:{key:'bad'}}).status,401);
});
test('session cookie, expiration and logout',()=>{
 let time=100;const gate=createSecurity({key,ttl:1000,now:()=>time});
 const login=call(gate,{path:'/auth/session',body:{key}});assert.equal(login.status,200);
 const cookie=login.headers['Set-Cookie'];assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);assert(!cookie.includes(key));
 const headers={'x-soundisle-client':'web',cookie:cookie.split(';')[0]};
 assert.equal(call(gate,{headers}).next,true);
 call(gate,{headers,path:'/auth/session',method:'DELETE'});assert.equal(call(gate,{headers}).status,401);
 const again=call(gate,{path:'/auth/session',body:{key}});time=1200;
 assert.equal(call(gate,{headers:{...headers,cookie:again.headers['Set-Cookie'].split(';')[0]}}).status,401);
});
test('rate limits and browser origin checks',()=>{
 const gate=createSecurity({key});for(let i=0;i<5;i++)call(gate,{path:'/auth/session',body:{key:'bad'}});
 assert.equal(call(gate,{path:'/auth/session',body:{key}}).status,429);
 assert.equal(call(gate,{headers:{}}).status,403);
 assert.equal(call(gate,{headers:{'x-soundisle-client':'web',origin:'https://other.example'}}).status,403);
});
test('production requires TLS; secure cookies; dev rejects remote plaintext',()=>{
 const gate=createSecurity({key,production:true});assert.equal(call(gate).status,426);
 const secure=call(gate,{secure:true,protocol:'https',path:'/auth/session',body:{key}});assert.match(secure.headers['Set-Cookie'],/; Secure/);
 assert.equal(call(createSecurity({key}),{socket:{remoteAddress:'192.0.2.1'}}).status,426);
});
