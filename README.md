# 工作时间环

[![CI](https://github.com/CrKcel/dsh-work-hours-ring/actions/workflows/ci.yml/badge.svg)](https://github.com/CrKcel/dsh-work-hours-ring/actions/workflows/ci.yml)
[![Auto-build bundle](https://github.com/CrKcel/dsh-work-hours-ring/actions/workflows/autobuild.yml/badge.svg)](https://github.com/CrKcel/dsh-work-hours-ring/actions/workflows/autobuild.yml)

DeepSeek Harness 插件

一个圆环。
**工作时段为橙色**，**空闲时段为蓝色**，

悬停文字提示下班时间，或下次上班时间。

## 安装

```sh
dsh plugin --profile desktop add github:CrKcel/dsh-work-hours-ring #桌面端

dsh plugin --profile web add github:CrKcel/dsh-work-hours-ring #Web端
```

## 持续集成

`client.js` 是构建产物，会被一并提交（安装时不做任何构建，见 `AGENTS.md`），所以仓库自带两道流水线：

- **Auto-build bundle** —— 推送到任意分支后，自动在 GitHub 上执行 `npm run build`；只要生成结果和提交里的 `client.js` 不一致，就补一个 `chore(build): regenerate client.js [skip ci]` 提交推回该分支。**因此源码改完不需要在本地先构建就能提交。**
- **CI** —— 在推送 `main` 和每个 Pull Request 上执行 `npm ci && npm test`（Node 22 / 24 / 26）。`npm test` 的第一项会重新构建并逐字节比对 `client.js`，所以改了源码却没重新构建的提交会直接失败：红灯留在 PR 上，而不是把过期的包发到用户机器上。

Fork 仓库的令牌是只读的，因此来自 fork 的 PR 不会自动补提交，需要贡献者在本地执行下面的构建。

## 开发

```sh
npm install     # 首次：拉取 chinese-days 节假日数据
npm run build   # 修改 client.source.js / worktime.js / holiday-source.js 后重新生成 client.js
npm test        # 校验已提交的 client.js 是最新的，然后跑时间模型与产物协议测试
```
