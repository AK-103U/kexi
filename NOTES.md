# emdash-lab 探索笔记

用官方 blog 模板跑通 EmDash 主题制作的完整链路，并做了第一次主题改造。

创建于 2026年10月08日。

---

## 一、EmDash 主题是什么

**主题 = 一个完整的 Astro 项目**，通过 create-astro 模板分发。

- **没有运行时主题包**，没有父子主题层级。脚手架生成后，主题文件就归站点所有，可直接改。
- 对比 WordPress：没有模板层级自动推导，路由就是 `src/pages/` 下的显式文件。
- 官方分发链：`npm create emdash@latest` → giget 从 `github:emdash-cms/templates/blog` 拉取。
  **注意不是 npm 包** —— `@emdash-cms/template-blog` 未发布到 npm；发布的是 `emdash` 和 `create-emdash` 本身。

### 目录结构

```
emdash-lab/
├── astro.config.mjs               # output:"server" + adapter + emdash() 集成 + i18n + 字体
├── package.json                   # emdash.seed 指向 seed 文件
├── emdash-env.d.ts                # 生成的类型，勿手改
├── seed/seed.json                 # 内容模型 + 双语示例内容
├── seed/bylines-i18n.json         # byline 各语言文案覆盖
├── scripts/shots.mjs              # 自建截图脚本（见第七节）
├── scripts/check-spa.mjs          # 客户端导航回归断言（见第六节）
├── scripts/seed-bylines-i18n.mjs  # 补齐 byline 的语言行（见第五节）
└── src/
    ├── live.config.ts             # 注册 _emdash live collection（boilerplate）
    ├── i18n/                      # config.ts（单一真源）/ ui.ts / zh.json / en.json
    ├── pages/                     # 默认语言（zh）公开路由，全部服务端渲染
    ├── pages/[locale]/            # 其他语言的薄壳路由（见第五节）
    ├── layouts/Base.astro
    ├── components/                # PostCard / LanguageSwitcher / ThemeSwitcher
    ├── utils/rss.ts               # 按 locale 生成 feed
    └── styles/                    # tokens.css / theme.css
```

---

## 二、硬性约束（踩了会静默失败）

| 约束 | 说明 |
|---|---|
| `output: "server"` | CMS 内容动态，必须 SSR |
| **禁止 `getStaticPaths`** | 内容路由上加会破坏运行时查询 |
| 图片字段是**对象** `{id, src, alt}` | 必须 `<Image image={...} />`；`<img src={...} />` 渲染成 `[object Object]` |
| `entry.id` = slug（用于 URL）<br>`entry.data.id` = ULID（用于 API） | 混用**不报错**，只返回空 |
| 分类法名必须与 seed 的 `name` 完全一致（**单数**） | 写 `"categories"` 同样静默返回空 |
| 渲染了 settings/menu/taxonomy/widget 的路由 | 用 `*WithCacheHint` 变体 + `Astro.cache.set(cacheHint)` |
| `EmDashHead` / `EmDashBodyStart` / `EmDashBodyEnd` | 插件注入点，缺了插件失效（但页面本身仍正常） |

---

## 三、样式系统

三层分工：

| 文件 | 作用 |
|---|---|
| `src/styles/tokens.css` | 设计令牌，包在 `@layer base`。颜色用 `light-dark(亮, 暗)` |
| `src/styles/theme.css` | **无 layer**，天然压过 tokens。**改视觉只动这里** |
| `src/styles/prose.css` | 正文排版（本版模板未拆分） |

- 字体在 `astro.config.mjs` 的 `fonts:` 数组，`cssVariable` 绑定 `--font-body` / `--font-mono`
- 上色三件套必须**一起设**：`--color-brand` / `--color-brand-hover` / `--color-on-brand`

### 实测确认

改 `theme.css` 后页面 CSS 输出：

```
--color-brand: light-dark(#e86233, #db7753)   ← 覆盖生效
--radius-lg: 14px
--font-weight-display: 650
```

搜索页截图里按钮和焦点环确实变成了柑橘色 —— **unlayered 优先级机制成立**。

> **验证时的坑**：`theme.css` 的注释里含有示例值（`#0f766e`、`--radius: 8px`），
> 直接 grep 页面 HTML 会先命中注释，看起来像"覆盖没生效"。
> 要精确定位，得按 `<style>` 块切分后找含特征字符串的那一块。

---

## 四、seed 内容模型

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

本次实测：首次请求后 `ec_posts = 0 行`，跑 `npx emdash seed` 后才变成 8 行。

**要重来一遍**：删 `data.db`，重启，再跑 `npx emdash seed`。

---

## 五、全量 i18n（UI 文案 + 内容 + 分类法）

语言：**zh（默认，无 URL 前缀）+ en（`/en` 前缀）**，结构可扩展。

### 单一真源

