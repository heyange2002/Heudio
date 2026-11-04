# 声屿 SoundIsle

React 音乐伴侣：内置「阿屿」陪伴 Agent，通过 QQ 音乐搜索和个人推荐编排播放队列，结合时间、天气、音乐偏好与工作状态选歌，并用 MiniMax 语音交流。

## 本机运行

需要 Node.js。安装依赖 `npm ci`，复制 `.env.example` 为 `.env`，设置4位数字的 `APP_ACCESS_KEY`，运行 `npm run dev`。默认访问 http://127.0.0.1:3000 并使用访问码解锁，支持以0开头。

陪伴模型使用 MiniMax M3，与 MiniMax 语音共用后端 MINIMAX_API_KEY。未配置或模型调用失败时使用规则回复；设置页显示配置状态，选择离线引擎时不调用模型。

- [阿屿与 QQ 音乐配置、授权及使用](./QQ_MUSIC_AGENT.md)
- [MiniMax 语音配置与使用](./MINIMAX_SPEECH.md)
- [访问 Key 与 HTTPS](./SECURITY_SETUP.md)
- [Cloudflare 部署](./CLOUDFLARE_DEPLOY.md)

密钥应保存在被忽略的环境文件或 Cloudflare Secrets 中，不进入前端源码。
