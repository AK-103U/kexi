# Kexi

Kexi 是面向 Cloudflare 的 EmDash 博客主题，作为完整的 Astro 项目维护，可用 `create-astro` 脚手架分发。内容管理、编辑器、认证、媒体、搜索、评论、草稿、修订和预览复用 EmDash；主题负责前台 UI、响应式布局和内容呈现。

公开页采用三栏布局与柑橘橙主题，支持明暗模式、中文默认页面和英文 `/en` 变体。提供文章列表与详情、分类和标签归档、搜索、静态页面及 RSS。后台入口为 `/_emdash/admin`。

生产环境使用 Cloudflare Workers、D1 和 R2。项目范围和部署边界见 [ADR 0002](docs/adr/0002-emdash-theme-on-cloudflare.md)。

## 本地开发

需要 Node 22.12 或更高版本和 pnpm。

```bash
pnpm install
pnpm dev
```

访问 `http://localhost:4321/_emdash/admin` 完成初始化。开发环境通过 Cloudflare 适配器在本地模拟 D1、R2 和 KV，状态保存在 `.wrangler/`，**不需要 Cloudflare 账号或 `wrangler login`**。初始化时可以选择是否导入模板示例内容。

```bash
pnpm typecheck
pnpm build
```

## 部署到 Cloudflare

部署前，在 [wrangler.jsonc](./wrangler.jsonc) 中设置该站点的 Worker、D1 数据库和 R2 存储桶名称。当前默认名称为 `kexi`、`kexi` 和 `kexi-media`；不同站点应使用各自的资源名称。部署前在 [src/i18n/config.ts](./src/i18n/config.ts) 设置站点的公开 `siteUrl`。

```bash
pnpm wrangler login
pnpm deploy
```

首次部署时，Wrangler 会连接或创建配置中的资源，以及适配器需要的会话存储。Cloudflare 账号需要启用 R2。发布后访问站点的 `/_emdash/admin` 完成初始化。

保留 Cron Trigger 和 Worker 的 `scheduled` 处理器，用于定时发布和维护任务。修改绑定后运行 `pnpm types:worker` 更新 Worker 类型。生产路径的完整检查入口见 [验证指南](./docs/verification.md#生产路径)。

## 项目文件

- `src/pages/`：首页、文章、普通页面、分类、标签、搜索、RSS 和 404。
- `src/layouts/Base.astro`：三栏外壳、页头、页脚、客户端导航和 EmDash 接入。
- `src/components/`：文章卡片、站主身份、侧栏、目录等。
- `src/styles/`：设计令牌与主题覆盖。
- `seed/seed.json`：初始内容模型和可选示例内容。
- `astro.config.mjs`：Astro、EmDash、D1 和 R2 配置。
- `src/worker.ts`：Cloudflare Worker 入口及定时任务。
- `wrangler.jsonc`：Worker 名称和资源绑定。
- `.pi/mcp.json`：项目级 MCP 配置，接入 EmDash 文档服务 `emdash-docs`。

Seed 用于首次初始化，修改后不会自动迁移已初始化的站点。现有站点的内容模型通过 EmDash 管理；修改初始化基线时同步更新 seed 和生成的类型。

## 文档入口

| 资料 | 内容 |
|---|---|
| [AGENTS.md](./AGENTS.md) | Agent 阅读入口与协作约定 |
| [开发指南](./docs/development.md) | 当前内容机制、国际化、渲染和 seed 用法 |
| [DESIGN.md](./DESIGN.md) | 当前视觉与布局约定 |
| [验证指南](./docs/verification.md) | 按改动选择类型、浏览器和生产检查 |
| [ADR](./docs/adr/) | 已有决定及其理由、边界和代价 |
| [NOTES.md](./NOTES.md) | 历史故障、排查证据与被推翻的假设 |

EmDash 通用能力见 [官方文档](https://docs.emdashcms.com/)，文档 MCP 的接入方式见 [官方说明](https://docs.emdashcms.com/docs-mcp)。项目已在 [.pi/mcp.json](./.pi/mcp.json) 接入文档 MCP，pi 信任本项目后可用 `search_docs` 查询。