`src/i18n/config.ts` 是唯一真源，`astro.config.mjs` 与主题代码都 import 它
（`.mjs` 直接 import `.ts` 可行 —— Node 24 原生剥类型）：

```ts
export const siteConfig = {
  siteUrl: "http://localhost:4321",   // hreflang 需要绝对 URL，部署时改这里
  defaultLocale: "zh",
  locales: ["zh", "en"],              // 顺序即语言切换器顺序
  localeLabels: { zh: "中文", en: "English" },
  localeTags: { zh: "zh-CN", en: "en-US" },
  rssLanguages: { zh: "zh-CN", en: "en-US" },
} as const;
```

`src/i18n/ui.ts` 提供 `useTranslations(lang)`（点分 key + `{param}` 插值）、
`localePath(lang, path)`、`stripLocale`、`getLang(astro)`、`pageLang(props, astro)`、
`formatDate(date, lang)`、`htmlLang(lang)`。字典是 `src/i18n/zh.json` / `en.json`；
`MessageKey` 从 zh.json 推导，en 少 key 会编译报错。

### 路由：薄壳模式

默认语言走无前缀路由；其他语言在 `src/pages/[locale]/` 下放薄壳（4 行），
薄壳 import 主页面并传 `locale`，主页面声明 `interface Props { locale?: string }`。

| 主页面（zh，无前缀） | 薄壳（en，`/en`） |
|---|---|
| `src/pages/index.astro` | `src/pages/[locale]/index.astro` |
| `src/pages/posts/index.astro` | `src/pages/[locale]/posts/index.astro` |
| `src/pages/posts/[slug].astro` | `src/pages/[locale]/posts/[slug].astro` |
| `src/pages/pages/[slug].astro` | `src/pages/[locale]/pages/[slug].astro` |
| `src/pages/category/[slug].astro` | `src/pages/[locale]/category/[slug].astro` |
| `src/pages/tag/[slug].astro` | `src/pages/[locale]/tag/[slug].astro` |
| `src/pages/search.astro` | `src/pages/[locale]/search.astro` |
| `src/pages/rss.xml.ts` | `src/pages/[locale]/rss.xml.ts` |

薄壳必须校验 locale 合法性，非法则 `Astro.redirect("/404")`。

### 坑（逐条实测）

| 坑 | 说明 |
|---|---|
| 禁止 `routing.prefixDefaultLocale: true` | 会让 `/_emdash/admin` 全线 404 |
| `astro.config.mjs` 必须配 `site` | 否则 hreflang alternates 静默返回 `[]` |
| `entry.id` 在非默认语言带前缀（`en/foo`） | 链接一律用 `entry.data.slug` + `localePath`；直接拼 `entry.id` 会得到 `/posts/en/foo` |
| 匿名请求的 ALS 上下文里没有 locale | 每次数据调用都要**显式**传 `{ locale }`：`getEmDashCollection` / `getEmDashEntry` / `getMenu` / `getTaxonomyTerms` / `getTermsForEntries` / `search` |
| 列表查询**不** fallback | 只有 zh 的文章不会出现在 `/en/posts`（EmDash 设计如此）；详情页有 fallback |
| `i18n.fallback` 不能用 defaultLocale 作 key | Astro 直接报错。而且 EmDash 的 `getFallbackChain` 本来就会把 defaultLocale 追加到链尾 → **en → zh 自动成立**；zh → en 在主题层手动补（`posts/[slug].astro`、`pages/[slug].astro`） |
| settings / widgetAreas 没有 locale 列 | 站名与标语全局单值；页头、页脚改为自建，文案走 UI 字典（侧栏 widget 后来整个删掉了，见第九节） |
| `custom` 类型菜单 URL 不会自动加前缀 | seed 菜单直接写完整 URL（zh 无前缀、en 带 `/en`），用 `locale` + `translationOf` 关联 |
| byline 没有 locale 字段 | seed 建的署名只落一种语言，需补丁脚本（见下） |

### byline 的语言问题（必读）

`SeedByline` 类型**没有** locale 字段；`_emdash_bylines.locale` 的**列默认值**是
migration 040 执行时读到的 configured defaultLocale。而 `npx emdash seed`
不加载 `astro.config.mjs`，`getI18nConfig()` 返回 null → 默认值被烘成 `'en'`。

byline hydration 是**严格按 locale、没有 fallback** 的，于是另一种语言的详情页署名整个消失。

修法：`scripts/seed-bylines-i18n.mjs`（`pnpm seed:bylines`）幂等补齐 ——
遍历每个 byline translation_group，为 `siteConfig.locales` 里缺失的语言插一行；
文案优先取 `seed/bylines-i18n.json` 的覆盖值，否则复制同组已有行。

> 脚本直写 SQLite（`node:sqlite`，Node 24 内置），**绕开了 emdash 的进程内 byline 缓存**，
> 跑完要重启 dev server 才看得到变化。

### 双语 seed 的写法

