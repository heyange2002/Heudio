import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const base = process.env.VERIFY_URL || "https://music.kwill.cc.cd";
const key = fs
  .readFileSync(
    process.env.MOBILE_KEY_FILE || ".data/aws/mobile-api-key",
    "utf8",
  )
  .trim();
assert(key.length >= 32);
const call = (path, headers = {}, method = "GET") =>
  fetch(base + path, {
    method,
    signal: AbortSignal.timeout(30000),
    headers: { "X-Soundisle-Client": "web", Origin: base, ...headers },
  });
const home = await call("/");
assert.equal(home.status, 200);
const homeHash = createHash("sha256")
  .update(await home.text())
  .digest("hex");
if (process.env.EXPECTED_HTML_SHA256)
  assert.equal(homeHash, process.env.EXPECTED_HTML_SHA256);
for (const path of [
  "/api/music/config",
  "/api/voice/config",
  "/api/agent/config",
  "/api/music/stream/" + "a".repeat(48),
])
  assert.equal((await call(path)).status, 401);
assert.equal(
  (await call("/api/auth/session", { "X-Api-Key": "incorrect-key" }, "POST"))
    .status,
  401,
);
const auth = await call("/api/auth/session", { "X-Api-Key": key }, "POST");
assert.equal(auth.status, 200);
assert(!JSON.stringify(await auth.json()).includes(key));
const cookies = auth.headers.getSetCookie();
assert(
  cookies.some(
    (c) =>
      c.startsWith("soundisle_session=") &&
      c.includes("HttpOnly") &&
      c.includes("Secure"),
  ),
);
const Cookie = cookies.map((c) => c.split(";")[0]).join("; ");
try {
  for (const path of [
    "/api/music/config",
    "/api/voice/config",
    "/api/agent/config",
  ]) {
    const r = await call(path, { Cookie });
    assert.equal(r.status, 200);
    assert(!(await r.text()).includes(key));
  }
  const viewer = await call("/mobile/qq-display");
  assert.equal(viewer.status, 200);
  assert((await viewer.text()).includes("/mobile/assets/"));
} finally {
  assert.equal(
    (await call("/api/auth/session", { Cookie }, "DELETE")).status,
    200,
  );
}
assert.equal((await call("/api/voice/config", { Cookie })).status, 401);
console.log(
  JSON.stringify({
    url: base,
    homeHash,
    missingKey: 401,
    wrongKey: 401,
    validKey: 200,
    protectedConfigs: 200,
    secureHttpOnlyCookie: true,
    viewer: 200,
    revokedSession: 401,
  }),
);
