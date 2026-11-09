# AWS 手机 API 连接

0.2.5 支持在连接服务时填写 API Key。Key 通过 HTTPS 的 `X-Api-Key` 请求头提交到 `/api/auth/session`，验证成功后换取 24 小时的 HttpOnly / SameSite Cookie。搜索、语音、Agent、QQ 配置及原生后台播放都必须有有效会话；Key 不写入 APK、网页存储、URL 或日志。会话过期、后端重启或 Key 轮换后需要重新填写。原有 QQ 设备标识会保留。

## 服务配置

在 AWS 服务的环境文件中设置 `MOBILE_API_KEY`（32–256 个可打印、无空格 ASCII 字符，建议使用密码学随机生成的 32 字节十六进制字符串）。它与 AWS IAM 凭据、MiniMax Key 和原来的 4 位访问码不同。请在服务器的受限环境文件或现有私有运行配置中管理，不要提交到仓库。

已有 PC 网页服务可保留 `APP_ACCESS_KEY` 和原有部署模式，增加 `MOBILE_API_KEY` 后同时支持手机 Key 换取会话。专用手机服务使用 `SOUNDISLE_MOBILE=true`；生产环境未配置 Key 会拒绝启动。无 Key 直接进入仅保留给开发环境的回环本机连接。

仓库的 AWS 部署使用 CloudFront → Nginx → EC2 Node 服务。更新服务代码、设置环境变量并重启后，需要确认：

- CloudFront 的 `/api/*` 允许 POST、PUT、DELETE 等所需方法，不缓存响应，转发 Cookie、Origin、Content-Type、`X-Api-Key` 和 `X-Soundisle-Client`。
- Nginx 保留请求头和 Cookie，并设置正确的 Host、X-Forwarded-Proto；保留已有 CloudFront 到源站的访问限制。
- 服务通过 HTTPS 访问；现有回环反向代理部署使用 `TRUST_LOOPBACK_PROXY=true`。不对公网开放 Node 端口。
- 无会话请求 `/api/music/config`、`/api/voice/config`、`/api/agent/config` 等应返回 401；错误 Key 应返回 401，正确 Key 才返回 HttpOnly 会话。`GET /api/auth/session` 仅公开是否需要 Key 的连接状态。

更换 `MOBILE_API_KEY` 并重启服务会使旧会话失效。API Key 仍是持有者凭据，需要分别向可信设备提供；它不等同于独立用户登录或每设备权限系统。

## 当前部署

2026-11-09 已更新 AWS 服务。手机服务地址为 `https://music.kwill.cc.cd`，备用地址为 `https://dqs1l7x3d1eg8.cloudfront.net`；它们的 Cookie 空间独立，建议固定使用正式域名。电脑显示页为 `https://music.kwill.cc.cd/mobile/qq-display`。

连接 Key 在本机 `.data/aws/mobile-api-key` 私有文件中保存（0600，不进入 Git），云端使用受限运行配置。公网验证已覆盖无会话 / 错误 Key 返回 401、正确 Key 返回 200、HttpOnly / Secure Cookie、撤销后重新拒绝，以及 PC 首页内容保持不变。`node aws/verify-mobile-api.mjs` 可复测，验证过程不输出 Key。

## 手机操作

在安卓连接页面输入 AWS 的 HTTPS 服务地址，连接后按提示填写服务 API Key。连接成功后直接进入主界面，设置中仍没有「锁定访问」入口。更换地址可从系统返回菜单选择「更换服务」。电脑二维码显示页不需要 API Key。手机生成随机 4 位配对码（保留前导零），电脑输入后获得两分钟内有效的二维码显示 Cookie；一张码只能配对一台电脑，且 Cookie 不能访问其他 API。手机刷新二维码、关闭授权页、完成授权或配对到期都会撤销显示。

## 验证

`npm run test:security` 覆盖缺失 / 错误 Key、Cookie 会话、过期、Key 轮换、TLS 和来源限制。`npm run test:mobile` 覆盖真实 Node 服务的 Key 握手、受保护接口及会话撤销。浏览器端另验证错误 Key 不进入、正确 Key 进入、刷新保持会话，以及 Key 不写入网页存储。

## 0.2.6 配对显示更新

`POST /api/mobile/qq-display/pair` 只用请求体中的 4 位配对码验证，成功后设置 HttpOnly / Secure / SameSite Cookie，路径限定为 `/api/mobile/qq-display/view`。`GET` 该路径只返回二维码图片、通道和到期时间。这两个精确路径不要求 API Key，但仍检查 HTTPS 和同源请求；创建 / 删除二维码、音乐、语音及配置接口继续要求有效 API 会话。配对有来源和全局尝试次数限制。
