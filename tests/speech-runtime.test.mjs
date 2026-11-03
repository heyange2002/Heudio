import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

// Run the production speech helper inside workerd: Node fetch mocks alone cannot
// detect options unsupported by the actual Cloudflare Request implementation.
test('speech requests are compatible with workerd and reject redirects safely', async () => {
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), contents: `
      import { synthesizeSpeech } from './cloudflare/speech.mjs';
      export default { async fetch(request) {
        return synthesizeSpeech({ text: '你好' }, { MINIMAX_API_KEY: 'runtime-test-only-key' }, async (url, options) => {
          const upstream = new Request(url, options);
          if (upstream.redirect !== 'manual') throw Error('redirect policy');
          if (new URL(request.url).pathname === '/redirect') return new Response(null, { status: 302, headers: { Location: 'https://untrusted.test' } });
          return Response.json({ base_resp: { status_code: 0 }, data: { audio: '494433fffb' } });
        }, request.signal);
      }};
    ` },
    bundle: true, format: 'esm', platform: 'browser', write: false,
  });
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, compatibilityDate: '2026-11-03', script: bundle.outputFiles[0].text }));
  try {
    const response = await mf.dispatchFetch('https://soundisle.test/synthesize');
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal(response.headers.get('Content-Type'), 'audio/mpeg');
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [73, 68, 51, 255, 251]);
    const redirect = await mf.dispatchFetch('https://soundisle.test/redirect');
    assert.equal(redirect.status, 502); assert.match((await redirect.json()).error, /重定向/);
  } finally { await mf.dispose(); }
});
