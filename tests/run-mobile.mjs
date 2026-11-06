import { build } from "esbuild";
import { spawnSync } from "node:child_process";
await build({
  entryPoints: ["tests/mobile.test.tsx", "tests/native-audio.test.tsx"],
  bundle: true,
  platform: "node",
  format: "cjs",
  packages: "external",
  outdir: ".wrangler/mobile-tests",
  outExtension: { ".js": ".cjs" },
  loader: { ".jpg": "file" },
  jsx: "automatic",
});
const result = spawnSync(
  process.execPath,
  [
    "--test",
    ".wrangler/mobile-tests/mobile.test.cjs",
    ".wrangler/mobile-tests/native-audio.test.cjs",
    "tests/mobile-server.test.mjs",
    "tests/qq-display.test.mjs",
  ],
  { stdio: "inherit" },
);
process.exitCode = result.status || 0;
