# AWS 部署

公网入口：https://dqs1l7x3d1eg8.cloudfront.net

部署区域为账户当前允许的悉尼 `ap-southeast-2`。资源清单见 `aws/deployment.json`，首次启动脚本见 `aws/bootstrap.sh`，线上检查脚本见 `aws/verify.mjs`。

## 运行结构

CloudFront 提供浏览器 HTTPS，并将 HTTP 自动跳转到 HTTPS。EC2 t4g.small 运行 Nginx 和 Node.js 24 / Express，systemd 开机启动并在应用退出后自动重启。固定公网 IP 用作稳定回源地址。安全组只允许 CloudFront 的来源地址访问 8080；Nginx 还验证该分发独有的随机请求头。没有开放 SSH。CloudFront 到 EC2 当前使用 HTTP，浏览器到 CloudFront 使用 HTTPS；如需回源全链路 TLS，需绑定自有域名并为源站配置可信证书。

API 和网页均不在 CloudFront 缓存，完整转发 Cookie、Origin、自定义客户端标头和查询参数，保持同源登录及音频请求语义。应用仍要求现有 4 位访问码。访问码仅存在后端，不放入前端构建文件。

发布包存放于私有、加密、强制 TLS 的 S3 桶，未包含 `.env`、`.dev.vars`、Git 历史或本机 `.data`。运行配置单独保存在私有 S3 对象及服务器 `/etc/soundisle/`（600 权限）。本机运行配置副本位于被 Git 忽略的 `.data/aws-runtime.json`。不要输出或提交此文件。

QQ 音乐需要在新域名重新扫码授权。新的 QQ 状态保存在服务器 `/opt/soundisle/.data`，位于加密 EBS 卷，重启服务仍保留；应用登录会话在内存中，重启后需要重新输入访问码。EBS 设置为实例终止后保留；当前为单机部署，没有自动备份或多机容灾。

`MINIMAX_API_KEY` 已从本机 `.env` 安全同步到 AWS 后端运行配置，陪伴模型与语音合成的真实公网调用均已通过。语音识别共用该密钥，本次未进行识别测试。密钥未进入前端或源码。

## 管理和更新

通过 AWS Systems Manager 的 Run Command / Session Manager 管理清单中的实例，无需开放 SSH。

- 状态：`systemctl status soundisle nginx`
- 应用日志：`journalctl -u soundisle --no-pager -n 100`
- 初始化日志：`/var/log/cloud-init-output.log`
- 公网验证：将 `aws/verify.mjs` 上传至实例，使用 root 执行 `node /tmp/verify.mjs`，它只输出状态，不输出访问码或 Cookie。
- 更新：在本机构建，打包 `package.json package-lock.json server.ts security.mjs cloudflare shared scripts dist`，上传私有 S3 发布位置；实例下载解包至应用目录，将云端 lockfile 中的 registry.npmmirror.com 替换为 registry.npmjs.org（保留版本与完整性哈希）后运行 `npm ci --fetch-timeout=60000 --fetch-retries=1`，保留 `.data` 与 `/etc/soundisle`，最后 `systemctl restart soundisle` 并执行公网验证。不要重新运行首次启动脚本更新现有实例。
- 修改 MiniMax 配置：在实例使用安全编辑方式更新 `/etc/soundisle/app.env` 中的 `MINIMAX_API_KEY`，同步私有运行配置，再重启服务。不要将密钥写入命令历史、源码或日志。

## 费用及停止

EC2、16GB gp3 EBS、固定 IPv4、S3、CloudFront 流量会按 AWS 账户费率计费；并未设置免费额度假设。实例设置标准 CPU 积分模式，避免无限突发积分附加费。停止实例后 EBS 和固定 IPv4 仍会计费；彻底下线需停用并删除 CloudFront 分发、终止实例、确认不再需要数据后删除保留卷、释放固定 IP，再清理项目专属桶和 IAM 角色。

## 2026-11-04 验证结果

