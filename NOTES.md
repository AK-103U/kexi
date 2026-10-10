# emdash-lab 探索笔记 —— 踩坑与叙事层

本文档只存 **AGENTS.md 与 DESIGN.md 都不写的内容**：被推翻的错误做法、发现过程、环境特异性坑。
所有硬性规则（Rules）放在 `AGENTS.md`，设计令牌（tokens）放在 `src/styles/tokens.css` + `theme.css`，视觉规范见 `DESIGN.md`。

创建于 2026 年 10 月 08 日。

---

## 一、seed 模型（应用路径与一次性）

顶层键：`$schema / version / meta / settings / collections / taxonomies / bylines / menus / widgetAreas / sections / content`

- **查找顺序**：`.emdash/seed.json` → `package.json#emdash.seed` → `seed/seed.json` → 内置默认
- **构建期内联**：改 seed 必须重启 dev server
- **一次性**：apply 后写 `emdash:seed_complete=true`，之后改 seed 对已初始化的库**完全无效**
- seed 里的 `published_at` **无效**；`status: "published"` 用 apply 时刻的时间戳
- Portable Text 的 `_key` **必填**

### 两条应用路径（关键区别）

| 路径 | 时机 | 是否含示例内容 |
|---|---|---|
| 自动 seed | dev server 首次请求 | **否**（只建结构） |
| `npx emdash seed` | 手动 | **是**（`--content` 默认 true） |

实测：首次请求后 `ec_posts = 0 行`，跑 `npx emdash seed` 后才变成 8 行。
**要重来一遍**：删 `data.db`，重启，再跑 `npx emdash seed`。

---

## 二、i18n 机制坑（byline locale 与 ALS）

### byline 的语言问题（必读）

`SeedByline` 类型**没有** locale 字段；`_emdash_bylines.locale` 的**列默认值**是 migration 040 执行时读到的 configured defaultLocale。而 `npx emdash seed` 不加载 `astro.config.mjs`，`getI18nConfig()` 返回 null → 默认值被烘成 `'en'`。

byline hydration 是**严格按 locale、没有 fallback** 的，于是另一种语言的详情页署名整个消失。

修法：`scripts/seed-bylines-i18n.mjs`（`pnpm seed:bylines`）幂等补齐 —— 遍历每个 byline translation_group，为 `siteConfig.locales` 里缺失的语言插一行；文案优先取 `seed/bylines-i18n.json` 的覆盖值，否则复制同组已有行。

> 脚本直写 SQLite（`node:sqlite`，Node 24 内置），**绕开了 emdash 的进程内 byline 缓存**，跑完要重启 dev server 才看得到变化。

### 重建双语数据库

```bash
rm -f data.db data.db-shm data.db-wal
npx emdash seed        # 注意：seed 进程不加载 astro.config，byline 会落在 'en'
pnpm seed:bylines      # 补齐其他语言的 byline
```

`$media` 只支持 `url`（不支持本地文件），下载走 SSRF 校验 → Cloudflare DoH（3s 超时）。本机实测会间歇性 `Could not resolve hostname: This operation was aborted`，重跑几次即可；同一批 seed 里重复引用同一个 URL 不会重复下载（按 URL 缓存）。

### 薄壳必查清单（实测）

- **禁止 `routing.prefixDefaultLocale: true`** —— 会让 `/_emdash/admin` 全线 404
- `astro.config.mjs` 必须配 `site`，否则 hreflang alternates 静默返回 `[]`
- `entry.id` 在非默认语言带前缀（`en/foo`）——链接一律用 `entry.data.slug` + `localePath`；直接拼 `entry.id` 会得到 `/posts/en/foo`
- 匿名请求的 ALS 上下文里没有 locale —— 每次数据调用都要**显式**传 `{ locale }`
- 列表查询**不** fallback，只有详情页有 fallback
- `i18n.fallback` 不能用 defaultLocale 作 key，EmDash 的 `getFallbackChain` 会把 defaultLocale 追加到链尾 → **en → zh 自动成立**
- settings / widgetAreas 没有 locale 列（页头页脚改为自建，文案走 UI 字典）
- `custom` 类型菜单 URL 不会自动加前缀，seed 菜单直接写完整 URL，用 `locale` + `translationOf` 关联

---

## 三、Windows 环境特异性

官方 `pnpm screenshots` **完全不可用**：依赖 `lsof` 查/杀端口、调用 `pnpm bootstrap`（模板已无此脚本）、`rsync` 缺失。

替代方案 `scripts/shots.mjs`：用 `playwright-core`（**不是** `playwright`）、`chromium.launch({ channel: "chrome" })` 复用系统 Chrome。断点文件名带上视口（如 `post-tablet-dark.png`），因为三栏外壳的两个关键行为只在窄断点可见。

