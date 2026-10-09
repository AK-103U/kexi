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
├── scripts/shots.mjs              # 自建截图脚本（见第六节）
├── scripts/seed-bylines-i18n.mjs  # 补齐 byline 的语言行（见第五节）
└── src/
    ├── live.config.ts             # 注册 _emdash live collection（boilerplate）
    ├── i18n/                      # config.ts（单一真源）/ ui.ts / zh.json / en.json
    ├── pages/                     # 默认语言（zh）公开路由，全部服务端渲染
    ├── pages/[locale]/            # 其他语言的薄壳路由（见第五节）
    ├── layouts/Base.astro
    ├── components/                # PostCard / LanguageSwitcher / Sidebar
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
| settings / widgetAreas 没有 locale 列 | 站名与标语全局单值；侧边栏、页脚改为自建（`Sidebar.astro` + Base.astro 里的 `footer-nav`），标题走 UI 字典 |
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

## 六、本机环境的坑（Windows）

官方 `pnpm screenshots` **完全不可用**：

1. 依赖 `lsof` 查/杀端口 —— 本机没有
2. 调用 `pnpm bootstrap` —— 模板的 package.json 里**已无此脚本**
3. `rsync` 同样缺失，`sync-*.sh` 也用不了

替代方案 `scripts/shots.mjs`：

- 用 `playwright-core`（**不是** `playwright` —— 后者 postinstall 会下载浏览器）
- `chromium.launch({ channel: "chrome" })` 复用系统 Chrome
- 遍历 8 个路由 × 明暗两模式

```bash
node scripts/shots.mjs              # 全部
node scripts/shots.mjs --only post  # 单个
node scripts/shots.mjs --full       # 整页
```

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

## 七、本版模板的已知小问题

1. `seed.json` 的 widget 用了过时的 `settings` 键，`npx emdash seed --validate` 会警告：
   > `widgetAreas[0].widgets[3].settings: not applied; widget options belong in "props"`
   应改用 `props`。
2. GitHub 上的模板仓库与 monorepo 有版本分叉 —— 少了 `Byline.astro`、`Pagination.astro`、
   `prose.css`、`utils/locale.ts`，`Base.astro` 908 行 vs monorepo 1498 行。
   **但 lab 版是自洽的**，不要从 monorepo 拷文件过去，会破坏一致性。

---

## 八、本次改动

| 文件 | 改动 | 验证方式 |
|---|---|---|
| `src/styles/theme.css` | 柑橘色主色（`#E86233`）、圆角调大、标题减重 | 搜索页截图按钮变橙；页面 CSS 输出确认 |
| `astro.config.mjs` | 正文字体 Inter → **Public Sans** | 页面 `font-family` 输出确认 |
| `src/i18n/`、`src/pages/[locale]/`、`src/components/{LanguageSwitcher,Sidebar}.astro`、`src/utils/rss.ts` | 全量 i18n（zh 默认 + en） | 见第五节；40 张截图 + 双语文案断言 |
| `seed/seed.json` | 改写为双语内容（16 posts + 2 pages + 双语分类法/菜单） | 重建数据库后中英页面均正常 |
| `scripts/seed-bylines-i18n.mjs`、`seed/bylines-i18n.json` | 补齐 byline 的语言行 | 中英文章页均显示署名 |
| `package.json`、`astro.config.mjs` | math 插件依赖键改用真实包名 `@ak-103u/emdash-plugin-math` | `pnpm install` 后 dev server 正常 |

**明确没动**：`src/live.config.ts`（boilerplate）、`Base.astro` 的 head/body 钩子与数据获取逻辑。

---

## 九、验证清单（全部通过）

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

---

## 十、下一步可选方向

- **重做主题布局** —— 用户明确说现有布局不符合心意，i18n 之后单独做这一项。
  路由已按 locale 分好，改布局时只需动 `src/pages/*.astro` 与 `Base.astro` 的单点。
- **做 Cloudflare 变体**：D1 + R2 + `wrangler.jsonc` + `worker.ts`。
- **发布成 GitHub 模板**：`npm create astro@latest -- --template github:<you>/emdash-lab`。
- **改 seed 做原创内容模型**：加 collection / 字段 / 自定义 PT 块（后者需要 native 插件注册编辑器）。
- **补第三语言**：`siteConfig.locales` 加一项、`src/i18n/<lang>.json` 加字典、
  `src/pages/[locale]/` 薄壳自动生效（薄壳按 `isLang` 校验，无需逐个改）。

---

## 十一、速查

```bash
cd F:/dev/blog/emdash-lab

pnpm dev                    # 启动（默认只绑 ::1，localhost 或 [::1] 都能访问）
pnpm dev --host             # 需要 127.0.0.1 或局域网访问时
pnpm typecheck              # 类型检查
node scripts/shots.mjs      # 截图（含 en 变体）
pnpm seed:bylines           # 补齐 byline 的语言行（跑完重启 dev）

npx emdash seed --validate  # 只校验 seed
npx emdash seed             # 应用 seed（含示例内容）
npx emdash types            # 重新生成类型
npx emdash doctor           # 诊断数据库与配置
```

Admin UI: `http://localhost:4321/_emdash/admin`
Dev 后门（跳过登录）: `/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin`
