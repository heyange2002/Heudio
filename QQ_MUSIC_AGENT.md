# 阿屿 · QQ 音乐陪伴 Agent

阿屿是一位温暖、懂分寸的 AI 音乐陪伴者：先听用户的感受，再给具体回应，不说教、不编造共同经历。人设与工具定义在 `cloudflare/companion.mjs`，Express 与 Workers 共用。

## 使用

1. 解锁应用，打开首页「QQ 音乐 → 配置与账号授权」。默认使用内置服务，无需额外部署。选择手机 QQ 或微信，用对应 App 扫码并在手机上确认。
2. 也可选择自建服务，填写运行 [yakult-green-tea/qq-music-api](https://github.com/yakult-green-tea/qq-music-api) 的 HTTPS 地址，保存后重新授权。本机 Express 可连接 `http://localhost:3200`。通道由服务实际能力决定；QQ 音乐 App 扫码需支持 MQTT 的 Node 服务或中继，内置服务提供手机 QQ / 微信通道。
3. 搜索歌曲、读取每日推荐、我喜欢和个人歌单。点击歌曲播放，或把查询结果组成播放队列。
4. 展开「认识彼此」，填写称呼、城市、工作状态、音乐偏好；然后告诉阿屿想听什么，或点击「让阿屿为此刻编排」。

## 对话与语音流程

用户消息 → MiniMax M3（人设、最近12条对话、偏好、真实时间、天气、最近15首成功播放记录）→ 按需调用QQ搜索/每日推荐/喜欢的歌曲 → 从真实结果中编排队列 → 生成最终中文回复 → 显示文字及队列 → MiniMax TTS 合成该回复 → 播放语音。

工具最多4轮、每轮最多4次调用，整体模型请求60秒超时。模型不能编造歌曲MID；队列中的每首歌必须来自本轮工具查询结果。队列保存在当前应用，不写入QQ账号。点击队列歌曲后，后端获取播放链接，浏览器播放实际音乐，并尝试加载LRC歌词。音乐无法取链时明确提示，不用合成音乐伪装QQ歌曲。

语音播放期间音乐降低至原音量25%，结束后恢复。支持自动朗读、手动朗读、静音、取消、停止及浏览器阻止自动播放后的手动继续。模型失败时清楚标注规则回复。

## 记忆和天气

称呼、城市、偏好和成功播放的最近15首歌曲保存在本机浏览器，可清除。最近对话仅保留在当前页面，刷新后重置；暂不自动提取或永久保存推断出的个人特征。

时间来自当前设备与服务端真实时钟；天气在用户填写城市后通过 Open-Meteo 查询，缓存10分钟。城市未填写或查询失败时明确使用未知状态，不假造天气。天气来源：[Open-Meteo](https://open-meteo.com/)，地理编码来源 GeoNames。

## 服务端配置与存储

- `MINIMAX_API_KEY`：M3与语音共用，仅在后端。
- `QQ_MUSIC_API_URL`：可选，作为初始自建服务地址；界面保存的连接配置优先。
- `QQ_SESSION_SECRET`：可选覆盖值。未设置时，应用自动生成并保存稳定的独立加密密钥。不要轮换密钥来解决普通网络问题。
- Express 使用被Git忽略的 `.data/music-state.json`，目录权限700、文件600。包含连接配置、加密密钥和QQ会话，部署时应持久化并保护该目录。
- Workers 使用 `MUSIC` / `MusicStore` Durable Object，迁移 `v2-music`；自动生成的密钥与配置跨实例保存。
- QQ会话按当前声屿登录会话隔离，仅保存在后端；不把QQ token、Cookie返回前端或送给语言模型。声屿锁定会话到期后重新解锁需要重新授权QQ。
- 同一私人应用共用音乐服务连接配置；不是多租户设置系统。更换连接或退出QQ后清除当前QQ会话。上游sealed会话的退出限制以所用API项目说明为准。

## 校验与边界

使用固定依赖 `@yakult-green-tea/qq-music-api@3.3.5` 的 `/serverless` 入口，不导入会启动Koa服务的包根入口。

```sh
npm run lint
npm run test:music
npm run test:music-runtime
npm run test:companion
npm run test:ui
npm run test:security
node --test tests/cloudflare-auth.test.mjs
npm run test:speech
npm run test:speech-runtime
npm run cf:check
```

内置服务保留该项目的上游网络、账号权限和取链限制。匿名搜索可能为空；播放和个人推荐需要授权。实际账号扫码和成功播放需用户在手机上确认，自动检查不会替用户授权QQ账号。

## 3.3.5 浏览器扫码兼容修复

该版本在生成任何扫码会话前都会调用 Android QIMEI / GetSession；浏览器 QQ 和微信二维码本身不依赖这一步。`scripts/patch-qq-music-api.mjs` 将浏览器通道的 Android 初始化延后到用户扫码确认后、签发 QQ 会话前，MQTT 通道保留原流程。修复覆盖 ESM / CommonJS，绑定3.3.5并校验替换位置；`npm ci` 的 postinstall 自动应用，升级依赖时必须复查。

本次已实际获取手机QQ的PNG二维码、微信的JPEG二维码，扫码前不再因音乐接口连接重置而无法显示。扫码后仍须访问QQ音乐换取凭证；当前网络对 `u.y.qq.com` 的请求出现连接重置，因此完整账号授权和歌曲取链仍需在可达网络中验证，不能把二维码可见当成授权完成。
