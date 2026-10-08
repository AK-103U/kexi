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
├── astro.config.mjs      # output:"server" + adapter + emdash() 集成 + 字体
├── package.json          # emdash.seed 指向 seed 文件
├── emdash-env.d.ts       # 生成的类型，勿手改
├── seed/seed.json        # 内容模型 + 示例内容
├── scripts/shots.mjs     # 自建截图脚本（见第五节）
└── src/
    ├── live.config.ts    # 注册 _emdash live collection（boilerplate）
    ├── pages/            # 公开路由，全部服务端渲染
    ├── layouts/Base.astro
    ├── components/PostCard.astro
    └── styles/           # tokens.css / theme.css
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

## 五、本机环境的坑（Windows）

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

### 服务器只监听 IPv6

dev server 绑在 `[::1]:4321`，`127.0.0.1` **连不上**。

- 用 `curl "http://[::1]:4321/..."`，不要用 `localhost`（会解析到 IPv4）
- 副作用：生成的图片 URL 里嵌了 `[::1]` 字面量

### 其他

- Node 里 `/tmp/xxx` 会被解析成 `F:\tmp\xxx`，临时文件放项目目录内
- 数据库可用 Node 24 内置的 `node:sqlite` 直接查（`DatabaseSync`），无需装 sqlite3

---

## 六、本版模板的已知小问题

1. `seed.json` 的 widget 用了过时的 `settings` 键，`npx emdash seed --validate` 会警告：
   > `widgetAreas[0].widgets[3].settings: not applied; widget options belong in "props"`
   应改用 `props`。
2. GitHub 上的模板仓库与 monorepo 有版本分叉 —— 少了 `Byline.astro`、`Pagination.astro`、
   `prose.css`、`utils/locale.ts`，`Base.astro` 908 行 vs monorepo 1498 行。
   **但 lab 版是自洽的**，不要从 monorepo 拷文件过去，会破坏一致性。

---

## 七、本次改动

| 文件 | 改动 | 验证方式 |
|---|---|---|
| `src/styles/theme.css` | 柑橘色主色（`#E86233`）、圆角调大、标题减重 | 搜索页截图按钮变橙；页面 CSS 输出确认 |
| `astro.config.mjs` | 正文字体 Inter → **Public Sans** | 页面 `font-family` 输出确认 |

**明确没动**：`src/live.config.ts`（boilerplate）、`Base.astro` 的 head/body 钩子与数据获取逻辑。

---

## 八、验证清单（全部通过）

- [x] `pnpm dev` 启动无错，`emdash-env.d.ts` 生成 2 个集合
- [x] 9 条路由状态码正确（7×200 + 1×404 + RSS 200）
- [x] 16 张截图（8 路由 × 2 模式）无样式错乱
- [x] `theme.css` 覆盖生效，`light-dark()` 两模式各自取值
- [x] 字体管线切换生效
- [x] `pnpm typecheck` → 0 errors / 0 warnings / 0 hints
- [x] 搜索正常（"frameworks" 4 条、"simplicity" 1 条）
- [x] 图片管线正常（`/_image` 返回 44KB webp）

---

## 九、下一步可选方向

- **接回 math 插件**：`plugins: [mathPlugin()]`。注意已知的 KaTeX 字体 Vite `server.fs.allow` 问题 ——
  插件包在 monorepo 外时 dev 下字体 404（生产构建不受影响）。
- **做 Cloudflare 变体**：D1 + R2 + `wrangler.jsonc` + `worker.ts`。
- **发布成 GitHub 模板**：`npm create astro@latest -- --template github:<you>/emdash-lab`。
- **移植 citrus-grid 的设计语言**：它有完整的三语言 i18n、评论、系列、音乐播放器等。
- **改 seed 做原创内容模型**：加 collection / 字段 / 自定义 PT 块（后者需要 native 插件注册编辑器）。

---

## 十、速查

```bash
cd F:/dev/blog/emdash-lab

pnpm dev                    # 启动（注意用 [::1] 访问）
pnpm typecheck              # 类型检查
node scripts/shots.mjs      # 截图

npx emdash seed --validate  # 只校验 seed
npx emdash seed             # 应用 seed（含示例内容）
npx emdash types            # 重新生成类型
npx emdash doctor           # 诊断数据库与配置
```

Admin UI: `http://localhost:4321/_emdash/admin`
Dev 后门（跳过登录）: `/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin`
