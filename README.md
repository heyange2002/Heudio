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

## 播放与听感

歌曲来自 QQ 音乐，已移除内置电子乐生成和自然声景混音。底部「EQ 声场」可调整五段频率（±12 dB）、音色预设与左右平衡，支持关闭处理、恢复原声及本机保存。设置入口位于「只听音乐」旁；专辑区域内可切换环绕 / 频谱动效并关闭动画。

播放器的模式按钮依次切换「顺序播放 → 随机播放 → 单曲循环」。随机模式每轮打乱队列、轮内不重复，上一首按实际听歌历史返回；模式会保存在当前浏览器，也可在设置中选择。
