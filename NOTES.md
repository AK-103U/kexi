# 探索笔记

记录 2026 年 10 月 8 日至 10 日探索中的故障证据、被推翻的假设和未解问题。历史量测与上游行为受当时环境和版本限制，不能当作本轮重新验证的结果。当前机制见 [开发指南](./docs/development.md)，视觉约定见 [DESIGN](./DESIGN.md)，检查步骤见 [验证指南](./docs/verification.md)。

其中 SQLite、`sharp`、`data.db` 和 Node 服务器相关的记录属于迁移到 Cloudflare 前的旧线路，保留作为排查参考，不再是当前部署方式。部署选择的当前决定见 [ADR 0002](./docs/adr/0002-emdash-theme-on-cloudflare.md)。

## Seed 初始化的误判

首次请求后没有演示文章，曾被误判为 seed 未生效。当时查询 `ec_posts` 是零行，手动执行 CLI 后才出现示例内容：自动应用主要负责结构，CLI 默认包含内容。

后来用完成标记解释“改 seed 不更新数据库”，容易被扩张成“seed 此后完全无效”。当前源码区分自动应用门控与手动 CLI，CLI 还支持冲突策略。实际操作见 [开发指南](./docs/development.md#seed-与本地内容)。

当时媒体下载间歇出现 `Could not resolve hostname: This operation was aborted`。seed 的远程媒体下载经过 SSRF 校验，观察到 DNS 查询超时；重新尝试曾成功，同批相同 URL 会复用已下载结果。这个现象不能单凭一次超时归因于 seed 结构。

## 语言配置与署名

只在一种语言的文章详情显示署名，起初看起来像页面没有渲染。排查发现 `SeedByline` 没有语言字段，迁移 `040` 的 `_emdash_bylines.locale` 默认值取决于执行时的语言配置；当时 CLI 未加载 Astro 配置，行落在 `en`，内容署名 hydration 又按请求语言筛选。

为此当时添加 `seed-bylines-i18n.mjs` 补齐翻译组缺失的语言。该脚本依赖 Node 的 `node:sqlite` 直写 `data.db`，在 Cloudflare 迁移中已移除：seed 应用时按运行时 i18n 配置的 `defaultLocale` 写入行语言，由应用内初始化触发时署名落在默认语言（`zh`）。`SeedByline` 类型没有语言字段，EmDash 的署名 hydration 严格按请求语言、没有读取回退。现在由主题层 `src/utils/bylines.ts` 补回退（人名与头像），决定见 [ADR 0003](./docs/adr/0003-byline-locale-fallback.md)，当前用法见 [开发指南](./docs/development.md#seed-与本地内容)。

当时还观察到：开启默认语言路由前缀会使后台 404；缺少 `site` 配置时语言替代链接为空；非默认语言的 `entry.id` 带前缀，直接拼文章 URL 会多一层 `en`。这些发现已转为开发指南中的当前用法。

## Windows 与开发服务

官方截图流程依赖当时模板中不存在的 `bootstrap`、本机缺少的 `lsof` 和 `rsync`，因此增加本站截图脚本，使用系统 Chrome。

默认开发服务当时监听 `[::1]:4321`，`127.0.0.1` 连接失败。早期“不要使用 localhost”的结论在 2026 年 10 月 9 日被实测推翻：`localhost` 可解析到可用的 IPv6 地址。脚本的 IPv6 默认地址只是当时环境的选择，不能推出所有环境都只监听 IPv6。

| 当时启动方式 | 实际监听 | 可连接地址 |
|---|---|---|
| `pnpm dev` | `::1` | `localhost`、`[::1]` |
| `pnpm dev --host 127.0.0.1` | `127.0.0.1` | `localhost`、`127.0.0.1` |
| `pnpm dev --host` | IPv4 与 IPv6 | 上述地址及局域网地址 |

Astro 7 当时通过项目进程锁阻止第二个开发服务，即使换端口也会提示 `Another astro dev server is already running`。排错先确认现有进程，再决定结束或替换。

当时 Node 将 `/tmp/xxx` 解析到当前盘的根目录路径。临时文件使用明确的临时目录；排查后清理临时路由、脚本及测试草稿。

## SQLite 写锁与保存失败（旧 Node 线路）

以下记录发生在迁移到 Cloudflare 前，使用 Node 服务器和 SQLite。当前部署使用 D1，不再有本地 `data.db` 或 SQLite 写锁，保留仅作参考。

2026 年 10 月 10 日，在后台修改代码块语言时自动保存失败。带 `data` 的写请求返回 500，GET 仍正常，响应体只有：

```html
<title>Error</title><script type="module" src="/@vite/client"></script>
```

它是 Astro 开发服务器的错误页，区别于 EmDash 的业务错误 JSON。结合服务端堆栈，异常发生在刷新条目写锁时，报 `database is locked`，`errcode: 5`。当时写请求耗时约 `5588ms`，与 EmDash 连接设置的 `PRAGMA busy_timeout = 5000` 相符。

在可丢弃的实验库中，另一进程持有写事务可复现：

```js
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync("./experiment.db");
const postId = "<existing-post-id>";
db.exec("BEGIN IMMEDIATE");
db.prepare("UPDATE ec_posts SET title = title WHERE id = ?").run(postId);
// 另一个进程向使用同一实验库的服务发送写请求，等待锁超时。
db.exec("ROLLBACK");
db.close();
```

`postId` 指向实验库中的现有条目。WAL 模式下读请求可继续成功，因此“能打开页面、保存失败”并不能证明字段校验有问题。再遇到类似现象时，结合写请求延迟、响应体和服务端堆栈确认，HTML 500 本身不足以断定写锁。

重启开发服务当时恢复了写入，但首次事故的持锁者仍未定位。检查时 `_emdash_transfer_operations` 与 `_emdash_media_usage_activation` 没有可解释该现象的状态。曾观察到 WAL 约 `3.97MB`、主库约 `1.69MB`；这是排查线索，体积本身不能证明谁持锁或 checkpoint 为什么延后。此项保留在 [未决事项](./docs/research/open-directions.md#当前待处理的问题)。

## 代码块高亮的错误前提

起初以为修改 Astro 的 Markdown 配置即可高亮正文。检查发现 EmDash 正文使用结构化富文本（Portable Text），没有 Markdown AST；因此 rehype 方案不会进入正文渲染路径。

当时 EmDash 内置公开页代码组件只输出 `language-*` 类与源码，底色硬编码为 `#1e1e1e`；上游 `fix(editor): highlight code blocks in editors (#2606)` 与相关 e2e 只改变编辑器高亮，公开页测试仍期待没有 `hljs-` span。

本站一度增加自定义 `CodeBlock.astro` 与 scope 映射，在服务端用 Shiki 着色，配色取自其他项目的遗留色板。后决定撤掉这套方案，回到 EmDash 内置渲染，相关组件、主题映射、令牌和 ADR 一并移除。重新采用语法着色时需要另做决定，并重新验证。

## 布局漂移与验证盲区

文章页曾从三栏改为两栏，后又统一到全站三栏，站主身份最终移到页头。搬动内容后，旧 flex 样式和外层宽度限制仍可能影响新布局，需要重新渲染，而非只看结构变更。当前决定见 [ADR 0001](./docs/adr/0001-shared-public-shell-geometry.md)。

客户端导航时的漂移有两个独立原因：

- 短页面没有滚动条，历史量测中可用宽度从 `1425px` 变为 `1440px`，居中外壳横移 `7.5px`。保留滚动条槽位后消除。
- 当时侧栏 sticky 位置是 `96px`，静止位置是 `113px`，导航重置滚动后跳动 `17px`。将两者从同一组几何变量推导后消除。这些值属于旧布局，不是当前令牌。

早期检查全部通过，是因为 Playwright 默认隐藏滚动条，把第一类差异消掉了。后来三份浏览器脚本都取消 `--hide-scrollbars`。另一条看似验证侧栏的断言只比较“切页后”和“静止时”，两边都已恢复静止，无法发现滚动中的跳动；最终加入滚动状态量测。

第三方 `LiveSearch` 也出现过源码覆盖不生效：传入子组件的 class 需要全局选择器，其组件 scoped 样式又具有更高特异性。先使用组件自定义属性，再处理没有主题接口的硬编码声明。历史上将搜索底色改错，已有几何断言仍通过，因此后来补上计算样式断言。

## 导航后的交互失效

主题按钮在第一次打开时正常，导航后失效，最初被误判为重复监听。实际是页面节点被替换，而模块初始化只执行一次；按钮仍依赖旧节点的绑定。改用页面加载事件重新绑定，并在文档交换前延续主题选择。

文章目录也曾只在整页加载时存在，在“文章 A → 列表 → 文章 B”的客户端路径下为空。抽取组件时加入页面加载初始化、清空列表和断开旧观察者。相关路径已由 `check:spa` 覆盖。

## 其他历史观察

- `notes-on-simplicity.jpg` 的白纸纹理在小尺寸圆头像中辨识度很差，换成深色代码图后更清楚。文件名无法替代实际尺寸下的对照。
- 当时独立模板与上游 monorepo 的组件组织不同。判断缺文件时应先查当前模板的实际依赖关系，按需移植；旧文件清单和行数比较已经不适合作为当前判断依据。

可选产品方向、字体与配色实验、跨项目迁移参考已移到 [未决事项与迁移设想](./docs/research/open-directions.md)。
