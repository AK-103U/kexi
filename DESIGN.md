# DESIGN.md —— 统一设计语言

> 所在位置：`emdash-lab/`（本项目设计令牌的权威实现在 `src/styles/`，随站演进）。
> 适用范围：`F:\dev\blog` 下所有面向读者的站点主题（本仓库 `emdash-lab`、遗留源 `citrus-grid`，以及后续由 `astro-theme-to-emdash` 迁移产出的新主题）。
> 提炼自现状：`src/styles/{tokens,theme}.css`、`NOTES.md`、`AGENTS.md`、`../citrus-grid/src/styles/main.css`。
> **分工约定**：**禁令与视觉原则归 AGENTS.md**（agent 会话加载），令牌值归 tokens.css，本文档是「规范层」——把已有实践成文化、命名标准化。
>
> 创建于 2026年10月10日。

---

## 一、品牌原则（先于一切令牌）

1. **一页一橙**：页面由黑、白、一个柑橘橙构成。链接、悬停、焦点环、当前态是 brand 的全部职责。**禁止第二个 accent 色，禁止彩色区块背景。**
2. **层级靠字重和字号，不靠颜色**。标题不换字体、不加花色。
3. **编辑感（editorial-tech）**：自信的 sans、克制的 accent、真实的文章结构（byline、阅读时长、TOC）。文案说人话，不用 stock copy（"Welcome to my blog" 之类）。
4. **改视觉只动 theme.css**，不动 tokens.css，不动布局组件（`Base.astro`）。

---

## 二、令牌命名规范

### 2.1 标准命名（唯一合法前缀）

| 族 | 模式 | 例 |
|---|---|---|
| 颜色 | `--color-<角色>` | `--color-brand`、`--color-text-secondary` |
| 字体 | `--font-<用途>` / `--font-size-<档位>` / `--font-weight-<用途>` | `--font-body`、`--font-size-2xl`、`--font-weight-display` |
| 行高 / 字距 | `--leading-<档>` / `--tracking-<档>` | `--leading-relaxed`、`--tracking-tight` |
| 间距 | `--spacing-<rem×4>` | `--spacing-6` = 1.5rem |
| 布局 | `--<几何名>-width` / `--nav-height` | `--content-width`、`--rail-width` |
| 圆角 | `--radius` / `--radius-lg` | |
| 阴影 | `--shadow-sm` / `--shadow-lg` | |
| 动效 | `--transition-<档>` | `--transition-fast` |
| 头像 | `--avatar-size-{xs,sm,md,lg}` | |

### 2.2 遗留命名 `--wp-*`（citrus-grid）

`--wp-*` 是 WordPress 移植期的遗留前缀，**新代码一律不许新增**。迁移或重写 citrus-grid 组件时按下表映射：

| 旧（`--wp-*`） | 新（标准） | 备注 |
|---|---|---|
| `--wp-bg` | `--color-bg` | |
| `--wp-surface` | `--color-surface` | |
| `--wp-surface-hover` | ——（用 `--color-bg-subtle`） | |
| `--wp-code-bg` | `--color-code-bg` | 标准令牌里暂无，见 §4.4 扩展族 |
| `--wp-accent` | `--color-brand` | 三件套一起改，见 §4.1 |
| `--wp-accent-hover` | `--color-brand-hover` | |
| `--wp-accent-deep` | ——（并入 brand 体系） | |
| `--wp-text` | `--color-text` | |
| `--wp-text-secondary` | `--color-text-secondary` | |
| `--wp-text-tertiary` | `--color-muted` | |
| `--wp-border` / `--wp-border-light` | `--color-border` / `--color-border-subtle` | |
| `--wp-shadow-card{,-hover}` | `--shadow-sm` / `--shadow-lg` | |
| `--wp-gold / --wp-silver / --wp-safe-blue / --wp-life-green` | `--color-tone-*` | 语义色，见 §4.4 |
| `--wp-syntax-*` / `--wp-diff-*` | `--syntax-*` / `--diff-*` | 代码高亮族，见 §4.5 |
| `--wp-header-bg` / `--wp-glass-bg` / `--wp-grid-image` | 组件局部令牌 | 允许存在，但必须带组件前缀（见 §6） |