本地类型检查、生产构建和 6 项访问安全测试通过。CloudFront 控制面状态为 Deployed；已从云端通过真实公网 HTTPS 域名验证：首页 200、JS/CSS 资源 200、未登录接口 401、访问码登录 200、Secure/HttpOnly Cookie、受保护的音乐/语音/模型配置接口 200、规则聊天 200、退出后原会话 401、隐藏配置路径 404。源站不带分发专属标头时返回 403；应用和 Nginx 均启用开机启动。

验证未包含真实 QQ 扫码授权、付费歌曲播放、MiniMax 真实模型和语音调用。首次部署时模型密钥未配置，配置接口当时返回 configured=false；后续配置与验证结果见下方。启动模板默认版本 2 已包含依赖下载源修正，云端已验证同一安装流程。


## 2026-11-04 MiniMax 密钥配置

已更新私有 S3 运行配置、服务器 `/etc/soundisle/runtime.json` 及 `/etc/soundisle/app.env`，均未输出密钥；配置文件权限为 600，应用重启后处于 active 状态。本机 `.env` 与 `.data/aws-runtime.json` 均被 Git 忽略。

通过真实公网 HTTPS 地址验证：模型与语音配置接口均返回 configured=true；MiniMax-M3 聊天返回 HTTP 200、mode=model；语音合成返回 HTTP 200、audio/mpeg、32820 字节。验证脚本为 `aws/verify-minimax.mjs`，使用服务器上的运行配置执行，不在输出中显示密钥或登录 Cookie。语音识别和 QQ 账号授权未在此次验证中测试。

## 2026-11-04 QQ 授权持久化修复

已发布到当前应用及自定义域名 https://music.kwill.cc.cd 。QQ 授权按浏览器持久绑定，与1小时的声屿解锁会话分离，服务器重启或重新解锁不再主动丢失绑定。使用180天的 HttpOnly/Secure 浏览器标识，真实 QQ token 仅留在后端；清除 Cookie 或换域名后需要重新授权。现存两条授权记录已保留。后端定时检查续期，不依赖设置面板打开；临时错误不删除授权，重复保存相同连接配置也不再退出。

内置依赖的 sealed token 将续期限制在首次扫码后30天，QQ 自身失效或风控可能要求更早重新扫码。完整机制与边界见 QQ_MUSIC_AGENT.md。

构建、类型检查、42项相关安全/音乐/Cloudflare/界面测试通过；线上通过 `aws/verify-qq-persistence.mjs` 验证180天安全 Cookie、锁定后仍保留浏览器标识、再次解锁复用标识以及仅持有该标识不能访问受保护 API。发布前保留回滚包 `/var/backups/soundisle/before-qq-persistence.tar.gz`，未覆盖 `.data` 或密钥配置。真实账号的长期续期仍受 QQ 服务端行为约束，本次未代用户扫码。

## 2026-11-04 播放界面与 EQ 更新

已发布至 https://music.kwill.cc.cd ：移除自然声景混音、合成电子乐引擎、内建合成音乐源和模拟曲目，未选歌时显示真实空状态。旧顶部功能导航移除，设置位于「只听音乐」旁；专辑区域可切换环绕/频谱动效或关闭动画。

底部「EQ 声场」直接连接当前歌曲的 MediaElement 音频链：60/250/1000/4000/12000 Hz 五段滤波、±12 dB 调节、音色预设、左右平衡、处理开关与恢复原声。调节时预留增益余量，设置保存在浏览器。切歌时断开旧媒体节点，继续应用当前 EQ；MiniMax 语音维持独立播放。

类型检查、构建、60项相关测试通过。真实浏览器在本地及线上分别验证1013×928桌面和390×844手机布局、入口位置、动效控制、EQ预设/开关/键盘调节、刷新后保留设置与无页面报错。音频处理连接和切歌清理通过音频引擎回归验证；本次界面验证没有代用户扫码或播放其真实 QQ 歌曲。

