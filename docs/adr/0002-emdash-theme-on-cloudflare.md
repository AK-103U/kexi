# Kexi 复用 EmDash，并部署到 Cloudflare

Kexi 是部署到 Cloudflare Workers 的 EmDash 主题，作为完整的 Astro 项目维护，用 `create-astro` 分发。生产环境使用 Workers、D1 和 R2；本地开发使用同一套 Cloudflare 适配器，由 Wrangler 的 Miniflare 模拟 D1、R2 和 KV，状态保存在 `.wrangler/`。不维护其他部署目标，不使用 SQLite。

内容管理、编辑器、认证、媒体、搜索、评论、草稿、修订和预览复用 EmDash 已有能力。主题通过官方查询接口和 `emdash/ui` 组件接入 CMS，只定制 UI、布局和内容呈现；呈现需求无法满足时才覆盖局部渲染组件。需要扩展内容管理行为时单独评估插件，避免让主题承担 CMS 业务逻辑。

CMS 内容页面保持服务端渲染，保留 SEO、插件页面贡献、预览和可视化编辑接入。站点信息、导航和内容从 EmDash 读取。Seed 定义首次初始化的内容模型，不作为已上线站点的迁移机制。

本地开发不需要 Cloudflare 账号或 `wrangler login`；只有首次部署到线上时才需要连接账号并创建 D1、R2 资源。这一选择让主题只面向一个运行环境，减少多平台验证成本；代价是接受对 EmDash 接口和 Cloudflare 运行环境的依赖。主题文件生成后归站点所有，后续升级由站点合并。
