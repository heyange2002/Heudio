# MiniMax 语音输出

已用 MiniMax 替换浏览器系统朗读。Express 与 Cloudflare Workers 复用后端实现，网页版沿用访问 Key 登录、同源 Cookie 和 HTTPS；PC 版直接进入，使用本地同源会话。已保存的 MiniMax API Key 不会通过配置接口返回页面。

## 配置

PC 版：打开「设置 → 音乐与语音 → MiniMax API Key」，填写并保存，即刻生效；可替换或移除，重启后保留。保存仅表示配置完成，需成功调用才能确认 Key 权限及账户额度。

本机 Express 网页版：在被 Git 忽略的 `.env` 中设置 `MINIMAX_API_KEY`，重启 `npm run dev`。原有 `APP_ACCESS_KEY` 仍为必填。

本机 Workers：在被忽略的 `.dev.vars` 中添加 `MINIMAX_API_KEY`，运行 `npm run cf:dev`。

线上 Cloudflare：打开 Workers & Pages → soundisle-backend → Settings → Variables and Secrets，添加 **Secret** `MINIMAX_API_KEY`。也可在本目录执行以下交互命令，按提示输入密钥：

```sh
npx wrangler secret put MINIMAX_API_KEY
```

不要把密钥发到聊天、写入源码、使用 `VITE_` 变量或作为命令参数传入。配置更新后，在应用「设置 → 音乐与语音 → 语音陪伴服务」确认显示「MiniMax 已配置」。该状态仅代表存在密钥；需成功朗读才能确认账户权限、额度及上游连通性。

## 使用

- 默认 `speech-2.8-hd`、温暖闺蜜、0.95 倍语速；可改用快速模型、温柔学姐或温润男声，语速范围 0.8～1.2。
- 合成音量设为 `vol: 5`（初始为 `1`，上一版为 `2`），提升 Agent 语音响度；播放器使用 100% 音量，朗读时背景音乐限制在 5%，结束后恢复。新音量对后续生成的语音生效。
- 新回复自动朗读，可关闭自动朗读后点击消息喇叭按需收听；静音模式不生成语音。
- 生成中点击可取消，播放中点击可停止；切换音色、静音或退出页面会取消待处理音频并释放资源。
- 浏览器限制自动播放时，已生成音频保留在内存，点击「播放语音」继续，不重复调用付费接口。
- 失败或未配置时显示原因，不回退到系统朗读；文字聊天仍可正常使用。
- 当前语音偏好随页面刷新重置。每次合成最多1500字符，45秒超时；短回复一次生成 MP3，尚未实现流式首包播放。
- 点击取消会中止本应用的请求；MiniMax 已收到的合成任务仍可能计费。

## 接口与验证

登录后可用 `GET /api/voice/config` 检查配置状态，`POST /api/voice/synthesize` 提交 `{ text, model, voiceId, speed }`，成功返回 `audio/mpeg`，失败返回 JSON。请求需带 `X-Soundisle-Client: web` 并使用当前登录 Cookie；两个接口都要求登录。模型与音色使用允许列表，响应不缓存，不返回供应商密钥或原始错误详情。

```sh
npm run lint
npm run build
npm run test:speech
npm run test:speech-runtime
npm run test:ui
node --test tests/security.test.mjs tests/cloudflare-auth.test.mjs
```

自动检查覆盖接口请求/音频转换、输入校验、错误处理、取消、鉴权、过期响应与自动播放限制。真实音色效果及付费调用需要配置有效 MiniMax Key 后试听。

## Cloudflare 502 排查

Workers 不支持 `fetch` 的 `redirect: 'error'`，会在请求上游前抛错；本实现使用 `manual` 并显式拒绝 3xx，不向跳转目标转发密钥。运行器测试直接在 workerd 中构造实际请求，验证此兼容性。

`npm run cf:deploy` 使用 `--keep-vars` 保留在 Dashboard 配置的变量。密钥仍建议保存为 Secret；发布不会删除已有 Secret。出现「暂时无法连接」也可能是网络异常，不能仅凭这句通用提示认定密钥无效。

官方资料：[同步语音接口](https://platform.minimax.cn/docs/api-reference/speech-t2a-http)、[系统音色](https://platform.minimax.cn/docs/faq/system-voice-id)、[计费](https://platform.minimax.cn/docs/pricing/overview#models/speech)。语音合成按量计费，朗读文字会发送至 MiniMax；模型及价格以平台实际可用项为准。
