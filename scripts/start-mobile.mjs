import path from "node:path";
import { spawn } from "node:child_process";
const root = path.resolve(import.meta.dirname, "..");
const env = {
  ...process.env,
  SOUNDISLE_MOBILE: "true",
  PORT: process.env.PORT || "5174",
};
const child = spawn(process.execPath, ["--import", "tsx", "server.ts"], {
  cwd: root,
  env,
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code || 0));
