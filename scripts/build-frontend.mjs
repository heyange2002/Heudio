import { cp, mkdir, rm } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
await rm(new URL('frontend/dist/', root), { recursive: true, force: true });
await mkdir(new URL('frontend/dist/', root), { recursive: true });
await cp(new URL('frontend/public/', root), new URL('frontend/dist/', root), { recursive: true });
console.log('Frontend built: frontend/dist');
