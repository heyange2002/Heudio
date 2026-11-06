import test from 'node:test';
import assert from 'node:assert/strict';
import { createSecurity } from '../security.mjs';
const key='0427';
test('desktop enters directly without an access code while preserving same-origin and loopback checks', () => {
 const gate = createSecurity({ desktop: true });
 const request = { path: '/auth/session', method: 'GET' };
 const session = call(gate, request);
 assert.deepEqual(session.body, { authenticated: true, desktop: true });
 assert.match(session.headers['Set-Cookie'], /HttpOnly; SameSite=Strict/);
 const cookie = session.cookies[0].split(';')[0];
 assert.equal(call(gate, { headers: { 'x-soundisle-client': 'web', cookie } }).next, true);
 assert.equal(call(gate, { ...request, headers: {} }).status, 403);
 assert.equal(call(gate, { ...request, headers: { 'x-soundisle-client': 'web', 'sec-fetch-site': 'cross-site' } }).status, 403);
 assert.equal(call(gate, { ...request, socket: { remoteAddress: '192.0.2.1' } }).status, 403);
 assert.equal(call(createSecurity({ key }), request).body.authenticated, false);
});
function call(gate, changes={}) {
 const req={headers:{'x-soundisle-client':'web'},socket:{remoteAddress:'127.0.0.1'},ip:'127.0.0.1',secure:false,protocol:'http',path:'/agent/chat',method:'POST',body:{},get:()=> 'localhost:3000',is:v=>v==='application/json',...changes};
 const result={status:200,headers:{},next:false,body:null};
 const res={status(n){result.status=n;return this},json(body){result.body=body;return this},setHeader(k,v){result.headers[k]=Array.isArray(v)?v.join('; '):v; if(k==='Set-Cookie')result.cookies=Array.isArray(v)?v:[v]}};
 gate(req,res,()=>result.next=true);return result;
}
test('key required; missing/wrong keys never grant access',()=>{
 assert.throws(()=>createSecurity({key:''}));
 for(const invalid of ['123','12345','12a4','１２３４',1234,'test-only-long-key-01234567890123456789'])assert.throws(()=>createSecurity({key:invalid}));
 const gate=createSecurity({key});assert.equal(call(gate).status,401);
 assert.equal(call(gate,{path:'/auth/session',body:{key:'bad'}}).status,401);
});
test('access codes keep leading zeroes and reject non-digit or incorrectly sized credentials',()=>{
 const gate=createSecurity({key});
 for(const invalid of ['427','00427','04a7',427])assert.equal(call(gate,{path:'/auth/session',body:{key:invalid}}).status,401);
 assert.equal(call(gate,{path:'/auth/session',body:{key}}).body.authenticated,true);
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

test('native audio may omit custom headers only for authenticated same-origin opaque media requests', () => {
 const gate=createSecurity({key});
 const login=call(gate,{path:'/auth/session',body:{key}}), cookie=login.headers['Set-Cookie'].split(';')[0];
 const path='/music/stream/'+'a'.repeat(48);
 assert.equal(call(gate,{path,method:'GET',headers:{cookie,'sec-fetch-site':'same-origin'}}).next,true);
 assert.equal(call(gate,{path,method:'GET',headers:{cookie,'sec-fetch-site':'cross-site'}}).status,403);
 assert.equal(call(gate,{path,method:'GET',headers:{}}).status,401);
 assert.equal(call(gate,{path:'/music/config',method:'GET',headers:{cookie}}).status,403);
});

test('music identity survives unlock renewal, logout, expiry and server restart without bypassing access control',()=>{
 let time=100;let gate=createSecurity({key,ttl:1000,now:()=>time});
 const login=call(gate,{path:'/auth/session',body:{key},secure:true,protocol:'https'});
 const device=login.cookies.find(c=>c.startsWith('soundisle_music_device='));
 assert.match(device,/HttpOnly; SameSite=Strict; Path=\/api; Max-Age=15552000; Secure/);
 const deviceCookie=device.split(';')[0];
 const sessionCookie=login.cookies[0].split(';')[0];
 time=1200;
 assert.equal(call(gate,{headers:{'x-soundisle-client':'web',cookie:deviceCookie}}).status,401);
 const again=call(gate,{path:'/auth/session',body:{key},headers:{'x-soundisle-client':'web',cookie:deviceCookie}});
 assert.equal(again.cookies[1].split(';')[0],deviceCookie);
 assert.notEqual(again.cookies[0].split(';')[0],sessionCookie);
 const loggedOut=call(gate,{path:'/auth/session',method:'DELETE',headers:{'x-soundisle-client':'web',cookie:again.cookies[0].split(';')[0]+'; '+deviceCookie}});
 assert(!loggedOut.cookies.some(c=>c.startsWith('soundisle_music_device=')));
 gate=createSecurity({key});
 const restarted=call(gate,{path:'/auth/session',body:{key},headers:{'x-soundisle-client':'web',cookie:deviceCookie}});
 assert.equal(restarted.cookies[1].split(';')[0],deviceCookie);
});

test('existing authenticated browsers gain a stable identity using the legacy session',()=>{
 const gate=createSecurity({key});const login=call(gate,{path:'/auth/session',body:{key}});
 const old=login.cookies[0].split(';')[0];
 const result=call(gate,{path:'/auth/session',method:'GET',headers:{'x-soundisle-client':'web',cookie:old}});
 assert.equal(result.body.authenticated,true);
 assert.equal(result.cookies[0].split(';')[0],'soundisle_music_device='+old.split('=')[1]);
 assert.equal(call(gate,{path:'/auth/session',method:'GET'}).cookies,undefined);
});

test('mobile has no access-code gate and creates stable per-device cookies across restarts and expiry', () => {
 let time=0;
 let gate=createSecurity({mobile:true,now:()=>time,ttl:10});
 const first=call(gate,{path:'/auth/session',method:'GET'});
 assert.deepEqual(first.body,{authenticated:true,mobile:true});
 const cookies=first.cookies.map(c=>c.split(';')[0]).join('; ');
 assert.match(cookies,/soundisle_session=[a-f0-9]{64}/);
 assert.match(cookies,/soundisle_music_device=[a-f0-9]{64}/);
 assert(first.cookies.every(c=>c.includes('HttpOnly; SameSite=Strict; Path=/api; Max-Age=15552000')));
 time=100000;
 gate=createSecurity({mobile:true,now:()=>time});
 const headers={'x-soundisle-client':'web',cookie:cookies};
 assert(call(gate,{headers}).next);
 const reopened=call(gate,{headers,path:'/auth/session',method:'GET'});
 assert.equal(reopened.cookies.map(c=>c.split(';')[0]).join('; '),cookies);
 assert.deepEqual(call(gate,{headers,path:'/auth/session',method:'DELETE'}).body,{authenticated:true,mobile:true});
 const other=call(gate,{path:'/auth/session',method:'GET'});
 assert.notEqual(other.cookies[0],first.cookies[0]);
 const legacy='a'.repeat(64),device='b'.repeat(64);
 const migrated=call(gate,{path:'/auth/session',method:'GET',headers:{'x-soundisle-client':'web',cookie:`soundisle_session=${legacy}; soundisle_music_device=${device}`}});
 assert.equal(migrated.cookies[0].split(';')[0],`soundisle_session=${legacy}`);
 assert.equal(migrated.cookies[1].split(';')[0],`soundisle_music_device=${device}`);
});

test('passwordless mobile still checks request origins and TLS and supplies identity before the first API call', () => {
 const gate=createSecurity({mobile:true});
 assert.equal(call(gate,{headers:{}}).status,403);
 assert.equal(call(gate,{headers:{'x-soundisle-client':'web',origin:'https://other.example'}}).status,403);
 assert.equal(call(gate,{headers:{'x-soundisle-client':'web','sec-fetch-site':'cross-site'}}).status,403);
 assert.equal(call(gate,{socket:{remoteAddress:'192.0.2.1'}}).status,426);
 assert.equal(call(createSecurity({mobile:true,production:true}),{}).status,426);
 const remote=call(gate,{socket:{remoteAddress:'192.0.2.1'},secure:true,protocol:'https',path:'/auth/session',method:'GET'});
 assert.equal(remote.body.authenticated,true);
 assert(remote.cookies.every(c=>c.endsWith('; Secure')));
 const headers={'x-soundisle-client':'web'};
 assert(call(gate,{headers}).next);
 assert.match(headers.cookie,/soundisle_session=[a-f0-9]{64}/);
 assert.match(headers.cookie,/soundisle_music_device=[a-f0-9]{64}/);
 assert.throws(()=>createSecurity({key:''}),/APP_ACCESS_KEY/);
});
