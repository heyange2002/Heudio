# Folia 参考与音乐源协议

本次调整参考 Folia 的产品方向：全屏歌词、流体封面配色、歌词排版动效与统一音乐源。界面、动画及适配器为本项目独立实现，没有并入 Folia 源码或品牌素材，也未移植其完整歌词引擎。

参考仓库：https://github.com/chthollyphile/folia-major
参考提交：f96c65b27f7ca351e8db781301cedfa0a52252e2
参考文件：README.md、docs/technical.md、src/services/onlineMusic/UPSTREAMS.md、网易云/QQ/酷狗适配器、Navidrome 服务及流体背景/歌词舞台实现。

音乐服务：
- 网易云：NeteaseCloudMusicApiEnhanced/api-enhanced，Folia 所用第三方上游。扫码、搜索、歌曲地址、逐词/逐行歌词、歌单、日推。
- QQ：yakult-green-tea/qq-music-api 3.3.3+，搜索、播放、歌单、扫码协议适配。浏览器服务需支持 X-QQ-Session CORS 头；需真实服务验证。歌词可导入本地文件。
- 酷狗：MakcRe/KuGouMusicApi，搜索、歌曲地址和 LRC 歌词协议适配。扫码/私有歌单暂未加入。
- Navidrome：Subsonic REST v1.16.1，MD5(password+salt) 令牌认证；搜索、串流、封面及歌单。密码不保存。
- 本地：沿用 IndexedDB 音频库，增加 LRC/YRC 时间轴导入。内置器乐仍标为原创合成试听。

这些接口适配不等于提供了在线音乐后端。与 Folia 网页版一样，需要自行部署或连接有权使用的实例；在线歌曲可播性由账号、地区、版权及服务决定。不请求或实现付费解锁。跨域音频分析与封面取色需要 CORS，取色失败则保留手选配色。

Folia 原仓库标注 AGPL-3.0。未来如实际引入其代码，应保留许可证、署名，并处理相应源码提供义务；本次不包含其实现或截图素材。

## 用户提供的 SoundIsle 设计

2026-10-29 用户提供本机项目 `用户提供的 SoundIsle 参考项目` 作为 UI 与交互目标。本次据其 TopBar、Companion、Visualizer、Lyrics、PlayerControls 和 AmbientMixer 的结构调整现有应用，复用其四张 JPG 封面。

原参考文件夹未被改写；实际交付代码位于当前站点项目。原示例的固定天气、未验证模型选项、演示歌词与效果性表述未作为真实能力直接迁移。声景通过本项目的 Web Audio 路径生成，暂停/静音/睡眠与主播放器统一控制。