---

## 三、双模式机制（规范性）

**统一采用 `light-dark()` + `color-scheme`，一个令牌携带两副值，没有独立暗色板要维护。**

```css
:root {
  color-scheme: light dark;
  --color-brand: light-dark(#e86233, #db7753); /* 第一值亮，第二值暗 */
}
```

- 覆盖颜色时：写 `light-dark(a, b)` 才能让两种模式分道；写普通值会同时改掉两边。
- **必须保留 `@supports not (color: light-dark(…))` 兜底块**，镜像亮色值（Safari < 17.5、Chrome < 123）。
- `.dark` class 切换方案（citrus-grid + Tailwind `@custom-variant`）只许留在 citrus-grid 内部，不再扩散。
- 用户手动切换主题时通过覆写 `color-scheme`（或等效机制）驱动，ThemeSwitcher 已经这么做。

---

## 四、颜色

### 4.1 Brand 三件套（+焦点环）—— 必须一起设

品牌色是**柑橘橙**，源自 citrus-grid 主色，已验证于 emdash-lab：

| 令牌 | 亮 | 暗 | 职责 |
|---|---|---|---|
| `--color-brand` | `#e86233` | `#db7753` | 链接、卡片标题 hover、焦点环 |
| `--color-brand-hover` | `#c94f22` | `#e28969` | 悬停态 |
| `--color-on-brand` | `white` | `white` | 叠在 brand 底色上的文字 |
| `--color-brand-ring` | `color-mix(in srgb, var(--color-brand) 25%, transparent)` | 同左 | 焦点环，永远由 brand 派生，不单独定值 |

> 换主题色时四行一起改。EmDash 官方模板默认蓝 `#0066cc` 只是 tokens.css 的出厂值，本项目基线是柑橘橙（在 theme.css 覆盖）。

### 4.2 中性色（文字 / 背景 / 描边）

基线取 emdash-lab（纯灰阶）。citrus-grid 的暖纸色见 §4.3 变体。

| 令牌 | 亮 | 暗 |
|---|---|---|
| `--color-bg` | `#ffffff` | `#0d0d0d` |
| `--color-bg-subtle` | `#fafafa` | `#141414` |
| `--color-surface` | `#f7f7f7` | `#181818` |
| `--color-text` | `#1a1a1a` | `#ededed` |
| `--color-text-secondary` | `#525252` | `#a0a0a0` |
| `--color-muted`（meta 信息） | `#8b8b8b` | `#6b6b6b` |
| `--color-border` | `#e5e5e5` | `#2a2a2a` |
| `--color-border-subtle` | `#f0f0f0` | `#1f1f1f` |

### 4.3 暖纸变体（citrus-grid 性格，**待定**）

citrus-grid 的中性色带暖调，和它的橙色同源：`--wp-bg: #f5f4f0`（暖纸）、`#141413`（暗）、文字 `#322e2a`、描边 `#e0d9cb`。
**决策待定**：新主题基线是纯灰阶（现状）还是统一到暖纸（保留品牌性格）。若要采用暖纸，只需在 theme.css 覆盖 §4.2 全部令牌并跑截图回归，改动见 §8 流程。倾向建议：暖纸——橙配冷灰会显得孤立，但需实测确认。

### 4.4 语义色调族（callout / alert 用）

允许出现的「非橙」彩色**只有**这一族，且仅限 callout、状态标记、diff。源自 citrus-grid：

| 色调 | 亮 | 暗 | 用途 |
|---|---|---|---|
| info | `#3f6fa3` | `#7fa8ce` | 提示框标题 |
| tip | `#52713b` | `#8fb078` | 建议框标题 |
| warn | `#8a650d` | `#d4a94e` | 警告框标题 |
| danger | `#a94f41` | `#d08377` | 危险框标题 |
| gold / silver | `#8a6939` / `#686d75` | `#b08d4e` / `#96989c` | 装饰性强调 |
| safe-blue / life-green | `#4a6e8c` / `#5c7355` | `#6c8ca4` / `#7a9173` | 状态色 |

