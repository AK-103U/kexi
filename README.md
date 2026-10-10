# EmDash Blog Template — 本地私有部署版

一个干净的最小化博客，基于 [EmDash](https://github.com/emdash-cms/emdash) + Astro。运行于任何 Node.js 服务器，SQLite 存储，本地文件系统存储媒体。

这是 **私有部署变体**：已移除官方模板的 Cloudflare 一键部署按钮与上游资产图引用（站点主题已改柑橘色、三栏布局）。

## 特性

- 精选文章置顶 + 最新文章列表
- 分类法 / 标签归档 + 全文搜索
- RSS feed + SEO metadata
- 暗色模式 + 双语内容（中文默认 / 英文 `/en`）

## 页面结构

| 页面 | 路由 |
|---|---|
| Home | `/` |
| All posts | `/posts` |
| Post detail | `/posts/:slug` |
| Category/Tag archive | `/category/:slug` / `/tag/:slug` |
| Search | `/search` |
| Static pages | `/pages/:slug` |

所有公开路由都有英文变体（如 `/en/posts`）。

## 基础设施

- **Runtime**: Node.js
- **Database**: SQLite (local file)
- **Storage**: Local filesystem
- **Framework**: Astro with `@astrojs/node`

## 快速开始

```bash
pnpm install
pnpm dev
```

访问 `http://localhost:4321/_emdash/admin` 完成设置向导。EmDash 会跑迁移并应用 seed。站点在 `http://localhost:4321`。

生产构建验证（必须路径）：

```bash
pnpm build && pnpm start   # 默认 4321；换端口用 PORT=4400 pnpm start
```

## 相关文档

- [AGENTS.md](./AGENTS.md) — Agent 会话规则、关键文件清单
- [NOTES.md](./NOTES.md) — 踩坑叙事层（被推翻的做法、Windows 特异性坑）
- [DESIGN.md](./DESIGN.md) — 统一设计语言（令牌规范、禁令、视觉原则）
- [EmDash docs](https://docs.emdashcms.com/) （MCP server 可用）