`seed.json` 的 `defaultLocale` 设为 `zh`；内容与分类法用 row-per-locale：
同 slug 两条，zh 条目加 `translationOf` 指向 en 条目的 **seed id**，
且 **zh 必须排在 en 之后**（`translationOf` 只能引用先出现的 id）。

```jsonc
{ "id": "post-1",    "slug": "building-for-the-long-term", "locale": "en", "status": "published", "data": { ... } },
{ "id": "post-1-zh", "slug": "building-for-the-long-term", "locale": "zh", "translationOf": "post-1", "status": "published", "data": { ... } }
```

新增一篇文章 = 写两条。这是 row-per-locale 模型的必然代价。

### 重建双语数据库

```bash
rm -f data.db data.db-shm data.db-wal
npx emdash seed        # 注意：seed 进程不加载 astro.config，byline 会落在 'en'
pnpm seed:bylines      # 补齐其他语言的 byline
```

`$media` 只支持 `url`（不支持本地文件），下载走 SSRF 校验 → Cloudflare DoH（3s 超时）。
本机实测会间歇性 `Could not resolve hostname: This operation was aborted`，重跑几次即可；
同一批 seed 里重复引用同一个 URL 不会重复下载（按 URL 缓存）。

---

## 六、客户端导航（ClientRouter）与 prefetch

`Base.astro` 的 head 里加了一行 `<ClientRouter />`（来自 `astro:transitions`），
站内点击（含语言切换）由客户端接管，不再整页刷新。底层仍是 MPA —— 首屏 SSR、
爬虫拿到的 HTML、RSS、`EmDashHead` 注入的 hreflang 全部保留。

实测（Chromium，`pnpm check:spa`）：

| 验证项 | 结果 |
|---|---|
| 切语言不刷新页面 | window 上的标记存活 |
| `<html lang>` | `zh-CN` → `en-US` |
| `<title>` / `canonical` / `og:url` | 跟着换 |
| hreflang | 详情页导航后 `en / zh / x-default`，与整页加载一致 |
| 浏览器后退 | 正常 |
| 模块脚本重复执行 | 不会，⌘K 的 keydown 监听不叠加 |
| 客户端导航后 prefetch | 仍工作（`onPageLoad` 会重新绑定） |

### 回归断言：`scripts/check-spa.mjs`

**ClientRouter 失效是静默的** —— 页面照样跳、内容照样对、`curl` 到的 HTML 也完全正常，
只是偷偷退回了整页刷新，prefetch 和过渡动画全没了，但没有任何报错。肉眼和截图都分辨不出来。

判据只有一条：**在 `window` 上打标记，点站内链接后标记还在 → 没有整页刷新**
（整页刷新会重建 `window`）。围绕它一共 10 条断言，另查 `<html lang>` / `<title>` /
正文是否跟随、后退是否可用、有无 page error。

```bash
pnpm dev            # 另开一个终端
pnpm check:spa      # 默认 http://localhost:4321，可传参改地址
```

> 这套断言不是摆设：主题切换器「导航后失效」那个 bug 就是它抓出来的
> （`probe6` 打印出 `<html>` 的 class 从 `dark` 变成了 `""`）。

### 必须配套改的：主题切换

模块脚本只在首次加载执行一次，而换页后 `<html>` 的 class 被重置、按钮也换成了新
节点，原来的 `addEventListener` 就丢了 —— 实测「导航后点 dark 无反应、class 也没了」。

改法：用 `astro:page-load` 驱动初始化（首次加载与每次客户端导航后都会触发），
监听器改用 `onclick` 赋值（重复执行不叠加），并在 `astro:before-swap` 里给新文档的
`<html>` 补 class，避免过渡期间闪一下。

⌘K 的 keydown 监听不用改 —— 它挂在 `document` 上，而 `document` 不随换页替换。

### prefetch：用了 ClientRouter 就顺带开了（反直觉）

`ClientRouter.astro` 源码里默认执行 `init({ prefetchAll: true })`，只有配置里显式
写 `prefetch: false` 才关。官方类型文档同款表述：

> Enabled by default on pages using the `<ClientRouter />` router.
> Set `prefetch: false` to opt out of this behaviour.

所以**不需要**在 `astro.config.mjs` 里写 `prefetch: true` —— 那是多余的。

机制：悬停链接时往 head 插一个 `<link rel="prefetch">`（低优先级，走浏览器 HTTP
缓存），把「点击后才开始取目标页」提前到「悬停就开始取」。实测悬停 `/posts` 后
head 里立刻出现该 link。

四种策略，默认 `hover`（悬停 80ms 后）：

| 策略 | 触发点 | 启用方式 |
|---|---|---|
| `hover` | 悬停 80ms 后 | 默认，所有站内链接 |
| `tap` | 触摸 / mousedown | `data-astro-prefetch="tap"` |
| `viewport` | 进入视口 300ms 后 | `data-astro-prefetch="viewport"` |
| `load` | 页面加载即取 | `data-astro-prefetch="load"` |

