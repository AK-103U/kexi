# 开发指南

本项目使用 Astro 服务端渲染、EmDash，并部署到 Cloudflare Workers，内容存储在 D1，媒体存储在 R2。安装、本地开发和部署见 [README](../README.md)，视觉约定见 [DESIGN](../DESIGN.md)，检查方法见 [验证指南](./verification.md)。部署选择与边界见 [ADR 0002](./adr/0002-emdash-theme-on-cloudflare.md)。

## 实现入口

| 任务 | 主要位置 |
|---|---|
| 运行时、数据库、存储、插件和字体配置 | [astro.config.mjs](../astro.config.mjs) |
| Worker 入口、资源绑定和定时任务 | [src/worker.ts](../src/worker.ts)、[wrangler.jsonc](../wrangler.jsonc) |
| 内容集合、分类法和演示内容 | [seed/seed.json](../seed/seed.json) |
| 页面语言、路径和界面文案 | [src/i18n/config.ts](../src/i18n/config.ts)、[ui.ts](../src/i18n/ui.ts) 与同目录字典 |
| 公开页外壳、单份左栏与客户端导航 | [Base.astro](../src/layouts/Base.astro) |
| 页脚布局、CMS 联系链接和社交链接 | [SiteFooter.astro](../src/components/SiteFooter.astro)、[Base.astro](../src/layouts/Base.astro) |
| 页面查询与正文渲染 | [src/pages](../src/pages/) |
| 正文代码块渲染与语法着色 | [CodeBlock.astro](../src/components/CodeBlock.astro) |
| 上传媒体和头像 URL | [media.ts](../src/utils/media.ts) |
| 署名语言回退 | [bylines.ts](../src/utils/bylines.ts) |
| 项目级 MCP 配置（EmDash 文档服务） | [.pi/mcp.json](../.pi/mcp.json) |

[src/live.config.ts](../src/live.config.ts) 注册 EmDash loader；[emdash-env.d.ts](../emdash-env.d.ts) 是生成的内容类型，[worker-configuration.d.ts](../worker-configuration.d.ts) 是生成的绑定类型。修改集合或绑定后重新生成对应类型，不手工维护生成文件。

## 内容查询与渲染

集合和字段以 seed 为准。当前有 `posts`、`pages` 两个集合，分类法名为 `category`、`tag`，导航菜单名为 `primary`。主导航从 CMS 菜单读取，但根路径项不渲染，因为侧栏品牌身份本身链接到首页。查询名称使用 seed 的 `name`，例如 `category`，而不是 `categories`。

公开内容页保持 `output: "server"`。内容来自 CMS，正文使用结构化富文本（Portable Text），由 `PortableText` 分发给 Astro 组件。Astro 的 Markdown 高亮配置和 rehype 插件不参与这条正文渲染路径。

内容标识需要区分。`entry.data.slug` 是裸 slug，生成页面链接用它配合 `localePath()`；`entry.data.id` 是数据库 ULID，用于内容 API。`entry.id` 由 loader 的 `entryIdForRow()` 构造：默认语言下等于裸 slug，非默认语言下为 `{locale}/{slug}`，因此不能直接拼 URL（会得到 `/posts/en/foo` 这样的路径）；它只在需要「语言限定的唯一键」时使用。

图片字段是对象，使用 `emdash/ui` 的 `<Image image={...} />`。媒体直链使用存储键（storageKey），通过 `mediaUrl()` 构造；署名头像读取 `avatarStorageKey`，媒体 ID 和 `avatarMediaId` 用于数据库关联，不能替代存储键拼文件 URL。署名头像统一通过 `avatarUrl()` 生成 `/_image` 地址，将头像等比缩放到方形画布并保留完整图像（`fit=contain`），避免头像图标被中心裁切；首页、列表、文章详情和侧栏都应使用该函数，不要直接用 `mediaUrl()` 输出头像原图。在 Cloudflare 下由 Images binding 处理，不依赖 `sharp`。站主未设置头像时回退到内置的 `public/logo.webp`，站主可在后台为自己的署名上传头像。

启用 Astro 路由缓存时，将查询结果的 `cacheHint` 交给 `Astro.cache.set()`。页面共同读取的菜单和站点设置使用相应的 `WithCacheHint` 查询；新增缓存页面时检查它读取的内容是否都能参与失效。

