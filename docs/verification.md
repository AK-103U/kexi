# 验证指南

按改动选择检查。命令定义以 [package.json](../package.json) 为准；下列浏览器脚本需要正在运行的站点和系统 Chrome，使用 `playwright-core`。

## 检查入口

| 改动 | 检查 |
|---|---|
| Astro 页面、TypeScript、内容类型 | `pnpm typecheck` |
| 左栏外壳、页脚、三栏布局或样式覆盖 | `pnpm check:shell` 与对应页面截图 |
| 客户端导航、语言切换、主题切换或目录 | `pnpm check:spa` |
| 图片处理、字体或构建配置 | `pnpm build` 后本地验证图片端点、字体和页面 |
| Seed 结构 | `pnpm exec emdash seed --validate` |

`check:shell` 和 `check:spa` 包含演示文章路径与站点文案断言，需要相应演示内容。若数据库已换成原创内容，先调整测试样本；脚本通过并不等于它覆盖了所有页面或模式。

## 布局与导航

在一个终端启动 `pnpm dev`，在另一个终端运行：

```bash
pnpm typecheck
pnpm check:shell
pnpm check:spa
```

两份脚本默认访问 `http://localhost:4321`。使用其他地址时：

```bash
node scripts/check-shell.mjs http://localhost:4400
node scripts/check-spa.mjs http://localhost:4400
```

[check-shell.mjs](../scripts/check-shell.mjs) 检查中栏位置、断点布局、单份控件与汉堡菜单、桌面搜索输入框常驻显示、语言/主题切换器排布、左栏品牌与导航的共同左起点、窄屏顶部控件是否同排、搜索框计算样式、页脚在侧栏中的位置、RSS/社交图标与无障碍名称，以及滚动后切页是否漂移。[check-spa.mjs](../scripts/check-spa.mjs) 通过 `window` 标记是否存活确认客户端导航，并检查语言、标题、正文、浏览器后退和目录重建。

布局量测保留真实滚动条，脚本通过 `ignoreDefaultArgs: ["--hide-scrollbars"]` 取消 Playwright 的隐藏行为。搜索框等第三方组件的覆盖通过 `getComputedStyle()` 核对；源码中有声明并不能证明它在浏览器中生效。历史原因见 [探索笔记](../NOTES.md#布局漂移与验证盲区)。

## 截图

[shots.mjs](../scripts/shots.mjs) 默认生成预设路由在桌面、平板、手机和明暗模式下的截图，输出到忽略版本控制的 `shots/`。它默认访问 `http://[::1]:4321`，可通过 `--base` 指定地址。

```bash
node scripts/shots.mjs --base http://localhost:4321
node scripts/shots.mjs --base http://localhost:4321 --only post --bp tablet
node scripts/shots.mjs --base http://localhost:4321 --only post --full
```

`--only` 接受脚本里的页面名称，`--bp` 接受 `desktop`、`tablet`、`mobile` 或 `all`。默认截取视口，`--full` 截取完整页面。

| 名称 | 视口 | 主要观察点 |
|---|---|---|
| `desktop` | `1440×900` | 三栏、左栏身份/外观分组、整行导航与底部搜索、空右栏轨道 |
| `tablet` | `1100×900` | 右栏收起、正文位置、左栏分组 |
| `mobile` | `390×844` | 单栏、品牌标记/搜索/语言/主题/汉堡同排、折叠菜单、内容溢出 |

查看生成的图片并检查响应状态。脚本会输出 HTTP 状态；除预期的 404 样本外，截图成功也不能代替状态正确和内容正确。

## 生产路径

生产环境部署到 Cloudflare Workers。构建后先用本地预览验证，再部署：

```bash
pnpm build
pnpm preview   # 本地预览构建产物
pnpm deploy    # astro build && wrangler deploy
```

`pnpm deploy` 需要 Cloudflare 账号和 `wrangler login`，并会连接或创建 `wrangler.jsonc` 中的 D1、R2 资源。首次部署后访问站点的 `/_emdash/admin` 完成初始化，并在后台设置公开站点 URL。

确认公开页面、语言变体和 `/_image` 返回正确内容。Cloudflare 下图片走 Images binding，不是 `sharp`；绑定缺失时内网媒体路由会返回原图而非缩放变体。生产验证也可以指向部署后的 `workers.dev` 地址或自定义域名。

部署配置、预览部署和定时任务的细节见 [官方 Cloudflare 部署文档](https://docs.emdashcms.com/deployment/cloudflare/)。

## 国际化字典

中文类型约束不能证明英文字典完整。修改文案后比较 [zh.json](../src/i18n/zh.json) 和 [en.json](../src/i18n/en.json) 的叶子 key、插值参数，并检查涉及的页面。项目目前没有专门的字典完整性检查命令，不能用 `pnpm typecheck` 的结果代替这项核对。

## 排错入口

默认开发地址优先使用启动日志给出的 URL。本机历史上默认监听 IPv6，`localhost` 可用，硬编码 `127.0.0.1` 可能连接失败。`pnpm dev --host 127.0.0.1` 显式监听 IPv4；需要局域网访问时使用 `pnpm dev --host`。

本地开发由 Cloudflare 适配器在 `.wrangler/` 模拟 D1、R2 和 KV。修改绑定后运行 `pnpm types:worker` 重新生成 `worker-configuration.d.ts`。遇到 500 时先保留服务端日志和请求响应。已知问题见 [探索笔记](../NOTES.md)。
