# 代码块用 Astro 内置 Shiki 着色

正文代码块由 Astro 内置的 `<Code />` 组件调用 Shiki 着色，输出 `github-light` / `github-dark` 双主题，用 `light-dark()` 跟随站点明暗模式。项目不新增依赖：Shiki 已由 Astro 提供，GitHub 主题随 `@shikijs/themes` 一并安装。

EmDash 的 Portable Text 渲染把 `code` 类型的块交给 `src/components/CodeBlock.astro`，页面通过 `components={{ type: { code: CodeBlock } }}` 接入。`mergeComponents` 按键浅合并，只覆盖 `code`，`image`、`table`、`embed` 等内置类型保持不变。

## 为什么现在重新引入

早期实现曾经在服务端用 Shiki 着色，后来撤回，理由记录在探索笔记里：当时以为改 Astro 的 Markdown 配置即可高亮正文，检查后发现正文是 Portable Text、没有 Markdown AST，rehype 方案不进入渲染路径；随后自建的 `CodeBlock.astro` 依赖外部色板，决定撤掉并等待重新评估。

这次的关键区别是不再自建着色管线：Astro 7 自带 Shiki 与 GitHub 主题，内置 `<Code />` 组件直接产出带行内样式的 HTML。项目只需覆盖一个渲染组件，不维护语法定义、不引入第二套色板、不新增依赖。

## 边界

- 只覆盖 `code` 一种 Portable Text 类型。其余类型由 `mergeComponents` 保留，不接管。
- 明暗取值来自 Shiki 主题，不写入 `theme.css` 的令牌。站点品牌色不参与代码着色；需要调整配色时换 Shiki 主题，而不是覆盖 token。
- 代码块的几何与字体（内边距、边框、圆角、等宽字体）由 `CodeBlock.astro` 负责，页面不再重复声明 `pre` 规则。
- 沿用 EmDash 的严格渲染路径：不做一键复制等客户端增强，因此不需要处理客户端导航后的重绑定。
- 正文着色只影响 Portable Text 渲染路径。Astro 的 `markdown.shikiConfig` 仍然不参与正文，这一点与撤回前的结论一致。

## 代价

每个含代码块的页面在服务端多一次 Shiki 高亮调用，随语言和主题组合进入 Astro 的 highlighter 缓存。Cloudflare Workers 下 Shiki 使用 `workerd` 条件的 WASM 引擎，构建与运行时不依赖 `sharp` 或 Node 专有 API。更换主题或新增语言会改变高亮器缓存键。
