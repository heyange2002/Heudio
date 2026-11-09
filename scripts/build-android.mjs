import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
const root = path.resolve(import.meta.dirname, "..");
const env = { ...process.env };
const bundledJava =
  "/Applications/Android Studio.app/Contents/jbr/Contents/Home";
if (process.platform === "darwin" && fs.existsSync(bundledJava))
  env.JAVA_HOME = env.JAVA_HOME || bundledJava;
if (!env.ANDROID_HOME && process.platform === "darwin")
  env.ANDROID_HOME = path.join(os.homedir(), "Library/Android/sdk");
let proxy = env.SOUNDISLE_GRADLE_PROXY || env.HTTPS_PROXY;
if (!proxy && process.platform === "darwin") {
  const state =
    spawnSync("scutil", ["--proxy"], { encoding: "utf8" }).stdout || "";
  if (/HTTPSEnable\s*:\s*1/.test(state)) {
    const host = /HTTPSProxy\s*:\s*(\S+)/.exec(state)?.[1],
      port = /HTTPSPort\s*:\s*(\d+)/.exec(state)?.[1];
    if (host && port) proxy = `http://${host}:${port}`;
  }
}
const flags = [];
if (proxy) {
  const url = new URL(proxy);
  if (url.username || url.password)
    throw Error("请在本地代理软件中配置凭据，不要将代理凭据传入构建参数");
  for (const scheme of ["https", "http"])
    flags.push(
      `-D${scheme}.proxyHost=${url.hostname}`,
      `-D${scheme}.proxyPort=${url.port || "80"}`,
    );
  env.JAVA_OPTS = [env.JAVA_OPTS || "", ...flags].join(" ");
  flags.push("-Dhttp.nonProxyHosts=repo.maven.apache.org");
}
const child = spawn(
  process.platform === "win32" ? "gradlew.bat" : "./gradlew",
  [
    ...(process.argv.includes("--verify") ? ["testDebugUnitTest", "lintDebug", "assembleDebug"] : process.argv.includes("--test") ? ["testDebugUnitTest"] : ["assembleDebug"]),
    "--no-daemon",
    ...flags,
  ],
  {
    cwd: path.join(root, "android"),
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);
child.on("error", (e) => {
  console.error(e.message);
  process.exitCode = 1;
});
child.on("exit", (code) => process.exit(code || 0));
