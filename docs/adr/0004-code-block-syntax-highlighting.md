# 代码块用 Astro 内置 Shiki 着色

正文代码块由 Astro 内置的 `<Code />` 组件调用 Shiki 着色，输出 `github-light` / `github-dark` 双主题，用 `light-dark()` 跟随站点明暗模式。不新增依赖：Shiki 与 GitHub 主题已由 Astro 提供。

EmDash 的 Portable Text 渲染把 `code` 类型的块交给 `src/components/CodeBlock.astro`，页面通过 `components={{ type: { code: CodeBlock } }}` 接入。与早期撤回的方案不同，这里不再自建着色管线，只覆盖一个渲染组件。

## 边界

- 只覆盖 `code` 一种类型。`mergeComponents` 按键浅合并，`image`、`table` 等内置类型保持不变。
- 明暗取值来自 Shiki 主题，不写入 `theme.css` 的令牌。调整配色换 Shiki 主题，不覆盖 token。
- 代码块的几何与字体（内边距、边框、圆角、等宽字体）由 `CodeBlock.astro` 负责，页面不重复声明 `pre` 规则。
- 提供一键复制按钮与本地化状态反馈，使用浏览器 Clipboard API，通过文档级事件委托实现幂等初始化，在 Astro 客户端导航（`ClientRouter`）下无需反复重绑节点事件。语言为 `mermaid` 的图表块由 `MermaidViewer.astro` 交互工作台接管。
- 正文是 Portable Text，没有 Markdown AST，Astro 的 `markdown.shikiConfig` 不参与正文着色。

## Cloudflare 下的 WASM 加载

Workers 禁止从二进制数据实例化 WASM，Shiki 默认的 base64 内联引擎会报 `Wasm code generation disallowed by embedder`。Astro 用 `#shiki-engine` 条件导入绕开：`workerd` 下改用 `import("shiki/onig.wasm")` 以独立 `.wasm` 模块导入。两个分支都是 Oniguruma 引擎，差别只在加载方式。

开发与生产的条件解析一致，差异只在打包环节。开发环境渲染正常不能证明生产 bundle 正确包含 WASM。

## 代价

每个含代码块的页面多一次服务端高亮调用，随语言和主题组合进入 Astro 的 highlighter 缓存。更换主题或新增语言会改变缓存键。