完整发布包为 `releases/eq-interface-20261104.tar.gz`，并已更新 `releases/current.tar.gz`。回滚包位于 `/var/backups/soundisle/before-eq-interface.tar.gz`；未覆盖后端运行密钥或 QQ 授权状态。

## 2026-11-04 对话与歌词空间调整

桌面陪伴布局使用播放器上方的可用视口高度，对话区和右侧歌词区底部对齐。对话记录保持内部滚动，歌词区随可用高度扩展并显示4～8行附近歌词；手机保持纵向自然排布。

类型检查、构建和17项界面/播放回归通过，真实浏览器本地及线上分别验证1013×928、1440×1000、1013×720和390×844。1013×928下对话区高712px、歌词区高256px，播放器上方间距18px；无横向溢出或页面报错。

此次仅更新前端资源，先上传新资源再原子替换入口，没有重启后端。发布包 `releases/expanded-layout-20261104.tar.gz` 已同步为 current；旧前端保存在 `/var/backups/soundisle/before-expanded-layout.tar.gz`。

## 2026-11-04 随机播放

播放器原自动切歌按钮改为循环切换顺序播放、随机播放、单曲循环，在手机端也可操作；设置页有同步的播放模式选择，模式保存在当前浏览器。

随机模式使用洗牌队列，每轮完整消费歌曲再重排，轮与轮交界不立即重播上一首。上一首按实际播放历史返回，返回后下一首先沿历史前进；队列变化或模式变化会重建随机状态。自然播放结束也遵守当前模式，单曲循环时仍可手动切换上一首或下一首。

类型检查、构建和21项界面/音频/播放顺序测试通过，覆盖自动随机切歌、历史导航、跨轮去重、模式切换、单曲/空队列和队列替换。真实浏览器本地与线上验证模式切换、设置同步、刷新后保存，以及997/1440/390/320px宽度下按钮可用且无横向溢出。仅更新前端资源，未重启后端。

发布包为 `releases/shuffle-20261104.tar.gz`，已同步 current；回滚前端包位于 `/var/backups/soundisle/before-shuffle.tar.gz`。

## 2026-11-04 查询结果播放图标

查询结果右侧的“播放”文字改为与队列一致的三角图标，固定图标和封面宽度，歌曲信息独立截断，保留歌曲级播放标签与整行点击行为。类型检查、构建，以及本地/线上997px和390px浏览器检查通过。仅更新前端；发布包为 `releases/play-icons-20261104.tar.gz`，回滚包为 `/var/backups/soundisle/before-play-icons.tar.gz`。

## 2026-11-04 歌单恢复与下一首预加载

已发布至 https://music.kwill.cc.cd 。刷新后从当前浏览器恢复歌单、当前歌曲及播放进度，点击播放即可继续；不保存临时播放链接或授权凭据。当前歌曲播放到50%时，按播放模式预加载下一首并在切歌时复用音频元素；随机模式预选结果与实际下一首一致。更换队列或模式时取消旧预加载，失败时在实际播放阶段重新请求。实际缓冲量由浏览器和网络条件决定。

发布前类型检查、构建和79项测试通过，覆盖应用重新挂载后恢复原歌曲47.5秒的位置、50%触发、缓冲复用、随机顺序及预加载失败/取消。线上使用 `aws/verify-release.mjs` 分别验证自定义域名与 CloudFront 入口：首页及 JS/CSS 均200、入口哈希与本地构建一致、最新歌单恢复代码存在、未登录接口401、访问码登录及音乐/语音/模型配置接口200、退出后会话401。本次未扫码或播放真实 QQ 歌曲。

仅更新前端：先复制资源，再原子替换入口，后端进程 PID 保持35151，服务和 Nginx 均 active。完整发布包为 `releases/playback-resume-prefetch-20261104.tar.gz`，已同步 `releases/current.tar.gz`；旧 current 另存 `releases/before-resume-prefetch-current-20261104.tar.gz`。前端回滚包位于 `/var/backups/soundisle/before-resume-prefetch-20261104.tar.gz`；未改动 `.data` 或密钥配置。
