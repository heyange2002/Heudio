# Cloudflare Workers 部署

当前目录为 SoundIsle React/Express 伴侣应用。Workers 入口在 `cloudflare/worker.mjs`，包含 Key 登录、持久会话、阿屿 Agent、QQ 音乐内置 API 与 MiniMax 语音。配置与授权见 [QQ 音乐 Agent](./QQ_MUSIC_AGENT.md)。

## 结构

- Cloudflare 提供 HTTPS；后端不读取本机证书文件。
- APP_ACCESS_KEY、MINIMAX_API_KEY 是 Workers Secret，不进入前端。
- MiniMax M3 陪伴与语音输出共用 Secret `MINIMAX_API_KEY`，详见 [语音配置](./MINIMAX_SPEECH.md)。配置检查与合成接口均要求登录。
- AuthStore Durable Object 保存会话与 Key 尝试次数，支持实例重建。修改 Key 后旧会话失效。
- 默认同源部署，同时上传 dist 前端以供登录与验证，避免跨站 Cookie 问题。前端与后端源码仍分离。
- 未配置模型时返回明确带 `mode=local` 的本机规则结果。配置模型需提供 MINIMAX_API_KEY，陪伴模型固定为 MiniMax-M3。

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

APP_ACCESS_KEY 应为随机生成的4位数字访问码，按字符串保存以保留前导0。在 Secret 的交互提示中输入，不放在 shell 参数中。首次发布但 Secret 尚未配置时，所有受保护 API 拒绝访问。迁移格式时用 `wrangler deploy --secrets-file` 将新代码与访问码一同发布，避免中途格式不兼容。

可选模型：

```sh
npx wrangler secret put MINIMAX_API_KEY
```

最终域名以 Wrangler 实际返回的 workers.dev URL 为准，不预先编造。发布后先访问 `/api/health`，再打开同域根路径并用 Key 解锁，验证模型/本机规则回复和锁定退出。

## 边界

本地 `.env` 的密钥不会自动上传到 Cloudflare。Cloudflare 账户须有 Workers、Durable Objects 权限；运行费用和配额取决于账户套餐。不要使用未授权的临时账户代替用户账户发布。

内置 QQ API 使用 serverless 入口和手机 QQ 网页扫码 / 微信扫码。QQ 音乐 App 的 MQTT 登录可通过自建 Node 网关使用；当前未配置 MQTT 中继。

## 本次发布结果（2026-11-03）

部署地址：https://soundisle-backend.kevinwill-zhang.workers.dev

APP_ACCESS_KEY 已通过 Secret 上传，本机副本在被忽略的 `.dev.vars`，文件权限为 600。不要把这个文件提交到 Git。GEMINI_API_KEY / GEMINI_MODEL 尚未配置，当前为本机规则模式。

本地真实 Workers 运行器的健康检查、未登录拒绝、Key 登录、受保护聊天、退出验证已通过。Wrangler 已确认云端发布和 Secret 上传成功；从当前网络访问 workers.dev 域名连接超时，因此线上 HTTP 联调尚未完成。

此前 Cloudflare 控制面确认版本 `4acdcf2c-e756-4708-8735-4f882e5b087d` 为 100% 流量，APP_ACCESS_KEY 为 secret_text。

## 封面与导航修复

四张内置 JPG 通过 Vite 资源导入打包，不再使用生产环境失效的 /src 路径。封面缺失或加载失败时随机选取内置图片，同一曲目在大封面与底部播放器保持一致。

心境感知、声音律动、沉浸歌词菜单切换实际视图；手机端提供导航入口。歌词自动滚动限于歌词容器，不带动整页。

两项 DOM 组件交互回归、七项安全/持久会话检查、类型检查、生产构建和四张封面产物引用检查全部通过。Cloudflare 发布版本：4acdcf2c-e756-4708-8735-4f882e5b087d。

## MiniMax 语音更新（2026-11-03）

发布版本：`4970027e-3519-46ff-9caf-a73d2337cee5`，Wrangler 已确认上传前端与 Worker 并激活触发器。支持三种中文音色、两种模型、语速控制、自动朗读开关、取消与停止；浏览器拒绝自动播放时可点击继续。

类型检查、生产构建、Worker 打包、18项自动检查与本机 Express 登录/语音接口 HTTP 验证通过。此次检查云端 Secret 仅有 APP_ACCESS_KEY，MINIMAX_API_KEY 尚未配置，未进行真实 MiniMax 付费调用或音色试听。请按 [MiniMax 语音配置](./MINIMAX_SPEECH.md) 添加 Secret 后验证。

## MiniMax 502 修复（2026-11-03）

Cloudflare workerd 运行器复现了 `redirect: 'error'` 的不兼容异常，原先会在连接 MiniMax 之前返回502。现改为 `manual`，显式拒绝3xx；异常JSON响应也使用独立错误提示。增加真实运行器回归检查，20项检查、类型检查与构建通过。

Cloudflare 发布版本：`34b0089a-5d1d-4f33-957a-643eef83b039`，使用 `--keep-vars` 保留面板变量。第一次发布因管理接口读取元数据失败中断，重试已成功。当前网络无法访问应用域名，尚未验证云端真实音频返回。

发布工具发现 MINIMAX_API_KEY 被配置为普通变量并在配置差异中回显。用户选择自行在供应商平台轮换该Key，再保存为 Cloudflare Secret。自动迁移旧Key未执行，本机发布日志中的明文Key已脱敏。不要将含凭据的日志纳入 Git。


## MiniMax M3 陪伴模型（2026-11-03）

Express 与 Workers 共用 `cloudflare/companion.mjs`，使用 MiniMax 国内 OpenAI 兼容接口和 `MiniMax-M3`。默认选择 M3，设置页通过受保护的 `/api/agent/config` 检查密钥是否存在；选择离线引擎后不发起模型调用。状态只表示密钥存在，不代表权限或余额已验证。上游超时或输出无效时返回 `mode=local` 与通用原因。

与语音共用 `MINIMAX_API_KEY`，无需额外 Gemini 配置。用户输入会发送给 MiniMax，按用量计费。密钥保留在后端，不写入前端或源码。接口参考：https://platform.minimax.cn/docs/api-reference/text-openai-api 。

本次核查线上没有 Gemini 配置，已有 MiniMax Key；使用现有 Key 对 M3 的一次真实请求成功返回 `mode=model`。已发布版本 `c54004dc-c573-4ef3-a76c-7f01b06899e1`，Cloudflare 控制面确认 100% 流量，线上代码包含 M3 与配置检查接口。类型检查、生产构建、Worker 打包及25项回归检查通过。当前网络访问 workers.dev 超时，尚未完成线上页面端到端验证。


## 阿屿与 QQ 音乐（2026-11-03）

发布版本 `f778ab3a-ecfd-40a7-a0f6-cd7de1af7213`，控制面确认100%流量，已建立 MUSIC / MusicStore Durable Object。包括人设、近期上下文与偏好、真实天气、音乐工具调用、QQ配置/授权/搜索/个人曲库、实际音频播放和模型回复后的语音输出；移除底部设计守则区。

36项自动检查、类型检查、构建与Worker打包通过。已真实验证模型回复后请求语音，返回200 audio/mpeg、73716字节；实际获取QQ和微信二维码。本机浏览器确认QQ二维码可见。QQ音乐上游 `u.y.qq.com` 当前网络连接重置，尚未验证完整扫码授权和实际账号歌曲取链；不将此状态视作授权成功。
