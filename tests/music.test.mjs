import test from 'node:test';
import assert from 'node:assert/strict';
import { createMusicClient, musicRoute, normalizeSongs, validateMusicConfig } from '../cloudflare/music.mjs';
import { getWeather } from '../cloudflare/context.mjs';
const request = (path = '', cookie = 'user-a') => new Request('https://soundisle.test/api/music' + path, { headers: { Cookie: 'soundisle_session=' + cookie } });
function store() { const map = new Map(); return { map, get: async k => map.get(k), put: async (k,v) => { map.set(k,v); }, delete: async k => map.delete(k) }; }
const song = { mid: 'realMid123', title: '真实歌曲', singer: [{ name: '歌手' }], album: { mid: 'album123', name: '专辑' }, interval: 120 };
test('QQ login tokens stay server side and sessions are isolated per app session', async () => {
  const state = store(); let receivedToken;
  const deps = { handleRequest: async req => {
    if (new URL(req.url).pathname === '/login/qr/check') return Response.json({ code: 803, cookie: 'qqmusic_session=private-qq-token;', data: { token: 'private-qq-token' } });
    receivedToken = req.headers.get('X-QQ-Session'); return Response.json({ code: 200, items: [song] });
  } };
  let client = await createMusicClient(request(), { QQ_SESSION_SECRET: 'test-key' }, state, deps);
  const login = await client.call('/login/qr/check', { key: 'qr-key' });
  assert(!JSON.stringify(login).includes('private-qq-token'));
  client = await createMusicClient(request(), {}, state, deps); assert.equal((await client.search('歌曲'))[0].mid, song.mid); assert.equal(receivedToken, 'private-qq-token');
  const other = await createMusicClient(request('', 'user-b'), {}, state, deps); await other.search('歌曲'); assert.equal(receivedToken, null);
  await client.call('/logout'); client = await createMusicClient(request(), {}, state, deps); await client.search('歌曲'); assert.equal(receivedToken, null);
});
test('music config rejects credentials, redirects and private production gateways', async () => {
  for (const url of ['http://service.test', 'https://user:pass@service.test', 'https://127.0.0.1', 'https://192.168.0.1', 'https://service.test?token=secret']) assert.throws(() => validateMusicConfig({ mode: 'gateway', url }));
  assert.equal(validateMusicConfig({ mode: 'gateway', url: 'http://localhost:3200' }, true).url, 'http://localhost:3200');
  const state = store(); await state.put('music:config', { mode: 'gateway', url: 'https://gateway.test' });
  const client = await createMusicClient(request(), {}, state, { fetch: async req => { assert.equal(req.redirect, 'manual'); return new Response(null, { status: 302 }); } });
  await assert.rejects(client.search('歌'), /暂时不可用/);
  await assert.rejects(client.call('/user/playlist/delete'), /不可用/);
});
test('normalizes actual catalog and playlist shapes, drops malformed IDs and duplicates', () => {
  const result = normalizeSongs({ songs: [song, song, { mid: '../invalid', title: 'bad' }] });
  assert.equal(result.length, 1); assert.equal(result[0].artist, '歌手'); assert.equal(result[0].duration, 120);
  assert.equal(normalizeSongs({ response: { cdlist: [{ songlist: [song] }] } }).length, 1);
});
test('music endpoints restrict methods and discard query credentials', async () => {
  let credential;
  const state = store();
  const response = await musicRoute(request('/search?keyword=歌&cookie=stolen'), {}, state, { handleRequest: async req => { credential = new URL(req.url).searchParams.get('cookie'); return Response.json({ code: 200, items: [song] }); } });
  assert.equal(response.status, 200); assert.equal(credential, null); assert.equal((await response.json()).songs.length, 1);
  const invalid = await musicRoute(new Request('https://app.test/api/music/config', { method: 'DELETE', headers: { Cookie: 'soundisle_session=test' } }), {}, state); assert.equal(invalid.status, 405);
});
test('weather uses explicit city and real provider readings, and handles missing data', async () => {
  assert.equal((await getWeather('')).available, false);
  const result = await getWeather('test-city', async url => url.includes('geocoding') ? Response.json({ results: [{ name: '测试市', latitude: 31, longitude: 121 }] }) : Response.json({ current: { temperature_2m: 19, weather_code: 61, time: '2026-11-03T16:00' } }));
  assert.equal(result.summary, '测试市 · 雨 19°C'); assert.equal(result.available, true);
  const failed = await getWeather('unknown-test-city', async () => { throw Error('offline'); }); assert.equal(failed.available, false);
});