三个断点各自落在三档布局里：

| 断点 | 视口 | 布局 |
|---|---|---|
| `desktop` | 1440×900 | 三栏齐全 |
| `tablet` | 1100×900 | 两栏，右栏收起（断点 1199） |
| `mobile` | 390×844 | 单栏，左栏收起、导航进汉堡（断点 999） |

### dev server 绑定矩阵

默认 `pnpm dev` 只绑 `[::1]:4321`，所以 `127.0.0.1:4321` 连不上。但 **`localhost` 是能用的** —— 它同时解析出 A(`127.0.0.1`) 与 AAAA(`::1`) 两条记录，客户端会挑通的那条。

| 启动方式 | 实际绑定 | `127.0.0.1` | `localhost` | `[::1]` |
|---|---|---|---|---|
| `pnpm dev`（默认） | `::1` | ✘ | ✔ | ✔ |
| `pnpm dev --host 127.0.0.1` | `127.0.0.1` | ✔ | ✔ | ✘ |
| `pnpm dev --host` | `0.0.0.0` + `[::]` | ✔ | ✔ | ✔ |

三种启动方式都用 curl 实测过。`--host` 不带参数还会额外暴露到局域网（启动日志会列出 `192.168.x.x` 之类），适合手机连上来调试。

副作用：默认绑定下生成的图片 URL 里嵌了 `[::1]` 字面量。

> 旧记录写的「不要用 `localhost`（会解析到 IPv4）」是错的，2026-10-09 实测推翻。「`127.0.0.1` 连不上」这一半仍然成立。

### Astro 7 不允许同时跑两个 dev server

想换个端口起第二个会直接失败：

```
Another astro dev server is already running.
  URL:  http://localhost:4321
  PID:  15528
Run `astro dev stop` to stop it, or use `astro dev --force` to replace it.
```

要先停掉原来的，或加 `--force` 顶掉它。

### 其他

- Node 里 `/tmp/xxx` 会被解析成 `F:\tmp\xxx`，临时文件放项目目录内
- 数据库可用 Node 24 内置的 `node:sqlite` 直接查（`DatabaseSync`），无需装 sqlite3

---

## 四、版式改造中的被推翻的做法

> 这些错误结论现在已被 git 提交修正，但保留它们的原因是：**下一次遇到类似问题时可以少走弯路**。这是 NOTES 存在的唯一理由。

### 选头像的试错

一开始选了 `notes-on-simplicity.jpg`（白纸几何纹理），截出来在 40px 圆形里**几乎是空白灰点**。换成 `building-long-term.jpg`（深色代码屏）后小尺寸下辨识度好得多。

**教训**：只有把候选图并排渲染出来看才知道，读文件名判断不了。

### 两栏改造 → 三栏改造（第九节 → 第十四节）

文章页原本从「三栏 → 两栏」（删左栏、正文列、TOC 右栏），后来改成**全站三栏**（左栏身份 + 导航／中栏正文／右栏 TOC）。

> 第九节的改造描述全部作废，只保留两点可迁移教训：「旧栏宽时代的 flex 样式搬列必须重渲染验证」「页面让出外层宽度后首页卡片区必须重排」。

### ClientRouter 主题切换器的失效过程

**现象**：导航后点 dark 无反应、class 也没了（按钮节点被替换）。

**第一次误判**：以为是模块脚本重复执行导致监听叠加，加了 `addEventListener` 去重。结果没变。

**正确根因**：ClientRouter 下单个页面的 `<html>` 被整体替换，`document.querySelector('.theme-toggle')` 拿不到原节点，`click` 事件监听当然丢了。

**解法**：用 `astro:page-load` 驱动初始化（首次加载与每次客户端导航后都会触发），监听器改用 `onclick` 赋值（重复执行不叠加），并在 `astro:before-swap` 里给新文档的 `<html>` 补 class。

> 这条现在是 `check:spa` 的第一道断言，不靠肉眼。

### scoped 样式传给子组件永远失效

> **本节已被第十五节深度取代**：保留在此以记录当时的推理。

页头收窄时，搜索框去边框、用浅灰底。改完发现底色没变，查下来是两层坑叠在一起：

1. `.site-search-input` 是**传给子组件** LiveSearch 的 class，必须 `:global()`。
2. 更深一层：组件自带的 `.emdash-live-search-input[data-astro-cid-*]` 特异性是 **(0,2,0)**，压过 `:global(.class)` 的 **(0,1,0)**。于是四行全是死代码。

两种解法，优先第一种：

```css
/* 1) 给组件自己的自定义属性赋值 */
--emdash-search-bg: var(--color-surface);

/* 2) 组件硬编码的值只能 !important */
border-radius: var(--radius) !important;
padding: var(--spacing-2) var(--spacing-3) !important;
```

