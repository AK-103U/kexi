# EmDash Lab

基于 [EmDash](https://github.com/emdash-cms/emdash) 与 Astro 的本地博客主题，使用 Node、SQLite 和本地文件系统存储媒体。公开页采用三栏布局与柑橘橙主题，支持明暗模式、中文默认页面和英文 `/en` 变体。

提供文章列表与详情、分类和标签归档、搜索、静态页面及 RSS。后台入口为 `/_emdash/admin`。

## 本地开发

需要 Node 24 和 pnpm 11。数学插件是 npm 上发布的 `@ak-103u/emdash-plugin-math`（`^0.1.0`），从 registry 安装，无本地目录依赖。

```bash
pnpm install
pnpm dev
```

使用启动日志中的地址访问站点，通常为 `http://localhost:4321`。进入 `http://localhost:4321/_emdash/admin` 完成设置向导。需要演示内容、补齐双语署名或设置站主头像时，按 [开发指南](./docs/development.md#seed-与本地内容) 操作。

## 生产运行

```bash
pnpm build
pnpm start
```

生产进程默认使用 `4321` 端口。更换端口的方法见 [验证指南](./docs/verification.md#生产路径)。部署前在 [src/i18n/config.ts](./src/i18n/config.ts) 设置站点的公开 `siteUrl`，并为 [astro.config.mjs](./astro.config.mjs) 指定的数据库和媒体目录保留持久存储。

当前使用 `data.db` 和 `uploads/`。构建验证后检查图片端点、语言变体和实际页面；完整检查入口见 [验证指南](./docs/verification.md)。

## 文档入口

| 资料 | 内容 |
|---|---|
| [AGENTS.md](./AGENTS.md) | Agent 阅读入口与协作约定 |
| [开发指南](./docs/development.md) | 当前内容机制、国际化、渲染和 seed 用法 |
| [DESIGN.md](./DESIGN.md) | 当前视觉与布局约定 |
| [验证指南](./docs/verification.md) | 按改动选择类型、浏览器和生产检查 |
| [ADR](./docs/adr/) | 已有决定及其理由、边界和代价 |
| [NOTES.md](./NOTES.md) | 历史故障、排查证据与被推翻的假设 |
| [未决事项](./docs/research/open-directions.md) | 待处理问题、迁移参考和可选方向 |

EmDash 通用能力见 [官方文档](https://docs.emdashcms.com/)，文档 MCP 的接入方式见 [官方说明](https://docs.emdashcms.com/docs-mcp)。
