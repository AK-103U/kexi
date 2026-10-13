# Kexi 开发约定

Kexi 是部署到 Cloudflare 的 EmDash 博客主题。项目范围和部署边界见 [ADR 0002](docs/adr/0002-emdash-theme-on-cloudflare.md)。

## 按任务阅读

| 任务 | 资料 |
|---|---|
| 安装、启动、本地开发和部署 | [README](./README.md) |
| 内容查询、国际化、媒体、seed、代码块与页面交互 | [开发指南](./docs/development.md) |
| 视觉、令牌、布局和组件样式 | [DESIGN](./DESIGN.md) |
| 类型、截图、布局、导航和生产验证 | [验证指南](./docs/verification.md) |
| 修改布局几何 | [ADR](./docs/adr/) 中相关决定 |
| 排查已知故障或了解旧方案 | [探索笔记](./NOTES.md) |

按当前任务读取相关资料。代码和配置维护实现事实，指南维护用法，ADR 维护决定，历史笔记保留排查线索。修改时更新对应位置，入口保留必要说明和链接。

## 协作约定

- 使用 pnpm 安装依赖和运行脚本。
- 新实现沿用当前项目术语和相关决定；需要改变已有决定时明确指出影响。
- 文档中文为主，术语在正文首次出现时写作“中文（English）”，后续不重复括注。中文标点全角，代码与技术表达保持半角原形。
- 提交信息和 PR 描述不自动附加 `Co-Authored-By` 或生成工具署名。
- 架构决策记录放在 `docs/adr/`，使用四位编号和英文 kebab-case 文件名。

## Cloudflare 约定

- 生产配置使用 Workers、D1 和 R2；保留 `src/worker.ts` 的定时任务入口和 `wrangler.jsonc` 的 Cron Trigger。
- 本地开发通过 Cloudflare 适配器在 `.wrangler/` 模拟资源，不引入 SQLite 或其他部署目标。
- 绑定名需与 `astro.config.mjs` 一致：`DB`（D1）、`MEDIA`（R2）。修改绑定后运行 `pnpm types:worker`。
- 图片处理走 Cloudflare Images binding，不引入 `sharp`。

## EmDash 约定

- 优先复用 EmDash 查询接口及 `emdash/ui` 组件，定制 UI、布局和内容呈现。
- CMS 内容页面保持服务端渲染；保留 SEO、插件页面贡献、预览和可视化编辑接入。
- 站点信息和导航读取 CMS 设置与菜单，不另建重复的配置来源。
- 生成内容链接用 `entry.data.slug` 配合 `localePath()`；`entry.id` 是带语言前缀的 slug，不是裸 slug。
- `entry.data.id` 用于需要数据库 ID 的接口。
- 排序和分页在数据库查询中完成；多个条目的关联数据优先批量读取。
- 使用页面缓存时传递查询返回的 `cacheHint`。
- Seed 仅用于初始化，不作为上线后的迁移方式。

## EmDash 资料与 skill

已有 skill 位于 `.agents/skills/`，按任务使用：[站点开发](./.agents/skills/building-emdash-site/SKILL.md)、[插件开发](./.agents/skills/creating-plugins/SKILL.md)、[CLI 与编辑流程](./.agents/skills/emdash-cli/SKILL.md)。

核对 EmDash 能力时查 [官方文档](https://docs.emdashcms.com/) 与已安装版本源码。文档 MCP 地址为 `https://docs.emdashcms.com/mcp`，项目级配置在 [.pi/mcp.json](./.pi/mcp.json)；pi 信任本项目后可用 `search_docs` 查询。
