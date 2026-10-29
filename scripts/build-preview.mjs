// Static hosts that require a root dist directory can publish the same frontend.
import './build-frontend.mjs';
import { cp, rm } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
await rm(new URL('dist/', root), { recursive: true, force: true });
await cp(new URL('frontend/dist/', root), new URL('dist/', root), { recursive: true });
console.log('Static preview built: dist (frontend only; backend deployed separately)');
