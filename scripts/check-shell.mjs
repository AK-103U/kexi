/**
 * 量测全站三栏布局。
 *
 * 核心验收：「右栏留空不渲染」—— 中栏左边缘 x 坐标必须全站一致。
 */
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://localhost:4321";
/*
 * ⚠️ 必须去掉 Playwright 默认的 `--hide-scrollbars`。
 * 带上它滚动条宽度恒为 0，`clientWidth` 永远等于视口宽 —— 「一屏装得下的
 * 页面没有滚动条、居中外壳因此横移」这类漂移就永远量不出来（本文件曾经
 * 因此在漂移存在的情况下全绿）。去掉后本机量到 15px。
 */
const browser = await chromium.launch({
	channel: "chrome",
	ignoreDefaultArgs: ["--hide-scrollbars"],
});

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
const av = p2.locator(".site-identity-avatar").first();
if (await av.count()) {
	const box = await av.boundingBox();
	const radius = await av.evaluate((e) => getComputedStyle(e).borderRadius);
	const natural = await av.evaluate((e) => e.naturalWidth);
	const src = await av.getAttribute("src");
	check("头像存在", true);
	check("圆形", radius === "50%", radius);
	check("渲染 32px", Math.abs(box.width - 32) < 1, `${box.width.toFixed(0)}px`);
	check("服务端裁剪（naturalWidth ≥ 96）", natural >= 96, `naturalWidth=${natural}`);
	check("走 /_image 端点", src?.startsWith("/_image?") ?? false, src?.slice(0, 60));
} else {
	check("头像存在", false, "页头没有 .site-identity-avatar");
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
	const actual = (await p.locator(".site-identity-name").first().textContent())?.trim();
	check(`${name} 页头名字`, actual === expect, `"${actual}"（期望 "${expect}"）`);
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

// ---------- 6. 对齐 ----------
//
// 这一段的轴换了：站主身份（头像 + 名字）从左栏搬到了页头左侧，于是
// 「头像与左栏内容共轴」成了跨区域的对齐 —— 靠的是 .nav 与 .shell 共用
// 同一套列几何（第 1 列都是 --rail-width，两侧 gap / padding 一致），
// 而不是任何手算偏移。断言因此量的是页头头像 cx 与左栏导航 cx 之差。
console.log("\n=== 对齐 ===");
const p4 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await p4.goto(BASE + "/posts/building-for-the-long-term", { waitUntil: "networkidle" });

const align = await p4.evaluate(() => {
	const center = (el) => {
		const b = el.getBoundingClientRect();
		return b.x + b.width / 2;
	};
	const wrap = document.querySelector(".rail-content");
	const wrapC = center(wrap);
	// 左栏里的一切都要在同一轴上，而不只是第一个
	const links = [...document.querySelectorAll(".rail-nav-link")];
	const linkMax = Math.max(...links.map((l) => Math.abs(center(l) - wrapC)));

	const avatar = document.querySelector(".site-identity-avatar");
	const name = document.querySelector(".site-identity-name");
	const navList = document.querySelector(".rail-nav-list");
	return {
		wrapC,
		avatarC: center(avatar),
		nameC: center(name),
		navC: center(navList),
		dev: {
			nav: Math.abs(center(navList) - wrapC),
			links: linkMax,
		},
		// 头像与名字是水平相邻的（名字绝对定位挂在头像右侧），不再上下排
		avatarLeftOfName:
			avatar.getBoundingClientRect().right <= name.getBoundingClientRect().left + 1,
	};
});

check(
	"页头头像与左栏内容共轴（<0.5px）",
	Math.abs(align.avatarC - align.navC) < 0.5,
	`头像 cx=${align.avatarC.toFixed(1)} / 左栏导航 cx=${align.navC.toFixed(1)}`,
);
for (const [label, d] of Object.entries(align.dev)) {
	check(`左栏「${label}」在中垂线上`, d < 0.5, `偏差 ${d.toFixed(2)}px`);
}
check(
	"头像在名字左侧",
	align.avatarLeftOfName,
	`头像 cx=${align.avatarC.toFixed(1)} 名字 cx=${align.nameC.toFixed(1)}`,
);

// 共轴要在每个桌面断点都成立（<1000px 页头身份整块隐藏，不参与）
const alignDev = [];
for (const w of [1440, 1280, 1200, 1199, 1100, 1000]) {
	await p4.setViewportSize({ width: w, height: 900 });
	await p4.waitForTimeout(150);
	const d = await p4.evaluate(() => {
		const c = (s) => {
			const el = document.querySelector(s);
			const b = el.getBoundingClientRect();
			return b.x + b.width / 2;
		};
		return c(".site-identity-avatar") - c(".rail-nav-list");
	});
	alignDev.push(`${w}:${d.toFixed(1)}`);
}
check(
	"头像与左栏共轴在各桌面断点成立（±0.5px）",
	alignDev.every((s) => Math.abs(Number(s.split(":")[1])) < 0.5),
	alignDev.join(" "),
);

// nav-right 落在中栏中垂线（.nav 与 .shell 同几何，所以中栏中轴 = 页面中轴）。
// 移动端搜索框占满剩余宽度，不参与。
const navDev = [];
for (const w of [1440, 1280, 1200, 1199, 1100, 1000, 999, 800]) {
	await p4.setViewportSize({ width: w, height: 900 });
	await p4.waitForTimeout(120);
	const d = await p4.evaluate(() => {
		const el = document.querySelector(".nav-right");
		const main = document.querySelector(".shell-main");
		const a = el.getBoundingClientRect();
		const b = main.getBoundingClientRect();
		return a.x + a.width / 2 - (b.x + b.width / 2);
	});
	navDev.push(`${w}:${d.toFixed(1)}`);
	if (Math.abs(d) >= 1) check(`nav-right 在 ${w}px 对齐中栏中轴`, false, `偏差 ${d.toFixed(1)}px`);
}
check(
	"nav-right 在各桌面断点对齐中栏中轴（±1px）",
	navDev.every((s) => Math.abs(Number(s.split(":")[1])) < 1),
	navDev.join(" "),
);

// 页头各元素横向中线对齐（不同高度的控件落在同一条水平线上）
await p4.setViewportSize({ width: 1440, height: 900 });
await p4.waitForTimeout(150);
const cys = await p4.evaluate(() => {
	const cy = (s) => {
		const b = document.querySelector(s).getBoundingClientRect();
		return b.y + b.height / 2;
	};
	return {
		search: cy(".site-search-input"),
		lang: cy(".lang-toggle"),
		theme: cy(".theme-btn"),
		avatar: cy(".site-identity-avatar"),
		header: (() => {
			const b = document.querySelector(".site-header").getBoundingClientRect();
			return b.y + b.height / 2;
		})(),
	};
});
const cyVals = [cys.search, cys.lang, cys.theme, cys.avatar];
check(
	"页头元素横向中线对齐（±1px）",
	Math.max(...cyVals) - Math.min(...cyVals) < 1,
	`搜索=${cys.search.toFixed(1)} 语言=${cys.lang.toFixed(1)} 主题=${cys.theme.toFixed(1)} 头像=${cys.avatar.toFixed(1)}`,
);
check(
	"中线 = 页头几何中线",
	Math.abs(cys.search - cys.header) < 1.5,
	`元素 ${cys.search.toFixed(1)} / 页头 ${cys.header.toFixed(1)}`,
);

/*
 * 搜索框：无边框 + 浅灰底。
 *
 * 这一条差点漏掉 —— 注入「底色改回 --color-bg（白）」的破坏时全绿通过，
 * 因为当时没有任何断言盯着计算样式。LiveSearch 是第三方组件，它自带的
 * `.emdash-live-search-input[data-astro-cid-*]` 特异性 (0,2,0) 压过主题的
 * :global(.class) (0,1,0)，主题里那几行很容易变成静默失效的死代码，所以
 * 必须量计算值而不是读 CSS 源。
 */
const searchStyle = await p4.evaluate(() => {
	const cs = getComputedStyle(document.querySelector(".site-search-input"));
	const navRight = getComputedStyle(document.querySelector(".nav-right"));
	const toggles = getComputedStyle(document.querySelector(".nav-toggles"));
	return {
		borderWidth: cs.borderTopWidth,
		background: cs.backgroundColor,
		navRightGap: navRight.columnGap,
		togglesGap: toggles.columnGap,
	};
});
check("搜索框无边框", searchStyle.borderWidth === "0px", searchStyle.borderWidth);
check(
	"搜索框浅灰底（--color-surface）",
	searchStyle.background === "rgb(247, 247, 247)",
	searchStyle.background,
);
check("图标与搜索框间距 16px", searchStyle.navRightGap === "16px", searchStyle.navRightGap);
check(
	"图标之间间距 12–16px",
	["12px", "14px", "16px"].includes(searchStyle.togglesGap),
	searchStyle.togglesGap,
);

// 汉堡出现时也不该把中列挤偏（这是 minmax(0,1fr) 而非裸 1fr 的理由）
await p4.setViewportSize({ width: 999, height: 900 });
await p4.waitForTimeout(120);
const burgerVisible = await p4.locator(".nav-burger").isVisible();
check("999px 汉堡可见（对照条件成立）", burgerVisible);
await p4.close();

// ---------- 7. SPA 导航不漂移 ----------
//
// 两条曾经真实存在的漂移，都只在「客户端导航」时显形：
//   a) 短页面（/pages/about，正好一屏高）没有滚动条，clientWidth 比长页面宽
//      15px，居中的外壳整体横移。
//   b) 在滚动状态下切页时 scrollY 归零，rail 从 sticky 位弹回静止位。
// 修法是 html { scrollbar-gutter: stable } 与「sticky top = 页头高 + 外壳上边距」。
console.log("\n=== SPA 导航不漂移 ===");
const p5 = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const geom = () =>
	p5.evaluate(() => {
		const box = (s) => {
			const el = document.querySelector(s);
			if (!el) return null;
			const b = el.getBoundingClientRect();
			return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1) };
		};
		return {
			main: box(".shell-main"),
			railL: box(".rail--left"),
			shell: box(".shell"),
			header: box(".site-header"),
			headerAvatar: box(".site-identity-avatar"),
			scrollY: Math.round(window.scrollY),
		};
	});

