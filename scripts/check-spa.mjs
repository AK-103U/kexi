/**
 * 验证 ClientRouter 的客户端导航是否真的生效。
 *
 * 为什么需要它：ClientRouter 失效是**静默**的 —— 页面照样跳、内容照样对、
 * curl 到的 HTML 也完全正常，只是偷偷退回了整页刷新。肉眼和截图都分辨不出来，
 * 而 prefetch、过渡动画、状态保持全都悄悄没了。
 *
 * 判据：在 window 上打一个标记，点站内链接后标记还在 → 说明没有整页刷新
 * （整页刷新会重建 window，标记随之消失）。同时检查 <html lang>、<title>、
 * 正文是否跟着换，以及有没有 console 报错。
 *
 * 用法（需要 dev server 在跑）：
 *   pnpm dev
 *   pnpm check:spa                                  # 默认 http://localhost:4321
 *   node scripts/check-spa.mjs http://localhost:4321
 */
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://localhost:4321";

// 去掉 Playwright 默认的 --hide-scrollbars：带上它滚动条宽度恒为 0，
// 量不出「短页面没有滚动条导致居中外壳横移」这类漂移。见 check-shell.mjs。
const browser = await chromium.launch({
	channel: "chrome",
	ignoreDefaultArgs: ["--hide-scrollbars"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const consoleMsgs = [];
const pageErrors = [];
page.on("console", (m) => {
	if (m.type() === "error" || m.type() === "warning") consoleMsgs.push(`[${m.type()}] ${m.text()}`);
});
page.on("pageerror", (e) => pageErrors.push(String(e)));
const badResponses = [];
page.on("response", (r) => {
	if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`);
});

const results = [];
const check = (name, ok, detail = "") => {
	results.push({ name, ok, detail });
	console.log(`${ok ? "✔" : "✘"} ${name}${detail ? `  ${detail}` : ""}`);
};

// ---------- 1. 首页 → 点语言切换器 ----------
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.evaluate(() => {
	window.__spaMarker = "kept";
});

const beforeTitle = await page.title();
const beforeLang = await page.evaluate(() => document.documentElement.lang);

const switcher = page.locator('a[href="/en"]').first();
check("首页存在指向 /en 的切换链接", (await switcher.count()) > 0);

await switcher.click();
await page.waitForURL(`${BASE}/en`, { timeout: 10000 });
await page.waitForTimeout(800);

const markerAfter = await page.evaluate(() => window.__spaMarker);
const afterLang = await page.evaluate(() => document.documentElement.lang);
const afterTitle = await page.title();

check("切语言没有整页刷新（window 标记存活）", markerAfter === "kept", `marker=${markerAfter}`);
check("<html lang> 跟着更新", afterLang === "en-US", `${beforeLang} → ${afterLang}`);
check("正文换成英文", (await page.locator("text=Latest").count()) > 0);
// 首页两种语言的 title 都是站名（settings 无 locale），标题变化留到详情页验
console.log(`  （首页 title 两语言相同，符合预期：${JSON.stringify(beforeTitle)}）`);

// ---------- 2. 列表 → 详情（再点一次，确认第二次导航也走客户端） ----------
await page.evaluate(() => {
	window.__spaMarker2 = "kept2";
});
const postLink = page.locator('a[href^="/en/posts/"]').first();
check("英文首页存在文章链接", (await postLink.count()) > 0);
if ((await postLink.count()) > 0) {
	await postLink.click();
	await page.waitForURL(/\/en\/posts\//, { timeout: 10000 });
	await page.waitForTimeout(800);
	const marker2 = await page.evaluate(() => window.__spaMarker2);
	check("列表→详情也是客户端导航", marker2 === "kept2", `marker=${marker2}`);
	check("详情页有正文", (await page.locator("article").count()) > 0);
	const postTitle = await page.title();
	check("<title> 在详情页跟着更新", postTitle !== beforeTitle && postTitle.includes("EmDash Lab"), postTitle);
}

// ---------- 3. 浏览器后退 ----------
await page.goBack();
await page.waitForTimeout(800);
check("后退回到 /en", new URL(page.url()).pathname === "/en", page.url());

// ---------- 4. TOC 在客户端导航后仍有内容 ----------
//
// 这是抽 TableOfContents 组件前的真实 bug：模块脚本只执行一次，从一篇文章
// 客户端导航到另一篇时目录是空的。走「文章 → 列表 → 文章」这条全客户端路径
// 才复现（直接进文章页是整页加载，脚本会跑）。
// 走「文章 → 文章列表 → 另一篇文章」，全程客户端导航。
await page.goto(`${BASE}/posts/building-for-the-long-term`, { waitUntil: "networkidle" });
const tocOnLoad = await page.locator(".toc-link").count();
check("整页加载文章页 TOC 有内容", tocOnLoad > 0, `${tocOnLoad} 条`);

// 公开外壳只有一份左栏导航；这里只点当前可见的 /posts 链接。
await page.locator('a[href="/posts"]:visible').first().click(); // → 列表页
await page.waitForURL(`${BASE}/posts`, { timeout: 10000 });
await page.waitForTimeout(600);
await page.evaluate(() => {
	window.__spaMarker3 = "kept3";
});
await page.locator("a.post-link").first().click(); // → 另一篇文章
await page.waitForLoadState("networkidle");
await page.waitForTimeout(900);

const marker3 = await page.evaluate(() => window.__spaMarker3);
const tocAfterNav = await page.locator(".toc-link").count();
const tocLists = await page.locator(".toc-list").count();

check("导航仍是客户端（标记存活）", marker3 === "kept3", `marker=${marker3}`);
check(
	"客户端导航后 TOC 不为空",
	tocAfterNav > 0,
	`${tocAfterNav} 条（抽组件前此处为 0）`,
);
check("TOC 幂等（只有一个 ul）", tocLists === 1, `${tocLists} 个`);

// ---------- 5. 报错 ----------
const realErrors = pageErrors.filter((e) => !/favicon|404 \(Not Found\)/i.test(e));
check("无 page error", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));

if (badResponses.length) {
	console.log("\n>=400 的请求：");
	for (const b of [...new Set(badResponses)].slice(0, 10)) console.log("  " + b);
}

const noisy = consoleMsgs.filter((m) => !/DevTools|favicon/i.test(m));
if (noisy.length) {
	console.log("\nconsole 输出：");
	for (const m of noisy.slice(0, 10)) console.log("  " + m);
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