规则：这些色只用作**标题色 / 细边框 / 小图标**，底色一律是 brand-ring 式的低饱和派生（如 math 插件 accent tone：底 `light-dark(#fdf0ea, #2a1a12)`、边 `light-dark(#f3c4ae, #6b3a22)`），不许整块铺彩。

### 4.5 代码高亮调色板（12 项，亮/暗成对）

代码块是内容型站点的重灾区，高亮色必须与橙色品牌共存。值来自 citrus-grid（目前唯一完整的一套，迁移时直接带上）：

| 令牌 | 亮 | 暗 |
|---|---|---|
| `--syntax-keyword` | `#984d2a` | `#d49060` |
| `--syntax-string` | `#466f37` | `#8fb87a` |
| `--syntax-comment` | `#69625a` | `#847d72` |
| `--syntax-number` | `#2a7265` | `#6fb8a8` |
| `--syntax-function` | `#7b4b2a` | `#c88860` |
| `--syntax-type` | `#7f5061` | `#c99bae` |
| `--syntax-operator` | `#6b6560` | `#a8a099` |
| `--syntax-attribute` | `#8f4e18` | `#e2a062` |
| `--syntax-meta` | `#855656` | `#c9999b` |
| `--syntax-regexp` | `#a34e31` | `#e08060` |
| `--diff-del` | `#a94442` | `#d48a85` |
| `--diff-add` | `#376c37` | `#94c086` |

外加 `--color-code-bg`：亮 `#ece7dc`（暖）/ 暗 `#0e0d0c`；纯灰阶基线下可退到 `--color-surface` 系。

---

## 五、字体与排印

### 5.1 字族

- **单一字族**：正文标题同族，层级交给字重字号。
- 正文 / 标题：**Public Sans**（Google Fonts，经 `astro.config.mjs` 的 `fonts:` 管线绑定 `--font-body`）。
- 代码：**JetBrains Mono** → `--font-mono`。
- `--font-heading` 默认等于 `--font-body`；单独换标题面在 theme.css 覆盖，不动字体管线。
- 字体加载是**离散字重 400/500/600/700**——写 650 不报错但浏览器就近取整，等于白写。换字体必须同步核对 `fonts.weights`。

### 5.2 字阶（rem，root=16px）

`--font-size-xs .8125 / sm .875 / base 1 / lg 1.125 / xl 1.25 / 2xl 1.5 / 3xl 2 / 4xl 2.5 / 5xl 3.5`

### 5.3 字重与字距

| 令牌 | 基线值 | 用途 |
|---|---|---|
| `--font-weight-heading` | 600 | h2–h6、卡片/列表标题 |
| `--font-weight-display` | 600 | h1、页面大标题 |
| `--tracking-tight` | -0.03em | h1 及大标题 |
| `--tracking-snug` | -0.02em | h2–h6、站点/卡片标题 |
| `--tracking-wide` | 0.06em | meta 标签、TOC/widget 标题 |
| `--tracking-wider` | 0.08em | 页脚小标题、分区标签 |

行高：`--leading-tight 1.15 / snug 1.3 / normal 1.5 / relaxed 1.7`。

### 5.4 换字体规则

- 禁止用展示型 sans 替换 Public Sans（Bebas、Anton 等）。
- 换人文衬线做正文（Source Serif、Crimson Pro、Lora）时，**必须**把 `--font-size-base` 提到 `1.0625rem`，并把 heading/display 字重调低。
- 候选无衬线：Geist、IBM Plex Sans、Söhne（有授权时）、Public Sans。

---

## 六、尺度令牌

### 6.1 间距（0.25rem 进制）

`--spacing-{1,2,3,4,5,6,8,10,12,16,20,24}` → 0.25–6rem。旧别名 `--spacing-{xs,sm,md,lg,xl,2xl,3xl}` 仍存在（映射 1/2/4/6/8/12/16），**新代码用数字档位**。

### 6.2 圆角

