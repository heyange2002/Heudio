# 来源与参考

## 当前音乐后端

用户指定 [yakult-green-tea/qq-music-api](https://github.com/yakult-green-tea/qq-music-api)。本项目依赖 npm `@yakult-green-tea/qq-music-api@3.3.5`，固定在锁文件中，独立启动 Node 宿主，没有复制其实现源码。

接口核对基于上游 `main` 提交 `3c182fa6544ddcdc907755ec35b7e394d28f9b82` 的 README、使用文档及搜索、扫码、播放、歌词相关操作/测试。Node 已安装并实跑的包版本为 3.3.5。

上游标注 MIT License，同时 README 包含学习使用和非商业用途说明；发布与使用前应阅读其 [README](https://github.com/yakult-green-tea/qq-music-api) 和 [LICENSE](https://github.com/yakult-green-tea/qq-music-api/blob/main/LICENSE)。第三方接口不代表官方授权或任意歌曲可播放。

## UI 与交互

用户提供的 SoundIsle 参考项目：顶部导航、伴侣对话、封面律动、独立歌词、底部播放器和自然声混音。四张 JPG 封面来自用户提供的该项目。未改写原参考文件夹；未把其固定天气或假定模型状态当成真实服务。

## Folia

[Folia](https://github.com/chthollyphile/folia-major) 用作沉浸歌词和音乐来源设计参考，早期核对提交 `f96c65b27f7ca351e8db781301cedfa0a52252e2`。当前 UI、动画和应用适配独立实现，没有合入 Folia 源码、品牌或截图。Folia 标注 AGPL-3.0；未来实际引入其实现时应另行处理相应许可与署名。

## 其他

天气数据使用 [Open-Meteo](https://open-meteo.com/)，保留 CC BY 4.0 署名。免费服务用于当前个人非商业原型。三首内置 WAV 为本项目原创合成器乐，五层自然声为 Web Audio 实时氛围模拟。
