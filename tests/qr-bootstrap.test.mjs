import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const dir = path.resolve('node_modules/@yakult-green-tea/qq-music-api/dist-esm/src/services/auth');
const { createQrLoginService } = await import(pathToFileURL(path.join(dir,'qrService.js')));
const { createMemoryDeviceContextRepository } = await import(pathToFileURL(path.join(dir,'deviceContextStore.js')));
// Use a real service with a known device and fail every network bootstrap call.
// Browser QR creation must work, while MQTT must still attempt bootstrap.
const device = { qimei: 'test-qimei', qimei36: 'test-qimei36', qimeiSavedAt: Date.now(), sessionUid: 'uid', sessionSid: 'sid' };
function service(browser) {
 let networkCalls = 0;
 const http = { post: async () => { networkCalls++; throw Error('offline'); }, get: async () => { networkCalls++; throw Error('offline'); } };
 const qr = createQrLoginService({ http, deviceRepository: createMemoryDeviceContextRepository(device), capabilities: { channels: ['qq'], sessionMode: 'stored' }, drivers: { qq: { mode: 'pull', createQr: async () => ({ identifier: 'real-qr-identifier', imageUrl: 'data:image/png;base64,aW1hZ2U=' }), advance: async () => [], close() {}, ...(browser ? { exchange: async () => ({}) } : {}) } } });
 return { qr, calls: () => networkCalls };
}
test('browser QQ QR creation does not require Android bootstrap, while MQTT retains it', async () => {
 const browser = service(true); const key = await browser.qr.createSession('qq');
 const image = await browser.qr.createQr(key); assert.match(image, /^data:image/); assert.equal(browser.calls(), 0);
 const mqtt = service(false); await assert.rejects(mqtt.qr.createSession('qq')); assert.equal(mqtt.calls(), 1);
});
