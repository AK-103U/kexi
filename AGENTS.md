# EmDash Lab

本项目是 EmDash 与 Astro 的本地博客主题，使用 Node、SQLite 和本地媒体存储。公开页面服务端渲染，中文为默认语言，英文使用 `/en`；数学插件是 npm 上的 `@ak-103u/emdash-plugin-math`，作为 registry 依赖安装并在 `astro.config.mjs` 注册。

## 按任务阅读

| 任务 | 资料 |
|---|---|
| 安装、启动和生产运行 | [README](./README.md) |
| 内容查询、国际化、媒体、seed、代码块与页面交互 | [开发指南](./docs/development.md) |
| 视觉、令牌、布局和组件样式 | [DESIGN](./DESIGN.md) |
| 类型、截图、布局、导航和生产验证 | [验证指南](./docs/verification.md) |
| 修改布局几何 | [ADR](./docs/adr/) 中相关决定 |
| 排查已知故障或了解旧方案 | [探索笔记](./NOTES.md) |
| 查阅未完成问题和可选方向 | [未决事项](./docs/research/open-directions.md) |

按当前任务读取相关资料。代码和配置维护实现事实，指南维护用法，ADR 维护决定，历史笔记与未决建议分别保留。修改时更新对应位置，入口保留必要说明和链接。

## 协作约定

- 新实现沿用当前项目术语和相关决定；需要改变已有决定时明确指出影响。
- 文档中文为主，术语在正文首次出现时写作“中文（English）”，后续不重复括注。中文标点全角，代码与技术表达保持半角原形。
- 提交信息和 PR 描述不自动附加 `Co-Authored-By` 或生成工具署名。

## EmDash 资料与 skill

已有 skill 位于 `.agents/skills/`，按任务使用：[站点开发](./.agents/skills/building-emdash-site/SKILL.md)、[插件开发](./.agents/skills/creating-plugins/SKILL.md)、[CLI 与编辑流程](./.agents/skills/emdash-cli/SKILL.md)。

核对 EmDash 能力时查 [官方文档](https://docs.emdashcms.com/) 与已安装版本源码。文档 MCP 地址为 `https://docs.emdashcms.com/mcp`；可用时通过 `search_docs` 查询。