基线 `--radius: 8px`、`--radius-lg: 14px`（tokens.css 出厂值 4/8，本项目在 theme.css 抬到 8/14 定稿——卡片和搜索框更柔和）。只此两档，不加中间值。

### 6.3 阴影

- `--shadow-sm: 0 1px 2px rgba(0,0,0,.05)` —— 静态卡片
- `--shadow-lg: 0 8px 30px rgba(0,0,0,.12)` —— 浮层、hover
- 暗色模式不单独配阴影，依赖 `--color-surface` 的提亮区分层级。

### 6.4 动效

`--transition-fast: 120ms ease`（hover/焦点态）、`--transition-base: 180ms ease`（展开/切换）。不引入超过 200ms 的 UI 过渡。

### 6.5 头像

`--avatar-size-{xs 18, sm 20, md 24, lg 32}`：xs 卡片 byline、sm 列表/文章 meta、md 精选文章 byline、lg 页脚站主头像。

---

## 七、布局（三栏文档壳）

| 令牌 | 值 | 说明 |
|---|---|---|
| `--content-width` | 680px | 文章正文列 |
| `--rail-width` | 200px | 左右栏（左导航、右 TOC） |
| `--wide-width` | 1200px | header/footer 容器上限 |
| `--nav-height` | 56px | sticky 头部 |
| `--search-input-width` | 180px | 头部搜索框 |

**断点语义**（来自实测，勿改）：

- `≤1199px`：砍右栏。宽度预算 `200+24+680+24+200=1128` + 48 padding + ~15 经典滚动条 ≈ 1191 → 所以是 1200。
- `≤999px`：砍左栏，导航进汉堡抽屉；页边距 `--spacing-6 → --spacing-4`，`--shell-pad-top: --spacing-12 → --spacing-8`（rail 的 sticky 位由 `--rail-sticky-top: calc(var(--nav-height) + 1px + var(--shell-pad-top))` 推导，**只动 --shell-pad-top，两处不会脱节**；`+1px` 是 header 底边框）。
- `≤640px`：搜索框转全宽，放弃居中。

**壳的规矩**（规范性，违反即 bug）：

1. `Base.astro` 独占网格；页面组件**禁止**自己声明外层 `max-width` / 水平 padding。
2. 右栏轨道**每页都在**（slot 只由文章页填充），保证正文列 x 坐标全站恒定。
3. `html { scrollbar-gutter: stable }` 不可去——否则短页无滚动条，clientWidth 差 ~15px，客户端导航时壳会横移。
4. `.shell` 必须 `align-items: start`，否则 sticky rail 失去滚动区间。
5. 头部与壳共用列几何（`.nav` 的 `grid-template-columns` 同 `.shell`）：头像落在左栏中线是免费结果，**不要手算 offset**。
6. 页脚常显：`body flex + .shell flex:1`（短页推底）与 `.site-footer sticky bottom`（长页拉回）两个声明缺一不可。层级：footer 90 < header 100 < 搜索下拉 1000。
7. 文章 meta（byline/日期/阅读时长/tags）是**标题下的一行**；hero 图在标题**上方**。不许把 meta 拆回左列。

---

## 八、组件主题接口（`--<库>-*` 前缀族）

第三方/平台组件暴露的自定义属性是官方上色通道，优先级顺序固定：

1. **设组件自己的 custom property** —— 自定义属性不参与 specificity 竞争，无 `!important`。例：`--emdash-search-bg`、`--emdash-math-*`（math 插件按 tone 覆盖：`.emdash-math[data-tone="accent"] { --emdash-math-bg: …; --emdash-math-border: … }`，只动一个 tone，其余保持插件默认）。
2. 组件硬编码的值（`border`/`border-radius`/`padding`/`font-size`）才允许 `!important`。

> 已知坑：`LiveSearch` 的 scoped 样式 specificity (0,2,0) 压过主题的 (0,1,0)，写在 `Base.astro` 里的覆盖会**静默失效**——所以 `check:shell` 断言的是搜索框的 **computed** 值，不是源码。

