# 通信访问控制与加密

本说明适用于当前目录中的 React/Express SoundIsle，不是另一个已拆分的 Heudio 网关目录。

## 配置与启动

1. 将 `.env.example` 复制为 `.env`，填入 `APP_ACCESS_KEY`（至少 32 字符）。可以运行 `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` 生成随机 Key。
2. 运行 `npm install`，然后 `npm run dev`。开发默认仅监听 `127.0.0.1:3000`。
3. 打开页面输入 Key。Key 不写入前端构建、不放入 URL 或浏览器持久存储。会话存于服务内存，Cookie 为 HttpOnly、SameSite=Strict，默认一小时到期；重启需要重新登录。

## HTTPS

生产配置 `NODE_ENV=production`、`TLS_CERT_PATH`、`TLS_KEY_PATH`，使用受客户端信任的证书，运行 `npm run build` 后 `npm start` 启动（需要支持 TypeScript 类型剥离的 Node.js 24，生产环境提供构建后的静态文件）。不要设置 `NODE_TLS_REJECT_UNAUTHORIZED=0`。

也可以在同一台主机使用 HTTPS 反向代理，应用保持 `HOST=127.0.0.1`，配置 `TRUST_LOOPBACK_PROXY=true`。代理必须覆盖客户端传入的 `X-Forwarded-Proto`，设置为实际 `$scheme`，保留原始 Host；后端端口不要直接暴露。

生产 API 拒绝 HTTP。开发 HTTP 只允许回环客户端，用于本机调试，开发 HTTP 本身不提供传输加密。当前为同源部署，不授予跨域请求权限。

## 机制与边界

- 所有 `/api` 请求经过访问控制。Key 使用 SHA-256 摘要定时比较；每来源每分钟最多尝试五次。
- Key 登录后换取随机会话 Cookie；支持锁定退出、失效后重新解锁。
- 应用数据和响应通过 TLS 加密。不自行实现浏览器对称密钥或自制加密协议。
- 同一 Key 的所有使用者共享访问权限，暂不是多用户账号系统。会话只支持单实例内存存储。
- 修改 Key 后重启服务，使旧会话失效。

## 检查

`node --test tests/security.test.mjs` 验证 Key、会话到期/退出、限流、来源检查及 HTTPS 强制策略。浏览器功能可用时需进一步验证真实证书的 HTTPS 访问。