// 静止参考：整页加载时的各区域位置（同一页面，scroll 0）
await p5.goto(BASE + "/posts", { waitUntil: "networkidle" });
await p5.waitForTimeout(300);
const rest = await geom();

// a) 列表 → /pages/about（无滚动条的短页面）
await p5.locator('a[href="/pages/about"]:visible').first().click();
await p5.waitForURL("**/pages/about", { timeout: 10000 });
await p5.waitForTimeout(1200);
const afterAbout = await geom();
check(
	"切到 /pages/about 中栏不横移",
	Math.abs(afterAbout.main.x - rest.main.x) < 1,
	`x ${rest.main.x} → ${afterAbout.main.x}`,
);
check(
	"切到 /pages/about 左栏不横移",
	Math.abs(afterAbout.railL.x - rest.railL.x) < 1,
	`x ${rest.railL.x} → ${afterAbout.railL.x}`,
);
// 页头与页脚是「静态范围」：不随页面高度变化，切页时一动不动
check(
	"切到 /pages/about 页头不横移",
	Math.abs(afterAbout.header.x - rest.header.x) < 1,
	`x ${rest.header.x} → ${afterAbout.header.x}`,
);
check(
	"切到 /pages/about 页头头像不横移",
	Math.abs(afterAbout.headerAvatar.x - rest.headerAvatar.x) < 1,
	`x ${rest.headerAvatar.x} → ${afterAbout.headerAvatar.x}`,
);

