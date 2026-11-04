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
