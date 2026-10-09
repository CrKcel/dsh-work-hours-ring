# 工作时段圆环（`@local/dsh-work-hours-ring`）

一个极简的 DeepSeek Harness 客户端插件：在输入框模型选择器左侧紧挨着渲染一个小圆环。
**工作时段为橙色**，**空闲时段为蓝色**，悬停文字会倒计时到下班时间，或者说明下次上班时间。

```
工作日 09:00–12:00、14:00–18:00        → 橙色   距离下班还有 2h 30min
其他时间（午休、夜间、非工作日、
中国法定节假日）                        → 蓝色   距离上班还有 1h / 下次上班：10月12日（周一） 09:00
```

## 文件结构

| 文件 | 作用 |
|---|---|
| `holiday-source.js` | 第三方包与模型的适配层：`isWorkday`、假期名、年份覆盖探测 |
| `worktime.js` | 纯北京时间模型：工作时段、工作日判定、下次上班／下次下班、悬停文字 |
| `client.source.js` | 手写的客户端部分：圆环图形、走时组件、插槽注册 |
| `build.mjs` | 把 `holiday-source.js`、`worktime.js` 与 `chinese-days` 内联进浏览器产物 |
| `client.js` | 页面加载的生成产物 —— 请勿编辑 |
| `index.js` | 宿主（Host）部分；有意留空（圆环是纯 UI） |
| `cordis.patch.yml` | 插入 `work-hours-ring` 这一行的 bundle 补丁 |
| `test/` | `node test/worktime.test.js`、`node test/client.test.js` |

## 构建与测试

```sh
cd /Users/nero/d/dsh-work-hours-ring
npm install     # 首次需要，用于取得 chinese-days
npm run build   # 改动 client.source.js、worktime.js 或 holiday-source.js 后重新生成 client.js
npm test        # 构建 + 两个测试
```

任何对源码的改动之后都必须重新构建 `client.js`；插件加载的是构建产物。

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

`client.js` 已自包含 `chinese-days`，所以 profile 侧无需再安装它。

可以在「设置 → 插件」中确认这一行已生效，它显示为 **Work-hours ring**。
