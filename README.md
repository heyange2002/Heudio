# Heudio / 声屿 SoundIsle

以音乐和轻陪伴为核心的个人应用。暖黑琥珀 UI、四种场景、环形律动、同步歌词、伴侣对话、自然声混音、专注/睡眠定时与日程管理。

## 前后端分离

```text
浏览器 / 未来 PC、Android 客户端
  → Heudio 应用后端（Node.js，端口 3001）
    → qq-music-api 3.3.5（独立 Node 服务，端口 3200）
    → Open-Meteo（天气）
    → 配置的 OpenAI 兼容模型服务
```

前端不直连 QQ API，不读取 QQ token 或模型 Key。QQ 音频通过后端 Range 代理播放，歌词和试听标记由接口返回。

## 本地启动

需要 Node.js 22+，推荐 Node.js 24。

```sh
npm ci
npm run dev
```

打开 http://127.0.0.1:5173 。该命令同时启动前端、应用后端和 QQ API。前端开发服务把 `/api/` 转发给后端，不需要浏览器跨域配置。

在“音乐库 → 连接与账号”保存并验证 `/api/v1`，再选择实际返回的扫码方式登录。未登录或上游不可达时，仍可使用三首原创合成试听与本地音频。

可单独启动：

```sh
npm run dev:music
npm run dev:backend
npm run dev:frontend
```

## Docker 部署

```sh
cp .env.example .env
docker compose up --build -d
```

打开 http://127.0.0.1:8080 。默认只有前端绑定本机端口，后端与 QQ API 仅在容器网络互通。正式服务器的域名、HTTPS 和外网入口配置见 [部署指南](docs/部署指南.md)。

模型配置在后端环境中完成，前端仅选择允许的模型。复制 `backend/.env.example` 为 `backend/.env`，设置 `LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODELS`；Docker 使用根目录 `.env`。

## 目录

```text
frontend/public/           前端源文件与试听资源
frontend/dist/             静态构建输出（忽略）
backend/src/               应用 API、QQ 适配、模型与天气转发
backend/test/              后端 HTTP 集成测试
services/qq-music-api/     固定版本的 QQ API 启动入口
scripts/                   本地三服务启动与前端构建
deploy/                    Dockerfile 与 Nginx 反向代理
compose.yaml               三服务部署配置
tests/                     前端适配与声景回归测试
docs/                      产品、接口、部署、验证与预览
```

## 检查与构建

```sh
npm test
npm run build:frontend
```

前端静态产物位于 `frontend/dist/`。独立域名部署时修改 `frontend/public/runtime-config.js` 的 `apiBase`，并在后端设置对应 `WEB_ORIGINS`。优先选择同站点 `/api/v1` 反代，避免第三方 Cookie 限制。

## 当前边界

- QQ API 是非官方上游，搜索、扫码和播放受网络、账号及上游行为影响；接入不代表绕过歌曲权限。
- 应用会话暂存后端内存，刷新页面可继续使用 Cookie，后端重启需重新扫码。暂不支持多实例共享会话。
- 日程、偏好、歌词覆盖和本地音乐仍保存在当前浏览器；没有账号同步数据库。
- PC/Android 封装、设备日历读取和原生后台播放仍是下一阶段。
- 浏览器语音识别、系统朗读和 Web Audio 声景保留在客户端。

## 文档

- [完整产品文档](docs/声屿-产品完整文档.md)
- [部署指南](docs/部署指南.md)
- [API 接口说明](docs/接口说明.md)
- [验证说明](docs/验证说明.md)
- [真实三服务联调预览](docs/前后端联调预览.png)
- [素材与上游来源](SOURCES.md)
