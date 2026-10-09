/**
 * 量测全站三栏布局。
 *
 * 核心验收：「右栏留空不渲染」—— 中栏左边缘 x 坐标必须全站一致。
 */
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://localhost:4321";
const browser = await chromium.launch({ channel: "chrome" });

const results = [];
const check = (name, ok, detail = "") => {
	results.push({ name, ok });
	console.log(`${ok ? "✔" : "✘"} ${name}${detail ? `  ${detail}` : ""}`);
};

const PAGES = {
	文章: "/posts/building-for-the-long-term",
	首页: "/",
	列表: "/posts",
	关于: "/pages/about",
	搜索: "/search",
};

// ---------- 1. 中栏位置全站一致（核心） ----------
console.log("\n=== 中栏左边缘一致性（1440px）===");
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const mains = {};
for (const [name, url] of Object.entries(PAGES)) {
	await page.goto(BASE + url, { waitUntil: "networkidle" });
	const box = await page.locator(".shell-main").first().boundingBox();
	mains[name] = box;
	console.log(`  ${name.padEnd(4)} x=${box.x.toFixed(0)} w=${box.width.toFixed(0)}`);
}
const xs = Object.values(mains).map((b) => Math.round(b.x));
const allSame = new Set(xs).size === 1;
check("中栏左边缘全站一致", allSame, `x = ${[...new Set(xs)].join(", ")}`);
check(
	"中栏列宽恒为 680",
	Object.values(mains).every((b) => Math.abs(b.width - 680) < 2),
	Object.entries(mains).map(([k, v]) => `${k}=${v.width.toFixed(0)}`).join(" "),
);
await page.close();

// ---------- 2. 断点行为 ----------
console.log("\n=== 断点行为 ===");
for (const w of [1440, 1200, 1199, 1000, 999, 640, 390]) {
	const p = await browser.newPage({ viewport: { width: w, height: 900 } });
	await p.goto(`${BASE}/posts/building-for-the-long-term`, { waitUntil: "networkidle" });

	const vis = async (sel) => {
		const el = p.locator(sel).first();
		return (await el.count()) ? await el.isVisible() : false;
	};
	const left = await vis(".rail--left");
	const right = await vis(".rail--right");
	const burger = await vis(".nav-burger");
	const toc = await p.locator(".toc-link").count();

	const expectLeft = w >= 1000;
	const expectRight = w >= 1200;
	const expectBurger = w < 1000;

	const ok =
		left === expectLeft && right === expectRight && burger === expectBurger;
	check(
		`${w}px`,
		ok,
		`左栏=${left ? "有" : "无"}(期望${expectLeft ? "有" : "无"}) 右栏=${right ? "有" : "无"}(期望${expectRight ? "有" : "无"}) 汉堡=${burger ? "有" : "无"}(期望${expectBurger ? "有" : "无"}) TOC链接=${toc}`,
	);

	// 非文章页右栏轨道保留但内容空
	if (w >= 1200) {
		await p.goto(BASE + "/", { waitUntil: "networkidle" });
		const rightRail = p.locator(".rail--right").first();
		const railBox = await rightRail.boundingBox();
		const railText = (await rightRail.textContent())?.trim() ?? "";
		check(
			`${w}px 首页右栏轨道在但为空`,
			railBox !== null && railText === "",
			`轨道 w=${railBox?.width.toFixed(0)} 文本长度=${railText.length}`,
		);
	}
	await p.close();
}

// ---------- 3. 头像 ----------
console.log("\n=== 头像 ===");
const p2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await p2.goto(BASE + "/", { waitUntil: "networkidle" });
const av = p2.locator(".rail-avatar").first();
if (await av.count()) {
	const box = await av.boundingBox();
	const radius = await av.evaluate((e) => getComputedStyle(e).borderRadius);
	const natural = await av.evaluate((e) => e.naturalWidth);
	const src = await av.getAttribute("src");
	check("头像存在", true);
	check("圆形", radius === "50%", radius);
	check("渲染 40px", Math.abs(box.width - 40) < 1, `${box.width.toFixed(0)}px`);
	check("服务端裁剪（naturalWidth ≥ 96）", natural >= 96, `naturalWidth=${natural}`);
	check("走 /_image 端点", src?.startsWith("/_image?") ?? false, src?.slice(0, 60));
} else {
	check("头像存在", false, "左栏没有 .rail-avatar");
}
await p2.close();

// ---------- 4. 中英各自正确 ----------
console.log("\n=== 中英对照 ===");
for (const [name, url, expect] of [
	["中文首页", "/", "EmDash 编辑部"],
	["英文首页", "/en", "EmDash Editorial"],
]) {
	const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
	await p.goto(BASE + url, { waitUntil: "networkidle" });
	const actual = (await p.locator(".rail-name").first().textContent())?.trim();
	check(`${name} 左栏名字`, actual === expect, `"${actual}"（期望 "${expect}"）`);
	await p.close();
}

// ---------- 5. 导航高亮 ----------
console.log("\n=== 当前页高亮 ===");
const p3 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
for (const [name, url, expectLabel] of [
	["文章页应高亮「文章」", "/posts/building-for-the-long-term", "文章"],
	["文章列表应高亮「文章」", "/posts", "文章"],
	["关于页应高亮「关于」", "/pages/about", "关于"],
	["英文文章列表应高亮 Posts", "/en/posts", "Posts"],
]) {
	await p3.goto(BASE + url, { waitUntil: "networkidle" });
	const current = (await p3.locator(".rail-nav-link.is-current").first().textContent())?.trim();
	check(name, current === expectLabel, `高亮="${current}"（期望 "${expectLabel}"）`);
}
await p3.close();

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} 通过`);
process.exit(failed ? 1 : 0);