因为 `prefetchAll: true`，没加属性的站内链接也会在悬停时被预取；单链接退出写
`data-astro-prefetch="false"`。

自带几道闸：只对同源链接生效、跳过当前页、`navigator.onLine` 为 false 或网络被
判定为慢速时跳过、一个会话内同一 URL 只取一次。

代价是服务端会多收到请求（悬停一次 = 一次额外渲染）。首页 29 个链接理论上全悬停
就是 29 次额外请求，实际没人这么干；但后端若按请求计费或渲染很贵，要重新评估。

---

## 七、本机环境的坑（Windows）

官方 `pnpm screenshots` **完全不可用**：

1. 依赖 `lsof` 查/杀端口 —— 本机没有
2. 调用 `pnpm bootstrap` —— 模板的 package.json 里**已无此脚本**
3. `rsync` 同样缺失，`sync-*.sh` 也用不了

替代方案 `scripts/shots.mjs`：

- 用 `playwright-core`（**不是** `playwright` —— 后者 postinstall 会下载浏览器）
- `chromium.launch({ channel: "chrome" })` 复用系统 Chrome
- 遍历 20 个路由 × 3 个断点 × 明暗两模式 = **120 张**

```bash
node scripts/shots.mjs                # 全部（三个断点）
node scripts/shots.mjs --only post    # 单个页面
node scripts/shots.mjs --bp mobile    # 单个断点（desktop/tablet/mobile/all）
node scripts/shots.mjs --full         # 整页
```

文件名形如 `<页面>-<断点>-<模式>.png`（如 `post-tablet-dark.png`）。断点写进
文件名是有意的：三栏外壳的两个关键行为只在窄断点可见，混在一个目录里必须
一眼看出每张图是哪个视口拍的。三个断点各自落在三档布局里：

| 断点 | 视口 | 布局 |
|---|---|---|
| `desktop` | 1440×900 | 三栏齐全 |
| `tablet` | 1100×900 | 两栏，右栏收起（断点 1199） |
| `mobile` | 390×844 | 单栏，左栏收起、导航进汉堡（断点 999） |

### dev server 默认只监听 `::1`

默认 `pnpm dev` 只绑 `[::1]:4321`（`Get-NetTCPConnection` 确认只有一条 `::1`），
所以 `127.0.0.1:4321` 连不上。但 **`localhost` 是能用的** —— 它同时解析出
A(`127.0.0.1`) 与 AAAA(`::1`) 两条记录，客户端会挑通的那条。

| 启动方式 | 实际绑定 | `127.0.0.1` | `localhost` | `[::1]` |
|---|---|---|---|---|
| `pnpm dev`（默认） | `::1` | ✘ | ✔ | ✔ |
| `pnpm dev --host 127.0.0.1` | `127.0.0.1` | ✔ | ✔ | ✘ |
| `pnpm dev --host` | `0.0.0.0` + `[::]` | ✔ | ✔ | ✔ |

三种启动方式都用 curl 实测过。`--host` 不带参数还会额外暴露到局域网
（启动日志会列出 `192.168.x.x` 之类），适合手机连上来调试。

所以踩坑只发生在**写死字面量**时：`127.0.0.1` 在默认绑定下失败，`[::1]` 在
`--host 127.0.0.1` 下失败。强制 IPv4 也会踩 —— `curl -4 localhost` 在默认绑定下
返回 000。

> 旧记录写的「不要用 `localhost`（会解析到 IPv4）」是错的，2026-10-09 实测推翻。
> 「`127.0.0.1` 连不上」这一半仍然成立。

副作用：默认绑定下生成的图片 URL 里嵌了 `[::1]` 字面量。

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

## 八、本版模板的已知小问题

1. `seed.json` 的 widget 用了过时的 `settings` 键，`npx emdash seed --validate` 会警告：
   > `widgetAreas[0].widgets[3].settings: not applied; widget options belong in "props"`
   应改用 `props`。
2. GitHub 上的模板仓库与 monorepo 有版本分叉 —— 少了 `Byline.astro`、`Pagination.astro`、
   `prose.css`、`utils/locale.ts`，`Base.astro` 908 行 vs monorepo 1498 行。
   **但 lab 版是自洽的**，不要从 monorepo 拷文件过去，会破坏一致性。

---

## 九、版式改造（i18n 之后）

i18n 落地后，按「现有布局不合心意」逐块重排。都是删减，没有新增依赖。

### 文章页：三栏 → 两栏

```
之前:  [左 meta 180px] [正文 680px] [右 TOC 200px]
现在:                   [正文 680px] [右 TOC 200px]
```

- 左栏整个删掉，`.meta-sticky` 移到**标题下方**横排一行：
  作者 · 日期 · 时长 · 标签
