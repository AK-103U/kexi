<div align="center">

<img src="./public/logo.webp" alt="Kexi Logo" width="120" height="120" />

# Kexi

**专为 Cloudflare 打造的现代博客主题 · 基于 Astro 5 与 EmDash CMS**

[![Astro](https://img.shields.io/badge/Astro-5.x-BC52EE.svg?style=flat&logo=astro&logoColor=white)](https://astro.build)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers_%7C_D1_%7C_R2-F38020.svg?style=flat&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com)
[![EmDash CMS](https://img.shields.io/badge/EmDash-CMS-000000.svg?style=flat)](https://emdashcms.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat)](./package.json)

[快速开始](#-快速开始) · [特性亮点](#-特性亮点) · [生产部署](#-部署到-cloudflare) · [开发指南](./docs/development.md) · [设计规范](./DESIGN.md)

</div>

---

**Kexi** 是一个注重阅读体验与现代排版的开源独立博客主题。它基于 [Astro 5](https://astro.build) 构建，深度集成 [EmDash CMS](https://docs.emdashcms.com/)，并面向 [Cloudflare](https://workers.cloudflare.com/) 全栈边缘生态设计（Workers SSR + D1 数据库 + R2 媒体存储）。

无需承受传统 CMS 复杂的服务器运维负担与高昂账单，即可拥有极速响应、优雅舒适的写作与阅读体验。

---

## ✨ 特性亮点

### 🎨 匠心排版与阅读体验
- **现代阅读排版**：克制舒适的视觉层级与排印细节，原生支持跟随系统与平滑切换的明暗双色模式（Light / Dark）。
- **文档级单份左栏外壳**：桌面端固定侧栏，优雅呈现站长品牌、导航与搜索；移动端自适应折叠为贴顶横栏，零 DOM 冗余。
- **专注阅读退火（Focus Fade）**：桌面正文向下滚动时，左侧栏温和隐形（`opacity: 0`），消除余光干扰；鼠标掠过即刻平滑唤醒。
- **全屏交互式 Mermaid 工作台**：正文图表支持「流程画布」与「源码语法」双模式切换，支持鼠标滚轮自由平滑缩放、拖拽平移及一键导出矢量 SVG / 高清 PNG。
- **语法着色与代码体验**：基于 Shiki 双主题（Light / Dark）实时着色，内置一键复制代码并带本地化状态反馈。
- **零漂移平滑切页（Zero CLS）**：结合 Astro `ClientRouter`，页面跳转如单页应用（SPA）般丝滑，同时完整保留首屏 SSR、SEO 元数据与 OpenGraph 分享卡片。

### ⚡ Serverless 边缘全栈
- **极致的边缘性能**：借助 Cloudflare Workers，全球 CDN 节点毫秒级冷启动与响应。
- **零服务器运维**：数据库使用 **Cloudflare D1**（边缘 SQLite），媒体资源与文件托管于 **Cloudflare R2**，头像与图片处理基于 **Cloudflare Images binding**。
- **免费额度友好**：整套架构完全运行在 Cloudflare 优厚的基础免费额度之内。

### 📝 开箱即用的现代 CMS
- **内置 EmDash CMS**：自带专业的可视化编辑后台（访问 `/_emdash/admin`），支持 Portable Text 富文本、多版本修订历史与草稿预览。
- **全站实时搜索**：无缝集成的即时搜索面板，支持键盘快捷键唤起。
- **双语国际化支持**：中文默认路由搭配 `/en` 英文路由，语言切换保留页面上下文并带回退处理。
- **标准内容生态**：内置分类与标签归档、文章预估阅读时长、RSS 订阅源以及全站 Sitemap。

---

## 🚀 快速开始

### 依赖环境
- **Node.js**：`>= 22.12.0`
- **包管理器**：推荐使用 [pnpm](https://pnpm.io/)

### 1. 克隆与安装

```bash
git clone https://github.com/your-username/kexi.git
cd kexi
pnpm install
```

### 2. 启动本地开发

```bash
pnpm dev
```

本地开发环境通过 Cloudflare 适配器在本地 `.wrangler/` 自动模拟 D1、R2 和 KV，**无需注册 Cloudflare 账号，也无需执行 `wrangler login`**。

- 访问前台：`http://localhost:4321`
- 访问管理后台：`http://localhost:4321/_emdash/admin`

首次进入后台根据向导提示完成初始化设置，并可选择一键导入示例文章与内容。

---

## ☁️ 部署到 Cloudflare

### 1. 配置生产资源

在 `wrangler.jsonc` 中确认或修改你的 Worker 名称、D1 数据库与 R2 存储桶名：

```jsonc
{
  "name": "kexi",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "kexi-db",
      "database_id": "<你的-d1-database-id>"
    }
  ],
  "r2_buckets": [
    {
      "binding": "MEDIA",
      "bucket_name": "kexi-media"
    }
  ]
}
```

在 `src/i18n/config.ts` 中将 `siteUrl` 设为你站点的正式公开域名：

```typescript
export const siteConfig = {
  siteUrl: "https://your-domain.com",
  // ...
};
```

### 2. 部署上线

```bash
# 登录 Cloudflare 账号（首次）
pnpm wrangler login

# 一键构建并发布
pnpm deploy
```

首次部署时 Wrangler 会自动连接并创建配置中的资源。发布成功后，访问 `https://your-domain.com/_emdash/admin` 创建管理员账号并初始化站点。

---

## 🛠️ 个性化定制

- **品牌标志与图标**：将 `public/logo.webp` 替换为你自己的站点标志，全站 Favicon 与回退头像将自动同步更新。
- **主题色彩与排版**：在 `src/styles/theme.css` 中可自由定制强调色 `--color-brand`、字体栈以及各层级留白间距。
- **站点信息与社交链接**：登录管理后台 `/_emdash/admin` 的「站点设置」中随时修改标题、副标题与社交媒体主页链接。

---

## 📂 项目结构

```text
kexi/
├── public/                 # 静态资源（Logo、字体、离线脚本）
│   └── logo.webp           # 站点标志与图标回退
├── src/
│   ├── components/         # 独立 UI 组件（卡片、代码块、Mermaid 工作台等）
│   ├── layouts/            # 核心外壳布局（Base.astro）
│   ├── pages/              # Astro 路由（首页、文章详情、搜索、RSS）
│   ├── styles/             # 设计令牌（tokens.css）与主题样式（theme.css）
│   ├── utils/              # 辅助函数（阅读时长、媒体、身份解析等）
│   └── worker.ts           # Cloudflare Worker 入口与定时任务
├── seed/                   # 初始数据库结构与演示种子
├── wrangler.jsonc          # Cloudflare 资源与环境配置
└── astro.config.mjs        # Astro 与 EmDash 集成配置
```

---

## 📖 深入文档

| 文档 | 描述 |
|---|---|
| [开发指南](./docs/development.md) | 内容查询、媒体存储、国际化机制与 Seed 说明 |
| [设计规范](./DESIGN.md) | 视觉令牌系统、排版参数与组件覆盖规则 |
| [验证指南](./docs/verification.md) | 生产验证、自动化端到端测试与浏览器布局核对 |
| [架构决策（ADRs）](./docs/adr/) | 核心技术选型、单侧栏外壳几何与代码高亮等架构决策记录 |

---

## 🤝 鸣谢

- [Astro](https://astro.build/) - 优秀的新一代静态与边缘 Web 框架
- [EmDash CMS](https://docs.emdashcms.com/) - 针对现代前端打造的优雅内容管理系统
- [Cloudflare](https://cloudflare.com/) - 强劲可靠的全球边缘基础设施

---

## 📄 开源许可

本项目基于 [MIT License](./package.json) 协议开源。
