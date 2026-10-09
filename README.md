# 工作时段圆环（`@local/dsh-work-hours-ring`）

一个极简的 DeepSeek Harness 客户端插件：在输入框模型选择器左侧紧挨着渲染一个小圆环。
**工作时段为橙色**，**空闲时段为蓝色**，悬停文字会倒计时到下班时间，或者说明下次上班时间。

```
周一至周五 09:00–12:00、14:00–18:00   → 橙色   距离下班还有 2h 30min
其他时间（午休、夜间、周末、
中国法定节假日）                       → 蓝色   距离上班还有 1h / 下次上班：10月12日（周一） 09:00
```

时间始终按北京时间（UTC+8）计算，与本机时区无关。按需求，中国法定节假日会让整个工作日
都处于空闲状态；调休上班日落在周末，在同样的规则下依然算空闲。

## 文件结构

| 文件 | 作用 |
|---|---|
| `worktime.js` | 纯北京时间模型：工作时段、节假日列表、下次上班／下次下班、悬停文字 |
| `client.source.js` | 手写的客户端部分：圆环图形、走时组件、插槽注册 |
| `build.mjs` | 把 `worktime.js` 内联进浏览器产物 |
| `client.js` | 页面加载的生成产物 —— 请勿编辑 |
| `index.js` | 宿主（Host）部分；有意留空（圆环是纯 UI） |
| `cordis.patch.yml` | 插入 `work-hours-ring` 这一行的 bundle 补丁 |
| `test/` | `node test/worktime.test.js`、`node test/client.test.js` |

## 构建与测试

```sh
cd /Users/nero/d/dsh-work-hours-ring
npm run build   # 改动 client.source.js 或 worktime.js 后重新生成 client.js
npm test        # 构建 + 两个测试
```

任何对 `client.source.js` 或 `worktime.js` 的改动之后都必须重新构建 `client.js`；
插件加载的是构建产物。

## 安装到配置文件（profile）

该 bundle 作为 profile 依赖安装，并作为 profile bundle 启用：

```sh
cd "$DSH_PROFILE_DIR"
node "/Applications/DeepSeek Harness.app/Contents/Resources/runtime/pnpm/bin/pnpm.mjs" \
  add "file:/Users/nero/d/dsh-work-hours-ring"
```

然后在 profile 的 `package.json` 中把 `"@local/dsh-work-hours-ring"` 加入
`dsh.profile.bundles`。Harness 会热重载 profile 的 patch 与 manifest 改动，因此刷新页面
后圆环就会出现；否则重启应用。

可以在「设置 → 插件」中确认这一行已生效，它显示为 **Work-hours ring**。

## 保持节假日列表最新

`worktime.js` 中的 `HOLIDAYS` 保存的是 2026 年《国务院办公厅关于2026年部分节假日安排
的通知》的时间窗口。对于国务院尚未公布安排的年份，模型只把元旦、劳动节
（05-01…05-03）和国庆节（10-01…10-03）视为节假日；等每年通知发布后，把公布的
`YYYY-MM-DD` 条目加入 `HOLIDAYS`（并重新运行 `npm run build`）。

要修改工作时段，编辑 `worktime.js` 中的 `WORK_PERIODS` 并重新构建。颜色常量
（`WORKING_COLOR`、`IDLE_COLOR`）位于 `client.source.js` 顶部。
