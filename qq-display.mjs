import { randomBytes, randomInt } from "node:crypto";

const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
// Only the QR image crosses screens. The QQ key and auth cookies remain on the initiating device.
export function createQQDisplayStore({ now = Date.now, ttl = 120000 } = {}) {
  const entries = new Map(),
    attempts = new Map();
  const prune = () => {
    for (const [code, item] of entries)
      if (item.expiresAt <= now()) entries.delete(code);
    for (const [viewer, item] of attempts)
      if (item.until <= now()) attempts.delete(viewer);
  };
  return {
    create(owner, image, channel) {
      prune();
      if (
        typeof image !== "string" ||
        image.length > 256000 ||
        !/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(image)
      )
        fail(502, "二维码图片格式无效");
      if (!["qq", "wechat", "qqmusic"].includes(channel))
        fail(400, "请选择有效的扫码方式");
      for (const [code, item] of entries)
        if (item.owner === owner) entries.delete(code);
      if (entries.size >= 100) fail(503, "显示请求较多，请稍后再试");
      let code;
      do {
        code = String(randomInt(100000, 1000000));
      } while (entries.has(code));
      const item = {
        id: randomBytes(16).toString("hex"),
        owner,
        image,
        channel,
        expiresAt: now() + ttl,
      };
      entries.set(code, item);
      return { id: item.id, code, expiresAt: item.expiresAt };
    },
    read(viewer, code) {
      prune();
      let limit = attempts.get(viewer);
      if (!limit) {
        if (attempts.size >= 1000) fail(503, "服务繁忙，请稍后重试");
        limit = { count: 0, until: now() + 60000 };
        attempts.set(viewer, limit);
      }
      if (limit.count >= 10) fail(429, "显示码尝试次数过多，请一分钟后重试");
      const item =
        typeof code === "string" && /^\d{6}$/.test(code)
          ? entries.get(code)
          : undefined;
      if (!item) {
        limit.count++;
        fail(404, "显示码已结束或过期，请在手机上重新生成");
      }
      return {
        image: item.image,
        channel: item.channel,
        expiresAt: item.expiresAt,
      };
    },
    remove(owner, id) {
      prune();
      for (const [code, item] of entries)
        if (item.id === id && item.owner === owner) {
          entries.delete(code);
          return true;
        }
      return false;
    },
  };
}