- `.meta-label`（「发布于」「阅读时长」「标签」）全部移除 —— 图标已表意，再写一遍冗余
- `.meta-tags` 保留 pill 样式
- 日期用 Tabler `calendar-time`、时长用 `clock`（MIT，内联 SVG 不引依赖）

> **踩到的坑**：`.bylines` 原本是 `flex-direction: column` + `--avatar-size-lg`，
> 那是**左栏 180px 宽**时代的样式。搬到 680px 宽的正文列后竖排把整行撑成三行，
> 和右侧日期完全不在一个基线。改成横排 + 头像 `lg → sm` 才对。
> **读代码看不出来，必须渲染。**

- 底部「继续阅读」三栏卡片区（`.more-posts`）删除，连带 `recentPosts` 查询、
  `getTermsForEntries` 批量查 tag、`PostCard` 的 import 与字典 key

### 侧栏 widget 区：整个删除

`.sidebar-widgets`（搜索 / 分类 / 标签 / 最新文章）连同 `Sidebar.astro` 文件一并删掉。
它是 i18n 阶段为绕过「widget 标题无 locale 列」而自建的，但版式上不属于这里。
右栏现在只剩 TOC。`--gutter-width` 仍被 TOC 使用，保留。

### 页头：两个控件

```
[搜索框]  [首页 关于 文章]  [🌐中文] [☀]
```

- **语言切换**：原来两个并列文字链接合并成单个 globe 控件，当前语言名压在
  globe 右下角（带底色垫片，压在经纬线上也读得清），点击切到下一个语言。
  两语言即互切；**加到三种语言时这个交互就不够用了，得改下拉菜单**。
- **主题切换**：三个按钮 → 一个，去掉「跟随系统」，图标随当前主题出太阳 / 月亮。
  没有 cookie 时仍跟随系统，所以脚本要问 `matchMedia` 才知道此刻生效的是哪个主题
  （光看 cookie 不够）。
- `.nav-toggles` 包住两者：`.nav-right` 在 640px 断点是单列 grid，
  不包一层会被拆成上下两行。

### 页脚：收成一行

```
              由 EmDash 驱动  ⦿))
```

- 删 `footer-grid`（品牌 + 导航 + 连接 + 关于四栏），再去掉 `footer-inner` 包装
- 高度 85px → 49px（padding 从 `spacing-8` 收到 `spacing-3`）
- RSS 入口补回版权行右侧，图标 16px，href 走 `localePath`（中英各自正确）
- 主题按钮已搬到页头，`.footer-bottom` 的 `space-between` 随之失效

### 清理的设计令牌

`--meta-col-width` 与 `--avatar-size-lg` 失去使用者，从 `tokens.css` 删除。
（`--avatar-size-lg` 后来在三栏改造中重新加回，值 40px，见第十四节。）

---

## 十四、全站三栏文档式布局

把「顶部页头 + 单列内容」换成**文档式三栏**：左栏（站主头像/名字/导航）／
中栏（正文）／右栏（文章目录，滚动高亮）。全站生效，不只是文章页。

### 外壳

`Base.astro` 拥有网格，页面只提供内容：

```
┌──────────┬─────────────────────┬──────────┐
│ 头像+名字 │                     │  本页目录  │
│ 首页      │       正文           │  ●        │
│ 关于      │                     │  ○        │
│ 文章      │                     │           │
└──────────┴─────────────────────┴──────────┘
   200px          680px              200px
```

**宽度账（含 Windows 经典滚动条约 17px）**：
`200 + 24 + 680 + 24 + 200 = 1128`，加两侧 padding 48 = 1176，
加滚动条 ≈ **1193** → 断点取 1200。

| 视口 | 布局 |
|---|---|
| ≥1200px | 三栏齐全 |
| 1000–1199px | 左栏 + 中栏；右栏 `display: none` |
| <1000px | 单栏；左栏消失，导航进页头汉堡抽屉 |

**`align-items: start` 是必需的**：默认的 `stretch` 会让 rail 撑满行高，
`position: sticky` 就没有可滚动的余量，看着像没生效。

### 右栏「留空不渲染」

右栏的**轨道**在每一页都保留，只有文章页往里放 TOC（命名 slot
`<slot name="rail" />`）。非文章页就是一个空的 200px 轨道 —— 换来的是
中栏左边缘全站恒定。

改造前实测（1440px）：文章页 `x=260`、首页 `x=120`、列表页 `x=380`、
关于 `x=380` —— 互不相同。改造后全部 `x=380`。这条现在是
`scripts/check-shell.mjs` 的断言，不靠肉眼。

### 抽 TOC 组件时修掉的三个 bug

`TableOfContents.astro` 从 `posts/[slug].astro` 的内联版本抽出来，顺带修了：

1. **没有 `astro:page-load` 重绑** —— ClientRouter 下模块脚本只执行一次，
   走「文章 → 列表 → 另一篇文章」这条全客户端路径，到达时目录是**空的**。
   （实测复现：整页加载 1 条链接，客户端导航后 0 条，而 window 标记存活，
   证明确实没整页刷新。）现在 `check:spa` 会走这条路径并断言目录非空。
