# Cloudflare Workers 部署

当前目录为 SoundIsle React/Express 伴侣应用。Workers 入口在 `cloudflare/worker.mjs`，包含 Key 登录、持久会话和 `/api/agent/chat`。它不包含之前另一目录中 Heudio 的 QQ 音乐网关；不能把本次部署当作 QQ Node 服务迁移完成。

## 结构

- Cloudflare 提供 HTTPS；后端不读取本机证书文件。
- APP_ACCESS_KEY、GEMINI_API_KEY 是 Workers Secret，不进入前端。
- AuthStore Durable Object 保存会话与 Key 尝试次数，支持实例重建。修改 Key 后旧会话失效。
- 默认同源部署，同时上传 dist 前端以供登录与验证，避免跨站 Cookie 问题。前端与后端源码仍分离。
- 未配置模型时返回明确带 `mode=local` 的本机规则结果。配置模型需提供 GEMINI_API_KEY 和 GEMINI_MODEL，不猜测可用模型 ID。

## 发布前检查

```sh
npm ci
npm run lint
npm run test:security
node --test tests/cloudflare-auth.test.mjs
npm run cf:check
```

## 账户授权与发布

```sh
npx wrangler login
npm run cf:deploy
npx wrangler secret put APP_ACCESS_KEY
```

APP_ACCESS_KEY 应为随机生成的至少32字符密钥。在 Secret 的交互提示中输入，不放在 shell 参数中，也不要发送到聊天。首次发布但 Secret 尚未配置时，所有受保护 API 拒绝访问。

可选模型：

```sh
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put GEMINI_MODEL
```

最终域名以 Wrangler 实际返回的 workers.dev URL 为准，不预先编造。发布后先访问 `/api/health`，再打开同域根路径并用 Key 解锁，验证模型/本机规则回复和锁定退出。

## 边界

本地 `.env` 的密钥不会自动上传到 Cloudflare。Cloudflare 账户须有 Workers、Durable Objects 权限；运行费用和配额取决于账户套餐。不要使用未授权的临时账户代替用户账户发布。

QQ Music API 的 Node MQTT 登录不能随本目录直接上线。若需要 QQ 网关一并迁移，要单独适配它的 serverless 入口、会话和可用扫码通道。

## 本次发布结果（2026-11-03）

部署地址：https://soundisle-backend.kevinwill-zhang.workers.dev

APP_ACCESS_KEY 已通过 Secret 上传，本机副本在被忽略的 `.dev.vars`，文件权限为 600。不要把这个文件提交到 Git。GEMINI_API_KEY / GEMINI_MODEL 尚未配置，当前为本机规则模式。

本地真实 Workers 运行器的健康检查、未登录拒绝、Key 登录、受保护聊天、退出验证已通过。Wrangler 已确认云端发布和 Secret 上传成功；从当前网络访问 workers.dev 域名连接超时，因此线上 HTTP 联调尚未完成。

Cloudflare 控制面已确认当前激活版本 `4acdcf2c-e756-4708-8735-4f882e5b087d` 为 100% 流量，APP_ACCESS_KEY 为 secret_text。

## 封面与导航修复

四张内置 JPG 通过 Vite 资源导入打包，不再使用生产环境失效的 /src 路径。封面缺失或加载失败时随机选取内置图片，同一曲目在大封面与底部播放器保持一致。

心境感知、声音律动、沉浸歌词菜单切换实际视图；手机端提供导航入口。歌词自动滚动限于歌词容器，不带动整页。

两项 DOM 组件交互回归、七项安全/持久会话检查、类型检查、生产构建和四张封面产物引用检查全部通过。Cloudflare 发布版本：4acdcf2c-e756-4708-8735-4f882e5b087d。