test('QQ grant survives changing the app session and reconstructing the store, while other browsers stay isolated',async()=>{
 const state=store();let token;
 const browser='a'.repeat(64);
 const browserRequest=(app,device=browser)=>new Request('https://soundisle.test/api/music/login/status',{headers:{Cookie:`soundisle_session=${app}; soundisle_music_device=${device}`}});
 const deps={handleRequest:async req=>{
   token=req.headers.get('X-QQ-Session');
   if(new URL(req.url).pathname==='/login/qr/check')return Response.json({code:803,data:{token:'saved-grant'}});
   return Response.json({code:200,data:{profile:token?{name:'QQ用户'}:undefined}});
 }};
 let client=await createMusicClient(browserRequest('first'),{},state,deps);await client.call('/login/qr/check');
 const restored=store();for(const [k,v] of JSON.parse(JSON.stringify([...state.map])))restored.map.set(k,v);
 client=await createMusicClient(browserRequest('after-restart'),{},restored,deps);
 assert((await client.call('/login/status')).data.profile);assert.equal(token,'saved-grant');
 client=await createMusicClient(browserRequest('another-browser','b'.repeat(64)),{},restored,deps);await client.call('/login/status');assert.equal(token,null);
 client=await createMusicClient(browserRequest('new-unlock'),{},restored,deps);await client.call('/logout');
 client=await createMusicClient(browserRequest('later'),{},restored,deps);await client.call('/login/status');assert.equal(token,null);
});

test('status without a profile and transient refresh failures retain the grant; unchanged config does not log out',async()=>{
 const state=store();let fail=false;
 const deps={handleRequest:async req=>{
   const path=new URL(req.url).pathname;
   if(path==='/login/qr/check')return Response.json({code:803,data:{token:'still-valid'}});
   if(path==='/login/refresh'&&fail)throw Error('network');
   return Response.json({code:200,data:{}});
 }};
 let client=await createMusicClient(request(),{},state,deps);await client.call('/login/qr/check');
 const key=[...state.map.keys()][0];state.map.get(key).nextRefreshAt=0;fail=true;
 await client.call('/login/status');assert.equal(state.map.get(key).token,'still-valid');
 assert(state.map.get(key).nextRefreshAt>Date.now());
 const cfg=new Request('https://soundisle.test/api/music/config',{method:'PUT',headers:{Cookie:'soundisle_session=user-a','Content-Type':'application/json'},body:JSON.stringify({mode:'embedded'})});
 assert.equal((await musicRoute(cfg,{},state,deps)).status,200);assert.equal(state.map.get(key).token,'still-valid');
});

test('background renewal saves rotated tokens and provider expiry without an open browser; logout wins an in-flight renewal',async()=>{
 const {refreshSavedMusicSessions}=await import('../cloudflare/music.mjs');
 const state=store();state.keys=async prefix=>[...state.map.keys()].filter(k=>k.startsWith(prefix));
 const key='qq:session:stored';state.map.set(key,{token:'old',expires:Date.now()+86400000,nextRefreshAt:0});
 const expiresAt=Date.now()+2*86400000;
 await refreshSavedMusicSessions({},state,{handleRequest:async req=>{assert.equal(req.method,'POST');assert.equal(req.headers.get('X-QQ-Session'),'old');return Response.json({code:200,data:{token:'rotated',expiresAt}});}});
 assert.equal(state.map.get(key).token,'rotated');assert.equal(state.map.get(key).expires,expiresAt);
 state.map.get(key).nextRefreshAt=0;
 await refreshSavedMusicSessions({},state,{handleRequest:async()=>{await state.delete(key);return Response.json({code:200,data:{token:'must-not-resurrect',expiresAt}});}});
 assert.equal(state.map.has(key),false);
});

