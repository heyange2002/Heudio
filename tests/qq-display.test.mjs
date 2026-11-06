import test from "node:test";
import assert from "node:assert/strict";
import { createQQDisplayStore } from "../qq-display.mjs";
const image = "data:image/png;base64,aGVsbG8=";
test("a separate screen sees only the QR image; replacement, owner cleanup and expiry revoke its display code", () => {
  let clock = 1000;
  const store = createQQDisplayStore({ now: () => clock });
  const first = store.create("phone", image, "qq");
  assert.match(first.code, /^\d{6}$/);
  assert.match(first.id, /^[a-f0-9]{32}$/);
  assert.deepEqual(store.read("computer", first.code), {
    image,
    channel: "qq",
    expiresAt: 121000,
  });
  assert.equal(store.remove("computer", first.id), false);
  const next = store.create("phone", image, "qq");
  assert.throws(() => store.read("computer", first.code), /结束或过期/);
  assert.equal(store.remove("phone", first.id), false);
  assert.equal(store.remove("phone", next.id), true);
  assert.throws(() => store.read("computer", next.code), /结束或过期/);
  const last = store.create("phone", image, "qq");
  clock += 120000;
  assert.throws(() => store.read("computer", last.code), /结束或过期/);
});
test("display codes reject non-image content, bound attempts and reset the limit without sharing auth credentials", () => {
  let clock = 0;
  const store = createQQDisplayStore({ now: () => clock });
  assert.throws(
    () => store.create("phone", "data:image/svg+xml;base64,aGVsbG8=", "qq"),
    /图片格式/,
  );
  assert.throws(() => store.create("phone", image, "unknown"), /扫码方式/);
  const item = store.create("phone", image, "qqmusic");
  for (let i = 0; i < 10; i++)
    assert.throws(() => store.read("viewer", "wrong"), /结束或过期/);
  assert.throws(() => store.read("viewer", item.code), /尝试次数/);
  clock += 60000;
  assert.equal(store.read("viewer", item.code).channel, "qqmusic");
});
