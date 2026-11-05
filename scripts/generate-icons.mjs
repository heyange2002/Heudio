import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// One vector master supplies the UI, browser and all desktop platforms.
const root = new URL('../', import.meta.url);
const source = await readFile(new URL('public/brand/soundisle.svg', root));
const output = new URL('assets/icons/', root);
await mkdir(output, { recursive: true });
const render = size => sharp(source, { density: 192 }).resize(size, size).png().toBuffer();
await writeFile(new URL('icon.png', output), await render(1024));
await writeFile(new URL('public/brand/favicon.png', root), await render(32));
await writeFile(new URL('public/brand/apple-touch-icon.png', root), await render(180));

// PNG-backed ICO frames retain alpha and cover Windows' common display scales.
const sizes = [16, 24, 32, 48, 64, 128, 256];
const frames = await Promise.all(sizes.map(render));
const directory = Buffer.alloc(6 + sizes.length * 16);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(sizes.length, 4);
let offset = directory.length;
frames.forEach((frame, index) => {
  const entry = 6 + index * 16;
  directory[entry] = directory[entry + 1] = sizes[index] === 256 ? 0 : sizes[index];
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(frame.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
});
await writeFile(new URL('icon.ico', output), Buffer.concat([directory, ...frames]));

// ICNS chunk types include standard and Retina variants through 1024 pixels.
const chunks = await Promise.all([
  ['icp4', 16], ['icp5', 32], ['icp6', 64], ['ic07', 128],
  ['ic08', 256], ['ic09', 512], ['ic10', 1024],
  ['ic11', 32], ['ic12', 64], ['ic13', 256], ['ic14', 512],
].map(async ([type, size]) => {
  const png = await render(size);
  const header = Buffer.alloc(8);
  header.write(type);
  header.writeUInt32BE(png.length + 8, 4);
  return Buffer.concat([header, png]);
}));
const header = Buffer.alloc(8);
header.write('icns');
header.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4);
await writeFile(new URL('icon.icns', output), Buffer.concat([header, ...chunks]));
console.log(`Generated SoundIsle icons in ${fileURLToPath(output)}`);