test('explicit QQ logout clears the saved grant even if the upstream is unreachable',async()=>{
 const state=store();let fail=false;
 const deps={handleRequest:async()=>{if(fail)throw Error('offline');return Response.json({code:803,data:{token:'private-grant'}});}};
 const client=await createMusicClient(request(),{},state,deps);await client.call('/login/qr/check');assert.equal(state.map.size,1);
 fail=true;await assert.rejects(client.call('/logout'));assert.equal(state.map.size,0);
});

test('mood recommendations share the authenticated search adapter and preserve only supplied metadata', async () => {
  const client = await createMusicClient(request(), {}, store(), {handleRequest: async req => {
    const url = new URL(req.url);
    assert.equal(url.pathname, '/search'); assert.equal(url.searchParams.get('limit'), '5');
    assert.match(url.searchParams.get('keyword'), /舒缓 治愈 ambient 夜晚/);
    return Response.json({items:[{...song,genre:'Ambient',bpm:72,releaseDate:'2021-01-02',tags:['calm',null]}]});
  }});
  const songs = await client.recommend({mood:'melancholic',style:'ambient',scene:'夜晚',count:5});
  assert.equal(songs[0].mid,song.mid); assert.equal(songs[0].bpm,72);
  assert.equal(songs[0].releaseDate,'2021-01-02'); assert.deepEqual(songs[0].tags,['calm']);
  const plain = normalizeSongs({items:[song]})[0];
  for (const key of ['genre','bpm','releaseDate','tags','story']) assert.equal(plain[key],undefined);
});

test('an empty authenticated catalog retries public search without replacing the saved QQ grant', async () => {
  const state = store(), calls = [];
  const client = await createMusicClient(request(), {}, state, {handleRequest: async req => {
    const path = new URL(req.url).pathname;
    if (path === '/login/qr/check') return Response.json({code:803,token:'saved-grant'});
    calls.push({path,token:req.headers.get('X-QQ-Session')});
    if (path === '/user/liked-songs') return Response.json({songs:[]});
    return Response.json({items:req.headers.has('X-QQ-Session') ? [] : [song],...(req.headers.has('X-QQ-Session') ? {} : {token:'must-not-replace-grant'})});
  }});
  await client.call('/login/qr/check');
  assert.equal((await client.search('Norah Jones'))[0].mid,song.mid);
  assert.deepEqual(calls.map(c=>c.token),['saved-grant',null]);
  await client.liked();
  assert.equal(calls.length,3); assert.equal(calls[2].token,'saved-grant');
});

test('anonymous empty searches do not repeat, and cancellation prevents public fallback', async () => {
  let calls = 0;
  const controller = new AbortController();
  const client = await createMusicClient(request(), {}, store(), {handleRequest:async req=>{
    if (new URL(req.url).pathname === '/login/qr/check') return Response.json({code:803,token:'saved-grant'});
    calls++; if(calls===2)controller.abort(); return Response.json({items:[]});
  }});
  assert.deepEqual(await client.search('no match'),[]); assert.equal(calls,1);
  await client.call('/login/qr/check');
  await assert.rejects(client.search('no match',5,controller.signal),{name:'AbortError'});
  assert.equal(calls,2);
});

test('mood retrieval retries the requested style when a compound scene query has no matches', async () => {
  const {recommendByMood} = await import('../shared/music-discovery.mjs');
  const queries=[];
  const songs=await recommendByMood(async query=>{queries.push(query);return queries.length===1?[]:[song];},{mood:'烦躁',style:'爵士',scene:'雨天',count:5});
  assert.deepEqual(queries,['舒缓 钢琴 爵士 雨天','爵士']);assert.equal(songs[0].mid,song.mid);
});

test('playlist normalization retains the entire catalog beyond the old 30-song cutoff', () => {
 const songs = Array.from({length:120},(_,i)=>({...song,mid:'full'+i}));
 const result=normalizeSongs({cdlist:[{songlist:[...songs,songs[0],null,{mid:'../bad'}]}]});
 assert.equal(result.length,120);assert.equal(result.at(-1).mid,'full119');
});
