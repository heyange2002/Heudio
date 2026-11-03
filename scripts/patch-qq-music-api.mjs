import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// 3.3.5 bootstraps an Android session before every QR, including browser-only
// login drivers. Defer that dependency until the user confirms a browser QR.
// Keep bootstrap before credential issuance so playback sessions remain complete.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = path.join(root, 'node_modules/@yakult-green-tea/qq-music-api');
if (JSON.parse(fs.readFileSync(path.join(pkg, 'package.json'), 'utf8')).version !== '3.3.5') throw Error('Review QR compatibility patch before changing QQ API version');
for (const format of ['dist-esm', 'dist']) {
  const file = path.join(pkg, format, 'src/services/auth/qrService.js');
  let source = fs.readFileSync(file, 'utf8');
  if (source.includes('soundisle:defer-browser-bootstrap')) continue;
  const ensure = format === 'dist-esm' ? 'ensureQimei' : '(0, bootstrap_1.ensureQimei)';
  const refresh = format === 'dist-esm' ? 'refreshAndroidSession' : '(0, bootstrap_1.refreshAndroidSession)';
  const before = `            const device = this.deviceStore.get();\n            if (await ${ensure}(this.http, device, this.now()))\n                this.deviceStore.persist();\n            stage = 'session-bootstrap';\n            await ${refresh}(this.http, device);\n            this.deviceStore.persist();`;
  const after = `            // soundisle:defer-browser-bootstrap\n            const browserLogin = loginChannel === 'wechat' || typeof this.drivers[loginChannel]?.exchange === 'function';\n            if (!browserLogin) {\n${before}\n            }`;
  const marker = `        let credential = exchange`;
  const deferred = `        if ((exchange || session.channel === 'wechat') && !this.deviceStore.get().sessionSid) {\n            session.failureStage = 'session-bootstrap';\n            const device = this.deviceStore.get();\n            if (await ${ensure}(this.http, device, this.now())) this.deviceStore.persist();\n            await ${refresh}(this.http, device);\n            this.deviceStore.persist();\n        }\n`;
  if (!source.includes(before) || !source.includes(marker)) throw Error('QQ API patch anchor changed; review required');
  source = source.replace(before, after).replace(marker, deferred + marker);
  fs.writeFileSync(file, source);
}