已注册的前缀族：`--emdash-search-*`（搜索）、`--emdash-math-*`（math 插件，含 bg/border/padding/radius 全套）。新组件接入时必须同样暴露前缀令牌，在本文档登记。

---

## 九、禁令汇总（评审时逐条对照）

1. 不加第二个 accent 色、不加彩色区块背景（§4.4 语义族仅限 callout 标题/边框）。
2. 不新增 `--wp-*` 令牌。
3. 不改 `tokens.css` 出厂值来实现定制——定制一律进 `theme.css`。
4. 不用展示型字体换掉 Public Sans；换衬线必须带 §5.4 的补偿。
5. 页面组件不声明外层 max-width/padding；右栏轨道不消失。
6. 不写超出 200ms 的 UI 过渡；不加第三档圆角。
7. 文案不用 stock blog copy；示例内容不用三连占位 post。
8. 图片 URL 只用 storageKey（`mediaUrl()/avatarUrl()`），不碰 `avatarMediaId`（404 但不报错的那种）。

---

## 十、工作流程与验证

改视觉的标准动作：

```bash
pnpm dev
scripts/shots.mjs        # 20 路由 × 3 断点 × 亮/暗 截图
pnpm check:shell         # 壳/头/脚几何、对齐、无漂移（49 项，computed 值断言）
pnpm check:spa           # 客户端导航 + TOC 回归
```

- **验证 CSS 时按 `<style>` 块切分后再 grep**——theme.css 的示例注释里含 `#0f766e`、`--radius: 8px` 这类值，直接 grep 页面 HTML 会先命中注释，看起来像「覆盖没生效」。
- `check:shell` 必须用**不带** Playwright 默认 `--hide-scrollbars` 的 Chrome 启动（滚动条宽度归零会掩盖一整类 bug）；新写的布局检查脚本同理。

---

## 十一、现状差异登记表

| 维度 | emdash-lab（目标形态） | citrus-grid（遗留源） | 处置 |
|---|---|---|---|
| 令牌前缀 | `--color-*` 标准族 | `--wp-*` | 按 §2.2 映射迁移 |
| 暗色机制 | `light-dark()` + `color-scheme` | `.dark` class + Tailwind variant | 统一到 §3 |
| 中性色 | 纯灰阶 | 暖纸调 | **§4.3 待定** |
| 品牌色 | `#e86233`（theme.css 已覆盖） | `#e86233` | 一致，即基线 |
| 字体管线 | Astro `fonts:` 离散字重 | 系统 `sans-serif`/`monospace` | 统一到 §5 |
| 语法高亮 | 未单独拆 | 完整 12×2 色板 | 迁移时带 §4.5 |
| 代码 callout | 走插件 tone 令牌 | `--wp-info/tip/warn/danger-title` | 统一到 §4.4 |

---

## 十二、相关文件索引

- **机器可读令牌**：`src/styles/tokens.css`（出厂值）+ `theme.css`（本项目基线覆盖）
- **视觉规范全文**：本文档 `DESIGN.md`
- **硬性规则与禁令**：`AGENTS.md`（Rules / What not to do）—— agent 会话加载版
- **踩坑叙事层**：`NOTES.md`（被推翻的做法、Windows 特异性坑、发现过程）
- **遗留调色板**：`../citrus-grid/src/styles/main.css`
- **迁移路径**：`.agents/skills/astro-theme-to-emdash/SKILL.md`
- **视觉实验场（非规范来源）**：`md-demo/`
---

## 附：相关文件索引

- 机器可读令牌：`emdash-lab/src/styles/tokens.css`（出厂值）+ `theme.css`（本项目基线覆盖）
- 机制与踩坑全记录：`emdash-lab/NOTES.md`（§三 样式系统、§七 截图验证）
- 壳与布局规则原文：`emdash-lab/AGENTS.md`（"The three-column shell"、"Visual character"、"What not to do"）
- 遗留调色板：`citrus-grid/src/styles/main.css`
- 迁移路径：`.agents/skills/astro-theme-to-emdash/SKILL.md`
- 视觉实验场（非规范来源）：`md-demo/`