2. **`IntersectionObserver` 从不 disconnect** —— 每次重建都留下一个观察者。
   现在存到模块级变量，重建前先 `disconnect()`。
3. **`appendChild` 不幂等** —— 重复执行会追加第二个 `<ul>`。
   现在建列表前先清空容器；断言 `.toc-list` 只有一个。

容器从硬编码 `id="toc-content"` 改成 `data-toc` 属性选择器，同页可以放多个。

### 头像：媒体 URL 只认 storageKey

**这是个既有 bug**：主题里 4 处头像 `<img>` 都用 `credit.byline.avatarMediaId`
（ULID）拼 URL，而 `/_emdash/api/media/file/<key>` 路由是
`storage.download(key)` —— 传 ULID 会 404。只因从没有 byline 设过头像才没暴露。
`BylineSummary.avatarStorageKey`（media 表 LEFT JOIN 填充）才是可用的那个，
已全部改用它（经 `src/utils/media.ts` 的 `mediaUrl()`）。

头像本身复用媒体库里现成的配图，经 `/_image` **服务端裁剪**：

```
/_image?href=<encodeURIComponent('/_emdash/api/media/file/<storageKey>')>
        &w=96&h=96&fit=cover&f=webp&q=85
```

实测 172KB JPEG → **3.7KB** 的 96×96 WebP。`scripts/seed-owner-avatar.mjs`
（`pnpm seed:avatar`）把 byline 指向这张图，幂等，不新增任何资源文件。

> **选图踩的坑**：一开始选了 `notes-on-simplicity.jpg`（白纸几何纹理），
> 截出来在 40px 圆形里**几乎是空白灰点**。换成 `building-long-term.jpg`
> （深色代码屏）后小尺寸下辨识度好得多。
> **只有把候选图并排渲染出来看才知道**，读文件名判断不了。

### `sharp` 必须显式依赖（部署阻断级）

生产构建下 `/_image` 返回 **500 `Could not find Sharp`**。

Astro 把 `sharp` 列为 optional peer；pnpm 的严格 node_modules 布局下，
仅作为传递依赖的 sharp 在 **dev 能解析**（Vite 的解析更宽松）、
**生产构建解析不到**。所以它必须在 `dependencies` 里显式声明。

**这个坑 dev server 永远发现不了** —— 页面全 200，只有 `/_image` 悄悄挂掉。
`pnpm build && pnpm start` 是唯一能验的路径。

### 页头收窄

站名移入左栏，页头只剩：汉堡（<1000px）+ 搜索框 + 语言/主题切换 + 管理链接。

> **scoped 样式的坑**：`.site-search` 是**传给子组件** LiveSearch 的 class，
> 节点上带的是**子组件的** scope 属性，所以 `Base.astro` 里的 `.site-search { ... }`
> 一条都不生效。改成 `:global(.site-search)` 才对 —— 搜索结果下拉的定位
> 就靠这里的 `position: relative`。
> 同理，`<slot />` 投进来的页面节点也没有 Base 的 scope，但外壳的 grid
> 只作用在容器上，不需要 `:global()`。

### 各页让出外层宽度

删掉页面自己的 `max-width` / 水平 padding，交给外壳。**首页与 category/tag
原本是 1200px 三列网格，收进 680px 中栏后必须重排**：featured 改为图上文下
堆叠、文章列表与卡片网格全部单列。

文章 hero 从「跨列出血」改为**收进中栏、位于标题上方**。

### 截图断点补齐

三栏的两个关键行为（<1200 收右栏、<1000 收左栏）原先**没有任何截图覆盖**：
`shots.mjs` 里 `mobile` 断点定义了却没人用，视口硬编码 `BREAKPOINTS.desktop`。
现在循环真正遍历 `BREAKPOINTS`，加了 `tablet: 1100`（落在两栏档），
文件名带上断点（`post-tablet-dark.png`），并新增 `--bp` 参数。
全量从 40 张涨到 **120 张**（20 路由 × 3 断点 × 明暗）。

### 对齐：左栏一条中轴、页头中列居中

两处对齐要求，都是「整体」而非逐块：

**左栏** —— `.rail-identity-wrap` 声明一次
`display:flex; flex-direction:column; align-items:center; text-align:center`，
头像、名字、导航链接全部落在这条中垂线上。收口在容器而不是各子块上，
是为了加新块时自动跟随，不用再写一遍。

**页头 `.nav-right`** —— 要它落在**页面**中垂线上，而 `.nav` 的
`max-width: var(--wide-width)` 居中之后，容器自身的中线才是页面中线
（1440 视口下两者都是 720）。改法是把 `.nav` 从 flex 换成三列网格：

```css
grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
```

两侧等宽、中间按内容宽，中列因此恒定居中。