> 这类失败在源码里完全看不出来。所以 `check:shell` 现在量的是 **计算样式**（`getComputedStyle`），而不是读 CSS 源。补这条断言之前我做过破坏性自验：把底色改回 `--color-bg`，**当时的 49 条断言全绿放行** —— 这就是它必须存在的理由。

### SPA 漂移的两个独立根因

用户报的三条症状（切到 `/pages/about` 漂、滚动后进文章漂、滚动后切页漂），实测是**两个独立的根因**：

**a) 短页面没有滚动条 → 居中的外壳整体横移**

`/pages/about` 的内容正好一屏高，**不出现滚动条**，`clientWidth` 1425 → 1440。外壳是 `justify-content: center` 的，于是整体右移 **7.5px**。长页面之间互切看不出来，只有切到短页面才现形。

修法：`html { scrollbar-gutter: stable }`。

**b) sticky 位 ≠ 静止位 → rail 弹动**

`.rail` 的 `top` 写的是 `calc(var(--nav-height) + var(--spacing-8))` = 96px，但它的**静止位**是 113px（页头实际 65px = 64px 令牌 + 1px 下边框，加外壳上边距 48px）。页面滚到中途时 rail 贴在 96px；一旦切页，ClientRouter 把 `scrollY` 归零，rail 立刻弹回 113px —— **17px 的跳动**。

修法：两个值从同一个变量推出来，改一处即可：

```css
.shell {
  --shell-pad-top: var(--spacing-12);
  --rail-sticky-top: calc(var(--nav-height) + 1px + var(--shell-pad-top));
  padding: var(--shell-pad-top) var(--spacing-6) var(--spacing-16);
}
.rail { top: var(--rail-sticky-top); }
```

> **为什么之前所有检查都是绿的**：Playwright 默认给 Chrome 传 `--hide-scrollbars`，滚动条宽度恒为 0，`clientWidth` 永远等于视口宽 —— 整个「滚动条有无」类的漂移都量不出来。三个脚本现在都显式 `ignoreDefaultArgs: ["--hide-scrollbars"]`。**写任何布局量测脚本都要带上这个**，否则等于蒙着眼睛验。

---

## 五、现有模板的问题

1. `seed.json` 的 widget 用了过时的 `settings` 键，`npx emdash seed --validate` 会警告：`widgetAreas[0].widgets[3].settings: not applied; widget options belong in "props"`。应改用 `props`。
2. GitHub 上的模板仓库与 monorepo 有版本分叉 —— 少了 `Byline.astro`、`Pagination.astro`、`prose.css`、`utils/locale.ts`，`Base.astro` 908 行 vs monorepo 1498 行。**但 lab 版是自洽的**，不要从 monorepo 拷文件过去，会破坏一致性。

---

## 六、下一步可选方向（待办）

- **做 Cloudflare 变体**：D1 + R2 + `wrangler.jsonc` + `worker.ts`。注意 `/_image` 在 Cloudflare 走的是 `IMAGES` binding 而非 sharp，`sharp` 那条依赖可以去掉。
- **发布成 GitHub 模板**：`npm create astro@latest -- --template github:<you>/emdash-lab`。
- **改 seed 做原创内容模型**：加 collection / 字段 / 自定义 PT 块（后者需要 native 插件注册编辑器）。
- **补第三语言**：`siteConfig.locales` 加一项、`src/i18n/<lang>.json` 加字典、`src/pages/[locale]/` 薄壳自动生效。注意语言切换器现在是「点击切到下一个语言」的单控件，**加到三种语言就得改下拉**。

---

## 七、速查命令

```bash
cd F:/dev/blog/emdash-lab

pnpm dev                    # 启动（默认只绑 ::1，localhost 或 [::1] 都能访问）
pnpm dev --host             # 需要 127.0.0.1 或局域网访问时
pnpm typecheck              # 类型检查
node scripts/shots.mjs      # 截图（20 路由 × 3 断点 × 明暗，含 en 变体）
pnpm check:spa              # 客户端导航 + TOC 回归断言（需 server 在跑）
pnpm check:shell            # 三栏外壳几何断言（需 server 在跑）
pnpm seed:bylines           # 补齐 byline 的语言行（跑完重启 dev）
pnpm seed:avatar            # 设置左栏头像（跑完重启 dev）

# 生产构建 —— /_image 与 sharp 只有这条路径能验
pnpm build && pnpm start    # 默认 4321；换端口用 PORT=4400 pnpm start

npx emdash seed --validate  # 只校验 seed
npx emdash seed             # 应用 seed（含示例内容）
npx emdash types            # 重新生成类型
npx emdash doctor           # 诊断数据库与配置
```

Admin UI: `http://localhost:4321/_emdash/admin`
Dev 后门（跳过登录）: `/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin`
