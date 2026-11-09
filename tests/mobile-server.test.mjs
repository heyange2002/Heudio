import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";

test(
  "mobile enters without an access code, isolates device grants and keeps MiniMax Key server-side while web access remains locked",
  { timeout: 60000 },
  async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), "soundisle-mobile-server-"),
    );
    let child,
      base,
      cookie = "";
    let mobileMode = true;
    const qrImage = "data:image/png;base64,aGVsbG8=";
    const qrKey = "qq1.q." + "sealed-qr-state".repeat(100);
    const gateway = createServer((req, res) => {
      const pathname = new URL(req.url, "http://localhost").pathname;
      let data;
      if (pathname === "/login/qr/key")
        data = { code: 200, data: { unikey: qrKey } };
      else if (pathname === "/login/qr/create")
        data = { code: 200, data: { qrimg: qrImage } };
      else if (pathname === "/login/qr/check")
        data = {
          code: 803,
          data: { token: "test-qq-grant", expiresAt: Date.now() + 600000 },
        };
      else if (pathname === "/login/status")
        data = {
          code: 200,
          data: {
            profile:
              req.headers["x-qq-session"] === "test-qq-grant"
                ? { nickname: "测试手机用户" }
                : null,
          },
        };
      else data = { code: 200, data: {} };
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(data));
    });
    const start = async (mobile = true, apiKey = "") => {
      mobileMode = mobile;
      child = spawn(process.execPath, ["--import", "tsx", "server.ts"], {
        cwd: path.resolve(import.meta.dirname, ".."),
        env: {
          ...process.env,
          PORT: "0",
          HOST: "127.0.0.1",
          NODE_ENV: "development",
          SOUNDISLE_DESKTOP: "false",
          SOUNDISLE_MOBILE: String(mobile),
          SOUNDISLE_DATA_DIR: dir,
          SOUNDISLE_ENV_FILE: path.join(dir, "absent.env"),
          APP_ACCESS_KEY: mobile ? "" : "0472",
          MOBILE_API_KEY: apiKey,
          MINIMAX_API_KEY: "",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      base = await new Promise((resolve, reject) => {
        let log = "";
        const timer = setTimeout(
          () => reject(Error("mobile server startup timed out")),
          15000,
        );
        child.stdout.on("data", (chunk) => {
          log += chunk.toString();
          const match = /SoundIsle: (http:\/\/127\.0\.0\.1:\d+)/.exec(log);
          if (match) {
            clearTimeout(timer);
            resolve(match[1]);
          }
        });
        child.once("exit", (code) => {
          clearTimeout(timer);
          reject(Error("mobile server exited " + code));
        });
      });
      cookie = "";
    };
    const stop = async () => {
      if (child && child.exitCode === null) {
        const exit = once(child, "exit");
        child.kill("SIGTERM");
        await exit;
      }
    };
    const call = (endpoint, options = {}) =>
      fetch(base + endpoint, {
        ...options,
        headers: {
          "X-Soundisle-Client": "web",
          ...(cookie ? { Cookie: cookie } : {}),
          ...options.headers,
        },
      });
    const login = async () => {
      const r = await call(
        "/api/auth/session",
        mobileMode
          ? {}
          : {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ key: "0472" }),
            },
      );
      assert.equal(r.status, 200);
      assert(
        r.headers
          .getSetCookie()
          .some(
            (value) =>
              value.startsWith("soundisle_session=") &&
              value.includes(`Max-Age=${mobileMode ? 15552000 : 3600}`),
          ),
      );
      cookie = r.headers
        .getSetCookie()
        .map((v) => v.split(";")[0])
        .join("; ");
    };
    try {
      gateway.listen(0, "127.0.0.1");
      await once(gateway, "listening");
      await start();
      assert.equal((await call("/api/voice/config")).status, 200);
      assert.equal(
        (await call("/api/mobile/qq-display?code=123456")).status,
        404,
      );
      assert.equal((await fetch(base + "/.env")).status, 404);
      assert.equal(
        (await fetch(base + "/.data/mobile/minimax-settings.json")).status,
        404,
      );
      assert.equal(
        (await fetch(base + "/node_modules/.vite/deps/react-dom_client.js"))
          .status,
        200,
      );
      await login();
      const phoneCookie = cookie;
      const configured = await call("/api/music/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "gateway",
          url: `http://127.0.0.1:${gateway.address().port}`,
        }),
      });
      assert.equal(configured.status, 200);
      const key = (
        await (await call("/api/music/login/qr/key?channel=qq")).json()
      ).data.unikey;
      assert(
        key.length > 512,
        "sealed QR keys must not be mistaken for short session IDs",
      );
      const oversized = await call("/api/mobile/qq-display", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "x".repeat(16385), channel: "qq" }),
      });
      assert.equal(oversized.status, 400);
      const displayResponse = await call("/api/mobile/qq-display", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, channel: "qq" }),
      });
      assert.equal(displayResponse.status, 200);
      const display = await displayResponse.json();
      assert(!JSON.stringify(display).includes(key));
      cookie = "";
      await login();
      assert.notEqual(cookie, phoneCookie);
      const viewerResponse = await call(
        "/api/mobile/qq-display?code=" + display.code,
      );
      const visible = await viewerResponse.json();
      assert.deepEqual(Object.keys(visible).sort(), [
        "channel",
        "expiresAt",
        "image",
      ]);
      assert.equal(visible.image, qrImage);
      const foreignDelete = await call(
        "/api/mobile/qq-display?id=" + display.id,
        { method: "DELETE" },
      );
      assert.equal((await foreignDelete.json()).removed, false);
      const phonePoll = await call("/api/music/login/qr/check?key=" + key, {
        headers: { Cookie: phoneCookie },
      });
      assert.equal((await phonePoll.json()).code, 803);
      assert(
        (
          await (
            await call("/api/music/login/status", {
              headers: { Cookie: phoneCookie },
            })
          ).json()
        ).data.profile,
      );
      assert.equal(
        (await (await call("/api/music/login/status")).json()).data.profile,
        null,
      );
      assert.equal(
        (
          await call("/api/mobile/qq-display?id=" + display.id, {
            method: "DELETE",
            headers: { Cookie: phoneCookie },
          })
        ).status,
        200,
      );
      assert.equal(
        (await call("/api/mobile/qq-display?code=" + display.code)).status,
        404,
      );
      cookie = phoneCookie;
      assert.deepEqual(
        await (await call("/api/auth/session", { method: "DELETE" })).json(),
        { authenticated: true, mobile: true },
      );
      assert(
        (await (await call("/api/music/login/status")).json()).data.profile,
      );
      assert.equal(
        (await call("/api/mobile/qq-display?code=123456")).status,
        404,
      );
      assert.equal(
        (
          await call("/api/mobile/qq-display", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          })
        ).status,
        400,
      );
      assert.equal(
        (await (await call("/api/voice/config")).json()).keyEditable,
        true,
      );
      const put = (key) =>
        call("/api/settings/minimax", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey: key }),
        });
      const saved = await put("test-mobile-only-key");
      assert.equal(saved.status, 200);
      assert.deepEqual(await saved.json(), { configured: true });
      assert.equal(
        fs.statSync(path.join(dir, "minimax-settings.json")).mode & 0o777,
        0o600,
      );
      assert.equal((await put("invalid key")).status, 400);
      assert.equal(
        (await (await call("/api/voice/config")).json()).configured,
        true,
      );
      await stop();
      await start();
      cookie = phoneCookie;
      await login();
      assert(
        (await (await call("/api/music/login/status")).json()).data.profile,
        "QQ grant survives a server restart without unlocking",
      );
      assert.equal(
        (await (await call("/api/voice/config")).json()).configured,
        true,
      );
      const configText = await (await call("/api/voice/config")).text();
      assert(!configText.includes("test-mobile-only-key"));
      assert.equal(
        (await call("/api/settings/minimax", { method: "DELETE" })).status,
        200,
      );
      await stop();
      await start();
      await login();
      assert.equal(
        (await (await call("/api/voice/config")).json()).configured,
        false,
      );
      await stop();
      const apiKey = "integration-mobile-api-key-".repeat(2);
      await start(true, apiKey);
      assert.equal((await call("/api/voice/config")).status, 401);
      assert.deepEqual(await (await call("/api/auth/session")).json(), {
        authenticated: false,
        apiKeyRequired: true,
      });
      assert.equal(
        (
          await call("/api/auth/session", {
            method: "POST",
            headers: { "X-Api-Key": "wrong" },
          })
        ).status,
        401,
      );
      const grant = await call("/api/auth/session", {
        method: "POST",
        headers: { "X-Api-Key": apiKey },
      });
      assert.equal(grant.status, 200);
      const grantText = await grant.text();
      assert(!grantText.includes(apiKey));
      cookie = grant.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
      const keyPhoneCookie = cookie;
      const qr = await (
        await call("/api/music/login/qr/key?channel=qq")
      ).json();
      const codeResponse = await call("/api/mobile/qq-display", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: qr.data.unikey, channel: "qq" }),
      });
      const pairing = await codeResponse.json();
      assert.match(pairing.code, /^\d{4}$/);
      cookie = "";
      const pair = await call("/api/mobile/qq-display/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: pairing.code }),
      });
      assert.equal(pair.status, 200);
      const pairedImage = await pair.json();
      assert.equal(pairedImage.image, qrImage);
      assert.deepEqual(Object.keys(pairedImage).sort(), [
        "channel",
        "expiresAt",
        "image",
      ]);
      const pairCookie = pair.headers.getSetCookie().join("; ");
      assert(pairCookie.includes("HttpOnly"));
      assert(pairCookie.includes("Path=/api/mobile/qq-display/view"));
      assert(!pairCookie.includes("soundisle_session="));
      cookie = pair.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
      assert.equal((await call("/api/mobile/qq-display/view")).status, 200);
      assert.equal((await call("/api/voice/config")).status, 401);
      assert.equal(
        (await call("/api/mobile/qq-display", { method: "DELETE" })).status,
        401,
      );
      assert.equal(
        (await call("/api/mobile/qq-display?code=" + pairing.code)).status,
        401,
      );
      cookie = keyPhoneCookie;
      await call("/api/mobile/qq-display?id=" + pairing.id, {
        method: "DELETE",
      });
      assert.equal(
        (
          await call("/api/mobile/qq-display/view", {
            headers: { Cookie: pairCookie },
          })
        ).status,
        404,
      );
      for (const path of [
        "/api/music/config",
        "/api/voice/config",
        "/api/agent/config",
      ])
        assert.equal((await call(path)).status, 200);
      await call("/api/auth/session", { method: "DELETE" });
      assert.equal((await call("/api/voice/config")).status, 401);
      await stop();
      await start(false);
      assert.equal((await call("/api/voice/config")).status, 401);
      await login();
      assert.equal(
        (await call("/api/settings/minimax", { method: "DELETE" })).status,
        403,
      );
      assert.equal(
        (await (await call("/api/voice/config")).json()).keyEditable,
        false,
      );
    } finally {
      await stop();
      await new Promise((resolve) => gateway.close(resolve));
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
);