> **`1fr` 与 `minmax(0, 1fr)` 的区别在这里是要害**。裸 `1fr` 的下限是
> `min-content`，侧列内容一宽就把中列挤偏。实测：用裸 `1fr` 时 999px
> 断点（汉堡刚出现）偏差 0，但这是运气 —— `minmax(0, 1fr)` 才是有保证的写法。

移动端（<640px）**不追求这个居中**：搜索框改为占满剩余宽度，
`grid-template-columns: auto minmax(0, 1fr) auto`，这是有意的取舍。

两条都进了 `check-shell.mjs`（29 条断言）：左栏四项（头像/名字/导航列表/
全部链接）各自与容器中轴比对，`nav-right` 在 8 个桌面断点逐个验偏差 <1px。
这类对齐光靠肉眼看截图分辨不出 0.5px 的偏差，必须量。

### 本轮文件

| 文件 | 改动 |
|---|---|
| `src/layouts/Base.astro` | 三栏外壳、窄页头、汉堡抽屉、左栏数据 |
| `src/components/SiteRail.astro` | **新建**（头像 + 名字 + 导航 + 当前页高亮） |
| `src/components/TableOfContents.astro` | **新建**（抽出 + 修三个 bug） |
| `src/utils/media.ts` | **新建**（`mediaUrl` / `avatarUrl`） |
| `src/utils/site-identity.ts` | 加 `OWNER_BYLINE_SLUG` |
| `scripts/seed-owner-avatar.mjs` | **新建**（幂等设置头像） |
| `scripts/check-shell.mjs` | **新建**（29 条几何 + 对齐断言） |
| `scripts/check-spa.mjs` | 加 4 条 TOC 回归断言 |
| `scripts/shots.mjs` | 断点矩阵补 `tablet: 1100`；循环真正遍历断点（原先硬编码 desktop）；加 `--bp` |
| `src/pages/*.astro` | 让出外层宽度、网格重排、修头像 URL |
| `src/styles/tokens.css` | 加 `--rail-width` / `--avatar-size-lg`；删 `--gutter-width` |
| `package.json` | 加 `sharp` 直接依赖、`seed:avatar`、`check:shell` |

---

## 十、本次改动

| 文件 | 改动 | 验证方式 |
|---|---|---|
| `src/styles/theme.css` | 柑橘色主色（`#E86233`）、圆角调大、标题减重 | 搜索页截图按钮变橙；页面 CSS 输出确认 |
| `astro.config.mjs` | 正文字体 Inter → **Public Sans** | 页面 `font-family` 输出确认 |
| `src/i18n/`、`src/pages/[locale]/`、`src/components/{LanguageSwitcher,ThemeSwitcher}.astro`、`src/utils/rss.ts` | 全量 i18n（zh 默认 + en） | 见第五节；40 张截图 + 双语文案断言 |
| `seed/seed.json` | 改写为双语内容（16 posts + 2 pages + 双语分类法/菜单） | 重建数据库后中英页面均正常 |
| `scripts/seed-bylines-i18n.mjs`、`seed/bylines-i18n.json` | 补齐 byline 的语言行 | 中英文章页均显示署名 |
| `package.json`、`astro.config.mjs` | math 插件依赖键改用真实包名 `@ak-103u/emdash-plugin-math` | `pnpm install` 后 dev server 正常 |
| `src/layouts/Base.astro` | head 加 `<ClientRouter />`；主题切换脚本改为 `astro:page-load` 驱动 | 见第六节；`pnpm check:spa` 10/10 |
| `scripts/check-spa.mjs`、`package.json` | 收编客户端导航回归断言，加 `pnpm check:spa` | 上述 10/10 即由它跑出 |

**明确没动**：`src/live.config.ts`（boilerplate）、`Base.astro` 的数据获取逻辑与 `EmDashHead` 钩子。

---

## 十一、验证清单（全部通过）

- [x] `pnpm dev` 启动无错，`emdash-env.d.ts` 生成 2 个集合
- [x] 路由状态码正确：`/` `/en` `/posts` `/en/posts` 中英详情页、`/pages/about`、`/en/category/*`、`/en/tag/*`、`/search`、`/en/search`、`/rss.xml`、`/en/rss.xml` 全 200；`/xx/posts/foo` → 302；`/_emdash/admin` → 302
- [x] 40 张截图（20 路由 × 2 模式）无样式错乱
- [x] `theme.css` 覆盖生效，`light-dark()` 两模式各自取值
- [x] 字体管线切换生效
- [x] `pnpm typecheck` → 0 errors / 0 warnings / 0 hints
- [x] 搜索正常（"frameworks" 4 条、"simplicity" 1 条）
- [x] 图片管线正常（`/_image` 返回 44KB webp）
- [x] 双语 UI 文案（导航、页脚、侧边栏、文章 meta、搜索、评论）与 `<html lang>` 各自正确
- [x] hreflang 注入绝对 URL + `x-default`；单语言文章只输出实际存在的语言
- [x] RSS `<language>` 按 locale 输出（`zh-CN` / `en-US`）
- [x] 语言切换器双向可达；中英文章页署名均显示
- [x] 回退提示：zh 页显示「本文暂无中文版本…」，en 页显示 "not yet available…"
- [x] ClientRouter：切语言/进详情页均不整页刷新，`<html lang>`、`<title>`、`canonical`、hreflang 跟着换，后退正常，无 page error（`pnpm check:spa` 10/10）
- [x] ClientRouter 下主题切换：导航后仍可点（单按钮，class 与图标同步翻转）
- [x] prefetch 悬停生效，且客户端导航后仍工作
- [x] 版式改造（见第九节）：meta 在标题下方，≥900px 时四个块同一行、390px 折两行；
      `.meta-label`、`.sidebar-widgets` 均不存在；正文列宽仍 680px
      （~~左栏不存在~~ 该条已被第十四节的三栏布局推翻）
