/**
 * 截图 emdash-lab 的关键路由，明暗两模式。
 *
 * 为什么不用官方 `pnpm screenshots`：
 *   1. 它依赖 `lsof`（本机 Windows 没有）来查/杀端口占用
 *   2. 它调用 `pnpm bootstrap`，但模板的 package.json 里已没有这个脚本
 *   3. 它依赖 `rsync` 做模板同步，本机同样没有
 * 所以这里用 playwright-core + 系统已有的 Chrome，绕开浏览器下载。
 *
 * 用法：
 *   node scripts/shots.mjs                  # 默认 http://[::1]:4321
 *   node scripts/shots.mjs --base http://localhost:4400
 *   node scripts/shots.mjs --only homepage  # 只截某个页面
 *
 * 注意服务器只监听 IPv6，所以 base URL 默认用 [::1] 而不是 localhost。
 */
import { chromium } from "playwright-core";
import { mkdirSync, existsSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "shots");

/**
 * 与官方 templates/screenshots.json 的 blog 条目对齐，外加几个 lab 特有的。
 * 无后缀 = 默认语言（zh，无前缀）；`En` 后缀 = 英文（/en 前缀）。
 */
const PAGES = {
  homepage: "/",
  posts: "/posts",
  post: "/posts/building-for-the-long-term",
  math: "/posts/math-plugin-verification",
  clash: "/posts/claude-clash-direct-routing",
  about: "/pages/about",
  search: "/search?q=test",
  category: "/category/development",
  tag: "/tag/webdev",
  notfound: "/nonexistent",

  // 英文变体，用来校验双语渲染与语言切换器
  homepageEn: "/en",
  postsEn: "/en/posts",
  postEn: "/en/posts/building-for-the-long-term",
  mathEn: "/en/posts/math-plugin-verification",
  clashEn: "/en/posts/claude-clash-direct-routing",
  aboutEn: "/en/pages/about",
  searchEn: "/en/search?q=test",
  categoryEn: "/en/category/development",
  tagEn: "/en/tag/webdev",
  notfoundEn: "/en/nonexistent",
};

const BREAKPOINTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

const SCHEMES = ["light", "dark"];

/** 解析 --base / --only 参数。 */
function parseArgs(argv) {
  const out = { base: "http://[::1]:4321", only: null, fullPage: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--base") out.base = argv[++i];
    else if (argv[i] === "--only") out.only = argv[++i];
    else if (argv[i] === "--full") out.fullPage = true;
  }
  return out;
}

/**
 * 移除 dev 模式的可视化编辑工具栏，避免污染截图。
 * 官方截图脚本用的是 [data-emdash-toolbar]；这里再兜一层常见的 dev 工具。
 */
const HIDE_DEV_CHROME = () => {
  for (const sel of [
    "[data-emdash-toolbar]",
    "astro-dev-toolbar",
    "[data-astro-dev-toolbar]",
  ]) {
    document.querySelectorAll(sel).forEach((el) => el.remove());
  }
};

const args = parseArgs(process.argv.slice(2));

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

// 用系统 Chrome，不下载 Playwright 自带的浏览器
const browser = await chromium.launch({ channel: "chrome" });

const targets = args.only
  ? Object.entries(PAGES).filter(([name]) => name === args.only)
  : Object.entries(PAGES);

if (targets.length === 0) {
  console.error(`没有匹配的页面：${args.only}`);
  console.error(`可选：${Object.keys(PAGES).join(", ")}`);
  await browser.close();
  process.exit(1);
}

let count = 0;
const failures = [];

for (const [name, path] of targets) {
  for (const scheme of SCHEMES) {
    const context = await browser.newContext({
      viewport: BREAKPOINTS.desktop,
      colorScheme: scheme,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    const url = `${args.base}${path}`;
    try {
      const resp = await page.goto(url, {
        waitUntil: "networkidle",
        timeout: 45000,
      });
      const status = resp?.status() ?? 0;

      await page.evaluate(HIDE_DEV_CHROME);
      await page.evaluate(() => window.scrollTo(0, 0));
      // 等字体和懒加载图片落位
      await page.waitForTimeout(600);

      const file = resolve(OUT, `${name}-${scheme}.png`);
      await page.screenshot({ path: file, fullPage: args.fullPage });
      count++;
      console.log(`  ${String(status).padEnd(4)} ${name}-${scheme}.png`);
    } catch (err) {
      failures.push(`${name}-${scheme}: ${err.message}`);
      console.log(`  失败  ${name}-${scheme}  ${err.message}`);
    }

    await context.close();
  }
}

await browser.close();

console.log(`\n已生成 ${count} 张截图 → shots/`);
if (failures.length > 0) {
  console.error(`\n${failures.length} 张失败：`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
