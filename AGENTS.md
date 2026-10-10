# EmDash Blog Template — 快速上手与规则

## Commands

```bash
pnpm dev              # Start the Astro dev server
pnpm typecheck        # astro check
pnpm check:spa        # Client-side navigation + TOC assertions (needs a running server)
pnpm check:shell      # Shell/header/footer geometry, alignment, no-drift at every breakpoint (needs a running server)
pnpm seed:bylines     # Backfill per-locale byline rows (restart dev afterwards)
pnpm seed:avatar      # Point the site-owner byline at an avatar image (restart dev afterwards)
npx emdash types      # Regenerate TypeScript types from a running site
```

The admin UI is at `http://localhost:4321/_emdash/admin`.

`NOTES.md` 记录踩坑过程与环境特异性坑，改布局前先读它。`DESIGN.md` 是设计令牌的规范层。

**注意：不要在 commit 消息或 PR 描述中自动添加 Co-Authored-By / Generated with Claude Code 等署名行。**

## Key Files

| File                          | Purpose                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `astro.config.mjs`            | Astro config with `emdash()` integration, database, and storage                    |
| `src/i18n/config.ts`          | Single source of truth for locales; imported by `astro.config.mjs` and theme code  |
| `src/i18n/{zh,en}.json`       | UI dictionary (`MessageKey` derives from `zh.json`)                                |
| `src/live.config.ts`          | EmDash loader registration (boilerplate -- don't modify)                           |
| `seed/seed.json`              | Schema definition + bilingual demo content                                         |
| `seed/bylines-i18n.json`      | Per-locale byline copy overrides                                                   |
| `emdash-env.d.ts`             | Generated types for collections (auto-regenerated on dev server start)             |
| `src/layouts/Base.astro`      | Base layout: three-column shell, header, footer, drawer, EmDash wiring            |
| `src/components/SiteIdentity.astro` | Header's owner avatar + name -- avatar-centred, name hangs off its right    |
| `src/components/SiteRail.astro` | Left rail contents -- site navigation (the owner identity moved to the header)  |
| `src/components/TableOfContents.astro` | Right rail contents -- TOC with scroll highlighting                       |
| `src/utils/media.ts`          | Media URLs (`mediaUrl`, `avatarUrl`) -- storageKey only, see below                 |
| `src/pages/`                  | Astro pages -- all server-rendered                                                 |
| `scripts/shots.mjs`           | Screenshot script -- 20 routes × 3 breakpoints (desktop/tablet/mobile) × light/dark; `--only <page>`, `--bp <name>` |
| `scripts/check-spa.mjs`       | Client-side navigation + TOC regression assertions                                 |
| `scripts/check-shell.mjs`     | Shell/header/footer geometry, alignment, and no-drift assertions (49 checks)         |

## Skills

Agent skills are in `.agents/skills/`. Load them when working on specific tasks:

- **building-emdash-site** -- Querying content, rendering Portable Text, schema design, seed files, site features (menus, widgets, search, SEO, comments, bylines). Start here.
- **creating-plugins** -- Building EmDash plugins with hooks, storage, admin UI, API routes, and Portable Text block types.
- **emdash-cli** -- CLI commands for content management, seeding, type generation, and visual editing flow.

## Documentation

The EmDash docs are available as an MCP server at `https://docs.emdashcms.com/mcp`. When you need to verify an API, hook, config option, field type, or pattern, call `search_docs` against the live documentation rather than relying on training-data recall. The docs reflect current behaviour; assumptions may not.

This template ships with `.mcp.json`, `.cursor/mcp.json`, and `.vscode/mcp.json` so Claude Code, Cursor, and VS Code auto-discover the docs server. Other tools (OpenCode, Windsurf, etc.) need a manual one-time setup -- see [docs.emdashcms.com/docs-mcp](https://docs.emdashcms.com/docs-mcp).

## Rules

- All content pages must be server-rendered (`output: "server"`). No `getStaticPaths()` for CMS content.
- Image fields are objects (`{ src, alt }`), not strings. Use `<Image image={...} />` from `"emdash/ui"`.
- `entry.id` is the slug (for URLs). `entry.data.id` is the database ULID (for API calls like `getEntryTerms`).
- **Media URLs take a storageKey, never a media id.** `/_emdash/api/media/file/<key>` calls `storage.download(key)`, so passing the ULID 404s. Use `mediaUrl()` / `avatarUrl()` from `src/utils/media.ts`, and read `byline.avatarStorageKey` (populated by the media LEFT JOIN), not `avatarMediaId`.
- When Astro's cache is enabled, pass content-query hints to `Astro.cache.set(cacheHint)`. Use the `WithCacheHint` variants for site settings, menus, taxonomies, and widget areas rendered by cached routes.
- Taxonomy names in queries must match the seed's `"name"` field exactly (e.g., `"category"` not `"categories"`).

## Pages

| Page        | Path               | What it shows                                                                          |
| ----------- | ------------------ | -------------------------------------------------------------------------------------- |
| Home        | `/`                | Featured post (image above title), latest posts stack                                 |
| All posts   | `/posts`           | Article count, full post list with excerpts and tag chips                              |
| Post detail | `/posts/[slug]`    | Featured image, title, meta row under the title (bylines, date, reading time, tags), body, right-rail TOC |
| Search      | `/search`          | Full-text search UI                                                                    |
| Page        | `/pages/[slug]`    | Static page content (Portable Text)                                                    |
| Category    | `/category/[slug]` | Posts filtered by category                                                             |
| Tag         | `/tag/[slug]`      | Posts filtered by tag                                                                  |
| RSS         | `/rss.xml`         | Generated feed                                                                         |

Every public route also exists under `/en` (`src/pages/[locale]/` holds thin shells that re-render the default-locale page with `locale` set). See i18n 节.

## i18n（中文默认 + 英文变体）

Two locales: **`zh`（默认，无前缀）+ `en`（`/en` 前缀）**。`src/i18n/config.ts` 是唯一真源，`astro.config.mjs` 与主题代码都 import 它。

- **薄壳路由**：非默认语言在 `src/pages/[locale]/` 下挂薄壳（4 行），薄壳 import 主页面并传 `locale`，主页面声明 `interface Props { locale?: string }`。薄壳必须校验 locale 合法性，非法则 `Astro.redirect("/404")`。
- **Pages 自取 locale**：`getLang(Astro)` off `Astro.currentLocale`。No prop drilling.
- **显式传 `{ locale }`**：匿名请求的 ALS 上下文里没有 locale，每次数据调用都要传 `{ locale }`：`getEmDashCollection` / `getEmDashEntry` / `getMenu` / `getTaxonomyTerms` / `getTermsForEntries` / `search`。
- **链接用 `localePath(lang, path)`**：永远不要用手工拼接字符串；非默认语言里 `entry.id` 带前缀（`en/foo`），但 `entry.data.slug` 不带。
- **Content row-per-locale**：同 slug 两条，zh 加 `translationOf` 指向 en 条目的 seed id。
- **列表查询不 fallback**：只有 zh 的文章不会出现在 `/en/posts`；详情页有 fallback，显示「本文暂无中文版本」。
- **Not translatable**：settings / widgetAreas 没有 locale 列（页头页脚改为自建，文案走 UI 字典）。
- **UI 字典**：`src/i18n/{zh,en}.json`；`MessageKey` 从 zh.json 推导，en 少 key 会编译报错。

详见 NOTES.md i18n 机制坑章节。

## 三栏文档式布局（Base.astro）

`Base.astro` 拥有网格，页面只提供内容。Page components 必须**不声明外层 `max-width` / 水平 padding**。

- `.shell` = `grid-template-columns: var(--rail-width) minmax(0, var(--content-width)) var(--rail-width)`，`align-items: start`。**`stretch` 会让 sticky rail 滚不动**。
- 右栏轨道**每页都在**（非文章页空 200px 轨道），保证正文列 x 坐标全站恒定。
- `html { scrollbar-gutter: stable }` —— 短页面有滚动条槽位，客户端导航时外壳不横移。
- **.nav 与 .shell 共用列几何**：头像在左栏居中即落在壳的中轴上，改 `--rail-width` 两边自动跟随。
- **页脚常驻视口底**：`body flex` + `.shell flex:1`（短页推底）与 `.site-footer sticky bottom`（长页拉回）缺一不可。z-index: footer 90 < header 100 < 搜索下拉 1000。
- **SPA 不漂移**：sticky 位必须等于静止位，两者从同一变量推导。

详见 NOTES.md SPA 漂移的两个独立根因章节。

## 组件样式覆盖（ LiveSearch 等）

第三方组件的 scoped 样式特异性可能压过主题：

1. **优先设组件自己的 custom property**：`--emdash-search-bg`、`--emdash-math-*` 等，自定义属性不参与 specificity 比较。
2. **硬编码的值才允许 `!important`**：`border` / `border-radius` / `padding` / `font-size`。

`check:shell` 断言的是**计算样式**而非源码，这类失败肉眼不可见。

详细见 NOTES.md scoped 样式失效章节。

## Images

`/_image` 做服务端裁剪：`?w=96&h=96&fit=cover&f=webp` 把 1200×800 JPEG 转成 3.7KB WebP。

**`sharp` 必须是直接依赖**：生产构建下 `/_image` 返回 500 `Could not find Sharp`。dev 正常不代表生产没事，必须 `build && start` 验证。

## ClientRouter（客户端导航 + prefetch）

`<ClientRouter />` 让站内点击只换 document，不整页刷新。首屏 SSR、爬虫 HTML、RSS、hreflang 全部保留。

- **模块脚本跑一次 → `astro:page-load` 驱动初始化**：theme switcher / nav drawer / TOC 都用 `onclick`（重复执行不叠加）。
- **Failure is silent**：退回到整页刷新也不报错。`pnpm check:spa` 通过 window 标记存活来检测。
- Prefetch 默认开（悬停 80ms 触发），客户端导航后仍工作。

TOC 的 bug 修复：抽组件 + `disconnect()` observer + 重建前清空容器幂等。

## Schema

- `posts`: `title`, `featured_image`, `content` (Portable Text), `excerpt`.
- `pages`: `title`, `content` (Portable Text)。
- Taxonomies: `category`, `tag`.
- Menu: single `primary` menu.

Site settings: `title` + `tagline`（全局单值，无 locale）。

## Visual character & Customisation

品牌色为柑橘橙 `#e86233`，一页一橙原则。字体单一字族 Public Sans（标题字号层级），JetBrains Mono 用于代码。令牌在 `src/styles/tokens.css`，覆盖到 `theme.css`，改视觉只动这里。双模式用 `light-dark()`，不维护独立暗色板。

详见 DESIGN.md §4–7 颜色 / 字体 / 尺度章节。

## What not to do

- 不加第二个 accent 色、不加彩色区块背景。
- 不换展示型字体替代 Public Sans。
- 不让页面组件声明外层 max-width/padding，不让右栏轨道消失。
- 不用 `avatarMediaId` 拼 URL，用 `avatarStorageKey` via `mediaUrl()`。
- 不用 stock blog copy，示例内容不三连占位 post。
- 评论功能需配置 moderation 再发布，或用 `commentsEnabled=false` 移除 UI。

---

本文档已同步到 AGENTS.md 的版本控制：版式描述、字体、品牌色、令牌清单、i18n、客户端导航、三栏外壳与图片四节都已更新。改动版式时记得一并维护。