页脚的联系链接来自 EmDash `footer` 菜单，社交平台 URL 或账号来自站点设置 `social`；未配置的链接不渲染。RSS 路径由当前语言生成，社交标志使用 `@fortawesome/free-brands-svg-icons` 的路径内联渲染，不请求第三方图标服务。Font Awesome Free Brands 图标来源为 Fonticons, Inc.，按 CC BY 4.0 发布（[Font Awesome Free](https://fontawesome.com/license/free)、[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)）；前台保留本地化的 EmDash 驱动署名，EmDash 链接使用品牌强调色；不显示项目徽章或图标库署名。

## 国际化

语言配置以 [config.ts](../src/i18n/config.ts) 为准：当前中文 `zh` 无前缀，英文 `en` 使用 `/en`。`astro.config.mjs` 读取这份配置；上线前将 `siteUrl` 改为站点的公开绝对 URL，用于 SEO 和语言替代链接。

[src/pages/[locale]](../src/pages/[locale]/) 是非默认语言的薄壳：验证 `locale` 后，导入主页面并传入该属性。主页面使用 `pageLang(Astro.props, Astro)`，优先读取显式属性，再回退到 `Astro.currentLocale`，并向 `Base` 传递 `lang`。新增页面沿用这条路径。

本项目查询内容、菜单、分类法和搜索时显式传 `{ locale: lang }`。匿名请求的上下文不能代替页面明确选择的语言。链接使用 `localePath(lang, path)`，语言切换器保留查询串。

列表按请求语言读取，不混入其他语言的内容。详情查询支持回退：EmDash 将默认语言加到回退链末尾，因此英文可回退到中文；当前文章和页面详情还手动补充中文到英文的查询，并显示回退提示（文章用 `post.translatedNotice`，页面用 `page.translatedNotice`）。内容每种语言各有一行，演示数据通过 `translationOf` 关联，同一翻译组使用共同 slug。站点设置和 widget areas 是全局数据，界面文案由本项目字典处理。

UI 字典在 [zh.json](../src/i18n/zh.json) 与 [en.json](../src/i18n/en.json)。`MessageKey` 从中文推导，约束调用时使用的 key；当前类型声明**不保证英文覆盖全部中文 key**。修改文案时同步两份字典并核对 key 和插值参数。缺失翻译在开发模式下警告，显示原 key。

默认语言保持无前缀。历史上启用 `routing.prefixDefaultLocale: true` 曾导致后台路由 404，记录见 [探索笔记](../NOTES.md#语言配置与署名)。当前不配置 Astro 的路由级 `i18n.fallback`，详情回退由内容查询处理。

页面字体按语言选择：中文正文和标题使用 Lato，英文使用 Public Sans。`Base.astro` 按语言加载对应字体；Lato 不含中文字形，中文页的汉字由系统字体回退呈现。字体及字重配置见 `astro.config.mjs`。文章 `excerpt` 字段不在公开页面界面渲染，仍保留给 SEO 描述作为后备值，并作为 RSS 条目描述；编辑器单独填写的 SEO 描述优先。

正文分隔线使用 EmDash Portable Text 的 `break` 块或 HTML `<hr>` 显式插入，不会自动加在每个 H2 前。Astro Markdown 的 `---` 也会输出 `<hr>`；中文页面会将这类分隔线渲染为居中 `100px × 2px` 短线，上下间距 `40px`。

## 代码块

正文中的代码块由 [CodeBlock.astro](../src/components/CodeBlock.astro) 渲染，内部用 Astro 内置的 `<Code />` 调用 Shiki 着色，输出 `github-light` / `github-dark` 双主题，用 `light-dark()` 跟随站点明暗模式。右上角复制按钮用浏览器 Clipboard API 复制当前代码块文本，提供中英标签及成功/失败反馈；不新增依赖。

EmDash 的 Portable Text 渲染把 `code` 类型的块交给该组件，页面用 `components={{ type: { code: CodeBlock } }}` 接入。`mergeComponents` 按键浅合并，只覆盖 `code`，`image`、`table` 等内置类型保持不变。

正文是 Portable Text，没有 Markdown AST，因此 Astro 的 `markdown.shikiConfig` 不参与正文着色；调整代码块渲染时改组件，而不是改 Markdown 配置。决定与边界见 [ADR 0004](./adr/0004-code-block-syntax-highlighting.md)。

## 客户端导航

`Base.astro` 使用 `ClientRouter`，首屏仍由服务端生成 HTML，站内点击交给客户端导航。模块脚本只在首次加载执行，替换页面节点后通过 `astro:page-load` 重新绑定主题切换器、抽屉和目录（Table of Contents）。代码复制使用文档级事件委托并做幂等初始化，适配客户端导航且避免重复绑定。节点事件使用 `onclick` 赋值，目录重建前清空容器并断开旧观察者，避免重复绑定和追加。

主题选择保存在 cookie 中，`.light`、`.dark` 类驱动 `color-scheme`；`astro:before-swap` 将选择带到新文档。新增页面交互时检查首次打开和连续导航两个路径，验证方式见 [验证指南](./verification.md)。

## Seed 与本地内容

运行时 seed 的查找顺序是 `.emdash/seed.json`、`package.json` 的 `emdash.seed`、`seed/seed.json`，最后回退到 EmDash 内置默认。seed 在开发启动或构建时内联，修改文件后重启开发服务；生产环境重新构建。

自动初始化只应用结构，完成后记录 `emdash:seed_complete`。修改 seed 不会自动更新已初始化的数据库。设置向导有自己的初始化流程，不能把它与首次请求的自动应用混为一谈。

手动 CLI 默认包含演示内容，冲突策略默认是 `skip`：

```bash
pnpm exec emdash seed --validate
pnpm exec emdash seed
```

第一条只校验；第二条会写入数据库。CLI 可以通过 `--on-conflict update` 显式更新已有 seed 记录，但也会覆盖相应内容，使用前确认变更范围。开发中需要重建时，先停服务并删除 `.wrangler/state/v3/d1` 下的本地数据库，再重新初始化；重建会丢失本地账号、内容和编辑状态。

seed 应用时按运行时 i18n 配置的 `defaultLocale` 写入行语言，因此由应用内首次请求或设置向导触发时，署名会落在默认语言（`zh`）。EmDash 的署名 hydration 严格按请求语言、没有读取回退，非默认语言缺少署名行时整条 credit 会被丢弃。主题层在 `src/utils/bylines.ts` 补回退：内容行语言不是默认语言时，用默认语言的署名行补齐人名和头像，`roleLabel` 仍取当前语言的值；首页、文章列表、文章详情和分类／标签归档页都走这条回退；背景和边界见 [ADR 0003](./adr/0003-byline-locale-fallback.md)。`bio` 与自定义字段不参与回退，需要在后台为署名建对应语言的翻译行；`SeedByline` 类型本身没有语言字段。

Portable Text 节点保留 `_key`。演示内容的 `status: "published"` 在应用时确定发布时间，不能依赖未定义的 `published_at` seed 属性。widget 选项字段是 `props`，不是 `settings`；写错字段不会报错，只是选项静默不生效，`emdash seed --validate` 会给出警告。

## 上游资料与操作 skill

EmDash API、配置与插件能力可以查询 [官方文档](https://docs.emdashcms.com/)；文档 MCP 地址为 `https://docs.emdashcms.com/mcp`，连接方式见 [官方说明](https://docs.emdashcms.com/docs-mcp)。项目级 MCP 配置在 [.pi/mcp.json](../.pi/mcp.json)，pi 信任本项目后即可用 `search_docs` 查询，无需其他工具的配置。判断已安装版本的行为时同时核对本地依赖源码。

按任务使用已有 skill：[站点开发](../.agents/skills/building-emdash-site/SKILL.md)、[插件开发](../.agents/skills/creating-plugins/SKILL.md)、[CLI 与编辑流程](../.agents/skills/emdash-cli/SKILL.md)。它们描述 EmDash 通用能力，本指南记录当前站点的实现。

评论上线前确认后台审核配置。当前文章页直接渲染评论与表单；关闭集合的 `commentsEnabled` 后还需要核对公开页呈现，不能假定现有页面一定随配置移除所有 UI。
