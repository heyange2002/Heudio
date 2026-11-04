import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const base = process.env.VERIFY_URL || 'https://music.kwill.cc.cd';
const config = JSON.parse(fs.readFileSync(process.env.RUNTIME_CONFIG || '/etc/soundisle/runtime.json', 'utf8'));
const headers = { 'X-Soundisle-Client': 'web', Origin: base };
const request = (path, options = {}) => fetch(base + path, {
  signal: AbortSignal.timeout(30000), ...options, headers: { ...headers, ...options.headers },
});
let response = await request('/');
assert.equal(response.status, 200);
const html = await response.text();
const htmlSha256 = createHash('sha256').update(html).digest('hex');
if (process.env.EXPECTED_HTML_SHA256) assert.equal(htmlSha256, process.env.EXPECTED_HTML_SHA256);
const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+)"/g)].map(match => match[1]);
assert(assets.length > 0);
let playbackSessionFound = false;
for (const asset of assets) {
  response = await request(asset); assert.equal(response.status, 200);
  if (asset.endsWith('.js')) playbackSessionFound ||= (await response.text()).includes('soundisle:playback-session');
}
assert(playbackSessionFound, 'Expected playback session code in the deployed bundle');
response = await request('/api/music/config'); assert.equal(response.status, 401);
response = await request('/api/auth/session', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: config.env.APP_ACCESS_KEY }),
});
assert.equal(response.status, 200);
const cookie = response.headers.getSetCookie().find(value => value.startsWith('soundisle_session='));
assert(cookie); assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/);
const Cookie = cookie.split(';')[0];
try {
  for (const path of ['/api/music/config', '/api/voice/config', '/api/agent/config']) {
    response = await request(path, { headers: { Cookie } }); assert.equal(response.status, 200);
  }
} finally {
  response = await request('/api/auth/session', { method: 'DELETE', headers: { Cookie } }); assert.equal(response.status, 200);
}
response = await request('/api/music/config', { headers: { Cookie } }); assert.equal(response.status, 401);
console.log(JSON.stringify({ url: base, home: 200, htmlSha256, assets: assets.length, playbackSessionFound,
  protectedConfigs: 200, unauthenticated: 401, login: 200, logout: 200, revokedSession: 401 }));