// b) 滚动不该移动 rail —— sticky 位必须与静止位重合
//
// 这条要量的是「滚动时」与「静止时」的差，不是「切页后」与「静止时」的差：
// 后者两边都是静止位，恒真，抓不到 bug（试过，旧的 sticky top 也能蒙混过去）。
// 不变量是：rail 无论在滚动中还是切页后，位置都该与静止时一致。
await p5.goto(BASE + "/posts/notes-on-simplicity", { waitUntil: "networkidle" });
await p5.waitForTimeout(300);
const postRest = await geom();
await p5.evaluate(() => window.scrollTo(0, 900));
await p5.waitForTimeout(400);
const scrolled = await geom();
check(
	"滚动时左栏不移动（sticky 位 = 静止位）",
	Math.abs(scrolled.railL.y - postRest.railL.y) < 1,
	`静止 ${postRest.railL.y} → 滚动 900 后 ${scrolled.railL.y}`,
);

await p5.locator('a[href="/posts"]:visible').first().click();
await p5.waitForURL("**/posts", { timeout: 10000 });
await p5.waitForTimeout(1200);
const afterScrollNav = await geom();
check(
	"滚动状态下切页，左栏 y 不弹动",
	Math.abs(afterScrollNav.railL.y - rest.railL.y) < 1,
	`静止 ${rest.railL.y} / 滚动时 ${scrolled.railL.y} / 切页后 ${afterScrollNav.railL.y}`,
);
check(
	"滚动状态下切页，中栏 x 不横移",
	Math.abs(afterScrollNav.main.x - rest.main.x) < 1,
	`x ${rest.main.x} → ${afterScrollNav.main.x}`,
);
// 滚动中页头是 sticky 的（永远 y=0），页脚常驻底部 —— 两者切页后都该原位
check(
	"滚动状态下切页，页头 y 不弹动",
	Math.abs(afterScrollNav.header.y - rest.header.y) < 1,
	`静止 ${rest.header.y} / 滚动时 ${scrolled.header.y} / 切页后 ${afterScrollNav.header.y}`,
);
check("切页后 scrollY 归零（对照条件成立）", afterScrollNav.scrollY === 0);
await p5.close();

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} 通过`);
process.exit(failed ? 1 : 0);
