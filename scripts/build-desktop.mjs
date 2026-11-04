import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';

await mkdir('desktop', { recursive: true });
await build({
  entryPoints: ['server.ts'], outfile: 'desktop/server.mjs',
  bundle: true, platform: 'node', format: 'esm', target: 'node22', packages: 'external',
});
await copyFile('electron/main.cjs', 'desktop/main.cjs');