- [x] 三栏布局（见第十四节）：中栏左边缘在文章/首页/列表/关于/搜索五者间恒为 x=380
      （改造前 260/120/380/380 各不相同）；≥1200 三栏、1000–1199 两栏、
      <1000 单栏 + 汉堡；非文章页右栏轨道在但内容空（`pnpm check:shell` 22/22）
- [x] TOC 三个 bug 修复：客户端导航后目录非空（抽组件前为 0）、`.toc-list` 幂等、
      observer 重建前 disconnect（`pnpm check:spa` 14/14）
- [x] 头像：40px 圆形、`naturalWidth=96`（证明走服务端裁剪而非 CSS 拉伸）、
      中英各自显示「EmDash 编辑部」/「EmDash Editorial」
- [x] **生产构建验证**：`pnpm build && pnpm start` 后 `/_image` 返回 200 +
      3.7KB WebP（dev 下正常但生产 500 —— `sharp` 必须显式依赖，见第十四节）
- [x] 单按钮主题切换：系统亮/暗两种偏好下各跑一遍（初始图标符合系统、点击后翻转、
      cookie 落盘、刷新保持、导航后仍可点）16/16
- [x] 页脚几何：1440/640/390 三个宽度高度均 49px，RSS 紧邻版权右侧 12px

---

## 十二、下一步可选方向

- ~~决定 `test/spa` 分支的去留~~ —— 2026-10-09 已用 `--no-ff` 合并进 `main`
  （合并提交 `6760d1c`），分支已删。ClientRouter 的验证脚本收进 `scripts/check-spa.mjs`。
- ~~重做主题布局~~ —— 已完成：第九节按块删减（文章页两栏化、侧栏 widget 删除、
  页头两个控件、页脚收成一行），第十四节换成全站三栏文档式外壳。
- **`AGENTS.md` 已同步** —— 版式描述、字体、品牌色、令牌清单、i18n、客户端导航、
  三栏外壳与图片四节都更新过。改动版式时记得一并维护。
- ~~`scripts/shots.mjs` 的断点矩阵偏少~~ —— 2026-10-09 已补：加了 `tablet: 1100`
  （两栏，右栏收）并让循环真正遍历 `BREAKPOINTS`（此前 `mobile` 定义了却没人用，
  视口硬编码 `BREAKPOINTS.desktop`）。文件名改为 `<页面>-<断点>-<模式>.png`，
  新增 `--bp` 参数。全量 120 张。
- **做 Cloudflare 变体**：D1 + R2 + `wrangler.jsonc` + `worker.ts`。
  注意 `/_image` 在 Cloudflare 走的是 `IMAGES` binding 而非 sharp（见
  `emdash/dist/media/image-endpoint.mjs` 的平台分支），`sharp` 那条依赖可以去掉。
- **发布成 GitHub 模板**：`npm create astro@latest -- --template github:<you>/emdash-lab`。
- **改 seed 做原创内容模型**：加 collection / 字段 / 自定义 PT 块（后者需要 native 插件注册编辑器）。
- **补第三语言**：`siteConfig.locales` 加一项、`src/i18n/<lang>.json` 加字典、
  `src/pages/[locale]/` 薄壳自动生效（薄壳按 `isLang` 校验，无需逐个改）。
  注意语言切换器现在是「点击切到下一个语言」的单控件，**加到三种语言就得改下拉**。

---

## 十三、速查

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

# 生产构建 —— /_image 与 sharp 只有这条路径能验（见第十四节）
pnpm build && pnpm start    # 默认 4321；换端口用 PORT=4400 pnpm start

npx emdash seed --validate  # 只校验 seed
npx emdash seed             # 应用 seed（含示例内容）
npx emdash types            # 重新生成类型
npx emdash doctor           # 诊断数据库与配置
```

Admin UI: `http://localhost:4321/_emdash/admin`
Dev 后门（跳过登录）: `/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin`
